import { computed, ref, watch } from "vue";
import { Endpoints } from "@/constants/endpoints";
import { HttpStatus } from "@/constants/http";
import { Limits } from "@/constants/limits";
import { Messages } from "@/constants/messages";
import { mailBudgetOf, retryAfterFrom, useCountdown } from "@/composables/useCountdown";
import { useRetryHold } from "@/composables/useRetryHold";
import { apiRequest, isLoggedOutAnswer } from "@/scripts/api/client";
import {
  confirmationCodeError,
  normalizeEmail,
  registerFieldOf,
  type RegisterField
} from "@/scripts/authentication/register";
import { fetchUserDetails } from "@/scripts/authentication/user";

/** The API sends at most one code a minute per address. */
export const RESEND_COOLDOWN_SECONDS = Limits.Code.cooldownSeconds;

/** Where the resend countdown is kept, so a reload doesn't forget it (one address at a time). */
export const COOLDOWN_STORAGE_KEY = "register-cooldown";
/**
 * Where the wait for the day's used-up registration mail is kept (vb2007/vb2007.hu-api#468). The
 * API refuses it for every address alike, so it's one wait under one id, for Register and Resend.
 */
export const REGISTRATION_BUDGET_STORAGE_KEY = "register-mail-budget";
export const REGISTRATION_BUDGET_ID = "registration";

type Countdown = ReturnType<typeof useCountdown>;

/** What confirming the code led to. */
export type RegisterCodeResult =
  /** The account exists and the session cookie works. */
  | "logged-in"
  /** The account exists, but the browser didn't keep the session cookie. */
  | "created"
  /**
   * The API refused a field of the form (`formProblem`): a username taken meanwhile, or one or a
   * password outside the length rules. The waiting registration and its code still work.
   */
  | "fix-form"
  /** The address already has an account (`formProblem`); the waiting registration is gone. */
  | "account-exists"
  /**
   * The account the code created was deleted before its session started: the code
   * is spent and no registration is waiting, so the form is next (`Messages.Auth.registrationAccountRemoved`).
   */
  | "account-gone"
  /** Nothing changed; `codeFieldError` or `codeError` says why. */
  | "failed";

/**
 * What a resend did: the API took it (it mails a waiting registration a new code, unless one went
 * out in the last minute or the mail fails, which keeps the code from before), or it didn't (the
 * day's registration mail used up, a rate limit, the server or the network), so nothing changed.
 * "left" when the step was left before the answer came: then the answer was ignored.
 */
export type ResendOutcome = "sent" | "failed" | "left";

/** A refusal about one of the register form's fields, to show under it. */
export interface FormProblem {
  field: RegisterField;
  message: string;
}

/** What the step tells about the address's code. */
export type CodeNotice =
  /** The register form just had it mailed. */
  | "sent"
  /**
   * A resend the API took: whether or not a registration waits, and whether a new code went out or
   * the one before stands, only the latest code to arrive works.
   */
  | "resent"
  /** The user already has one, e.g. after a reload; nothing was sent. */
  | "earlier"
  /**
   * Registering again within the minute: the code from then still works. Once the minute is over
   * it turns into "earlier".
   */
  | "recent"
  /** Back from fixing the form: nothing was sent, and the code typed before is kept. */
  | "kept"
  /**
   * A resend the API turned away with a 503 (the day's registration mail is used up, before it
   * looked at the address, or a failed send): it made no new code, so a code that reached the
   * address in the last minutes it works for, if any did, still works.
   */
  | "unsent";

/**
 * The register form's second step (vb2007/vb2007.hu-api#28): the code mailed after
 * POST /auth/register's 202 creates the account with the form's username and password
 * (vb2007/vb2007.hu-api#295), and a new one can be sent once a minute.
 */
