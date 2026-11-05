import { computed, ref, watch } from "vue";
import { Endpoints } from "@/constants/endpoints";
import { HttpStatus } from "@/constants/http";
import { Limits } from "@/constants/limits";
import { Messages } from "@/constants/messages";
import { codeCooldownOf, retryAfterFrom, useCountdown } from "@/composables/useCountdown";
import { useRetryHold } from "@/composables/useRetryHold";
import { apiRequest } from "@/scripts/api/client";
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
  /** Nothing changed; `codeFieldError` or `codeError` says why. */
  | "failed";

/**
 * What a resend did to the code: the API accepted it (a waiting registration's code was replaced
 * and the new one mailed), the old one was replaced but the new one couldn't be mailed, or nothing
 * changed (a refusal, the server or the network) and it still works.
 */
export type ResendOutcome = "sent" | "lost" | "failed";

/** A refusal about one of the register form's fields, to show under it. */
export interface FormProblem {
  field: RegisterField;
  message: string;
}

/** What the step tells about the address's code. */
export type CodeNotice =
  /** The register form just had it mailed. */
  | "sent"
  /** A resend the API accepted: it mailed a new code only if a registration was waiting. */
  | "resent"
  /** The user already has one, e.g. after a reload; nothing was sent. */
  | "earlier"
  /** Registering again within the minute: the code from then still works. */
  | "recent"
  /** Back from fixing the form: nothing was sent, and the code typed before is kept. */
  | "kept"
  /** A resend replaced the code but couldn't mail the new one. */
  | "lost";

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
  /** True while `codeError` is a refused resend's, which only holds until the countdown ends. */
  let errorEndsWithCooldown = false;

  const resendWaiting = computed(
    () => cooldown.active.value && normalizeEmail(cooldownFor.value) === normalizeEmail(email.value)
  );
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
  const showError = (message: string, endsWithCooldown = false) => {
    codeError.value = message;
    codeFieldError.value = "";
    errorEndsWithCooldown = endsWithCooldown;
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

  watch(cooldown.active, (active) => {
    if (!active && errorEndsWithCooldown) {
      showError("");
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
      showError(cooldown.note.value, true);
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
      // A wrong code and the form's refusals are answers the step shows, not faults.
      quietStatuses: [HttpStatus.BadRequest, HttpStatus.Conflict]
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
   * Asks for a new code, which replaces the old one if a registration is waiting. Returns what
   * became of the old code.
   */
  const resend = async (): Promise<ResendOutcome> => {
    isResending.value = true;
    showError("");

    const result = await apiRequest(Endpoints.Auth.registerResend, {
      body: { email: email.value },
      failure: Messages.EmailCode.resendFailed
    });

    let outcome: ResendOutcome = "failed";
    if (result.ok) {
      notice.value = "resent";
      outcome = "sent";
      holdResend(RESEND_COOLDOWN_SECONDS);
    } else if (result.status === HttpStatus.TooManyRequests) {
      // The cooldown's own message names its seconds, which would freeze next to the countdown;
      // a rate limiter's (e.g. too many e-mails) only says to try later, which the key times.
      const message =
        codeCooldownOf(result) === undefined ? result.error : Messages.EmailCode.cooldown;
      // The cooldown or a rate limiter: either way the key counts down the API's retryAfter.
      holdResend(retryAfterFrom(result.body), message);
      showError(message, true);
    } else {
      showError(result.error);
      if (result.status === HttpStatus.ServiceUnavailable) {
        // The API replaced the code before the e-mail failed, so the old one is gone too.
        notice.value = "lost";
        outcome = "lost";
      }
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
    resendWaiting,
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