export const useRegisterCode = () => {
  /** Where the code went; empty while the form is shown. */
  const email = ref("");
  const notice = ref<CodeNotice>("sent");
  const isVerifying = ref(false);
  const isResending = ref(false);
  /** What went wrong, when it isn't the typed code's fault (limits, mail, the network). */
  const codeError = ref("");
  /** What's wrong with the typed code itself: not 6 digits, or the API's 400. */
  const codeFieldError = ref("");
  /** Set with a "fix-form" or "account-exists" result: what the form shows, under which field. */
  const formProblem = ref<FormProblem>();
  const cooldown = useCountdown(COOLDOWN_STORAGE_KEY);
  /** The address the countdown holds back; any other can be sent a code right away. */
  const cooldownFor = ref("");
  /** Set while `codeError` is why a countdown holds the resend key: it goes when that one ends. */
  let errorEndsWith: Countdown | undefined;
  /**
   * Runs after the 503 for the day's used-up registration mail, until it starts over: it holds
   * Resend for every address, and Register (see `RegisterForm`), also after a reload.
   */
  const budget = useCountdown(REGISTRATION_BUDGET_STORAGE_KEY);
  budget.resume(REGISTRATION_BUDGET_ID);
  const budgetWaiting = budget.active;

  const cooldownWaiting = computed(
    () => cooldown.active.value && normalizeEmail(cooldownFor.value) === normalizeEmail(email.value)
  );
  const resendWaiting = computed(() => cooldownWaiting.value || budgetWaiting.value);
  /** Whichever wait holds the resend key longer, the budget's or the address's. */
  const resendWait = (): Countdown =>
    budgetWaiting.value &&
    (!cooldownWaiting.value || budget.remaining.value >= cooldown.remaining.value)
      ? budget
      : cooldown;
  /** The seconds the resend key counts down; 0 while it doesn't wait. */
  const resendIn = computed(() => (resendWaiting.value ? resendWait().remaining.value : 0));
  /** Why the resend key waits, as its countdown keeps it; "" when nothing has to be said. */
  const resendNote = computed(() => (resendWaiting.value ? resendWait().note.value : ""));
  /**
   * After the code checks' 429 (too many wrong codes, or the daily cap, where even the right code
   * is refused), Confirm code waits for the address; another address can be confirmed at once.
   */
  const verifyHold = useRetryHold(codeError);
  const heldId = () => normalizeEmail(email.value);
  const verifyWaiting = computed(() => verifyHold.isHeld(heldId()));
  /** The error to show: `codeError`, or why Confirm code waits, also once it was cleared. */
  const shownError = computed(() => verifyHold.shown(heldId()));
  /** The wait in words, read out with the hold's message. */
  const verifySpoken = computed(() => verifyHold.spokenFor(heldId()));
  /** Held past the wrong codes' window: the daily cap, which a new code doesn't lift. */
  const verifyCapped = computed(
    () => verifyWaiting.value && verifyHold.seconds.value > Limits.Code.failedChecksWindowSeconds
  );

  /** Shows one problem at a time; an empty message clears both. */
  const showError = (message: string, endsWith?: Countdown) => {
    codeError.value = message;
    codeFieldError.value = "";
    errorEndsWith = endsWith;
  };

  const showCodeProblem = (message: string) => {
    showError("");
    codeFieldError.value = message;
  };

  /** Holds the resend key back; `reason` is kept with the wait, to show again after a reload. */
  const holdResend = (seconds: number, reason = "") => {
    cooldownFor.value = email.value;
    cooldown.start(seconds, normalizeEmail(email.value), reason);
  };

  /** Holds Register and Resend until the day's registration mail starts over, for any address. */
  const holdForBudget = (seconds: number, reason: string) =>
    budget.start(seconds, REGISTRATION_BUDGET_ID, reason);

  watch(budget.active, (active) => {
    if (!active && errorEndsWith === budget) showError("");
  });

  watch(cooldown.active, (active) => {
    if (active) return;
    if (errorEndsWith === cooldown) {
      showError("");
    }
    // "Less than a minute ago" stops being true with the minute: then it's a code mailed earlier.
    if (notice.value === "recent") {
      notice.value = "earlier";
    }
  });

  /**
   * Opens the step for `address`; `waitSeconds` holds resending back that long. Without it, a
   * countdown kept for the address (e.g. from before a reload) picks up where it was, with the
   * refused resend's message that started it.
   */
  const open = (address: string, kind: CodeNotice, waitSeconds = 0) => {
    email.value = address;
    notice.value = kind;
    showError("");
    if (waitSeconds > 0) {
      holdResend(waitSeconds);
      return;
    }
    if (cooldown.resume(normalizeEmail(address))) {
      cooldownFor.value = address;
    }
    // Kept or still running in memory (e.g. without sessionStorage), the wait says why again.
    if (resendWaiting.value) {
      showError(resendNote.value, resendWait());
    }
  };

  /** Back to the form, e.g. to fix a mistyped address. The countdown keeps running for it. */
  const leave = () => {
    email.value = "";
    showError("");
  };

  /** Confirms `code`, creating the account with `username` and `password` from the form. */
  const verify = async (
    code: string,
    username: string,
    password: string
  ): Promise<RegisterCodeResult> => {
    const problem = confirmationCodeError(code);
    if (problem) {
      showCodeProblem(problem);
      return "failed";
    }
    isVerifying.value = true;
    showError("");
    formProblem.value = undefined;

    const result = await apiRequest(Endpoints.Auth.registerVerify, {
      body: { email: email.value, code: code.replace(/\s/g, ""), username, password },
      failure: Messages.EmailCode.confirmFailed,
      // A wrong code, the form's refusals and the account vanishing are answers the step shows, not faults.
      quietStatuses: [HttpStatus.BadRequest, HttpStatus.Conflict, HttpStatus.Forbidden]
    });

    let outcome: RegisterCodeResult = "failed";
    const field = result.ok ? undefined : registerFieldOf(result.error);
    if (result.ok) {
      // The 201 set the session cookie; only the API can tell whether the browser kept it.
      outcome = (await fetchUserDetails()) ? "logged-in" : "created";
    } else if (result.status === HttpStatus.BadRequest && field) {
      // The username's or password's length rule, checked before the code: no try was spent.
      formProblem.value = { field, message: result.error };
      outcome = "fix-form";
    } else if (result.status === HttpStatus.BadRequest) {
      // A wrong, expired or used code.
      showCodeProblem(result.error);
    } else if (result.status === HttpStatus.Conflict && field === "username") {
      // Waiting registrations don't hold a name: the code still works with another one.
      formProblem.value = {
        field,
        message: Messages.Auth.usernameTakenMeanwhile(Limits.Code.registerValidMinutes)
      };
      outcome = "fix-form";
    } else if (result.status === HttpStatus.Conflict && field === "email") {
      // The address has an account, so the API dropped the waiting registration.
      formProblem.value = { field, message: Messages.Auth.accountExists };
      outcome = "account-exists";
    } else if (isLoggedOutAnswer(result.status, result.error)) {
      // The visitor has no session yet, so only the account vanishing meanwhile can answer this.
      outcome = "account-gone";
    } else {
      // 429, the server, the network, or a refusal that names no field.
      showError(result.error);
      if (result.status === HttpStatus.TooManyRequests) {
        verifyHold.start(retryAfterFrom(result.body), heldId());
      }
    }
    isVerifying.value = false;

    return outcome;
  };

  /**
   * Asks for a new code, which replaces the old one if a registration is waiting and its last code
   * is over a minute old. Returns whether the API took the resend.
   */
  const resend = async (): Promise<ResendOutcome> => {
    isResending.value = true;
    showError("");
    const address = email.value;

    const result = await apiRequest(Endpoints.Auth.registerResend, {
      body: { email: address },
      failure: Messages.EmailCode.resendFailed
    });

    let outcome: ResendOutcome = "failed";
    if (email.value !== address) {
      // The step was left (or opened for another address) meanwhile: the answer is about a step
      // that's gone, so it changes nothing here, least of all the wait kept for another address.
      outcome = "left";
    } else if (result.ok) {
      // The same 200 whatever happened, so the minute starts after every one, as after registering.
      notice.value = "resent";
      outcome = "sent";
      holdResend(RESEND_COOLDOWN_SECONDS);
    } else if (result.status === HttpStatus.TooManyRequests) {
      // A rate limiter (e.g. too many e-mails) only says to try later, which the key times.
      holdResend(retryAfterFrom(result.body), result.error);
      showError(result.error, cooldown);
    } else {
      const budgetWait = mailBudgetOf(result);
      if (budgetWait !== undefined) {
        // The day's registration mail is used up, for every address: every resend (and Register)
        // gets the same 503 until it starts over, so both wait that long.
        holdForBudget(budgetWait, result.error);
        showError(result.error, budget);
      } else {
        showError(result.error);
      }
      // Either 503 made no new code, so a code that reached the address before still works.
      if (result.status === HttpStatus.ServiceUnavailable) notice.value = "unsent";
    }
    isResending.value = false;

    return outcome;
  };

  return {
    email,
    notice,
    isVerifying,
    isResending,
    codeError,
    codeFieldError,
    formProblem,
    cooldown,
    budget,
    budgetWaiting,
    holdForBudget,
    resendWaiting,
    resendIn,
    resendNote,
    verifyWaiting,
    verifyHold,
    shownError,
    verifySpoken,
    verifyCapped,
    open,
    leave,
    verify,
    resend
  };
};
