import { computed, ref, watch } from "vue";
import { Endpoints } from "@/constants/endpoints";
import { HttpStatus } from "@/constants/http";
import { Limits } from "@/constants/limits";
import { Messages } from "@/constants/messages";
import { retryAfterFrom, useCountdown } from "@/composables/useCountdown";
import { apiRequest } from "@/scripts/api/client";
import { confirmationCodeError, normalizeEmail } from "@/scripts/authentication/register";
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
  /** The address or username was taken meanwhile; the waiting registration is gone. */
  | "taken"
  /** Nothing changed; `codeFieldError` or `codeError` says why. */
  | "failed";

/** What the step tells about the address's code. */
export type CodeNotice =
  /** The register form just had it mailed. */
  | "sent"
  /** A resend mailed a new one. */
  | "resent"
  /** The user already has one, e.g. after a reload; nothing was sent. */
  | "earlier"
  /** Registering again within the minute: the code from then still works. */
  | "recent"
  /** A resend replaced the code but couldn't mail the new one. */
  | "lost";

/**
 * The register form's second step (vb2007/vb2007.hu-api#28): the code mailed after
 * POST /auth/register's 202 creates the account, and a new one can be sent once a minute.
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
  const cooldown = useCountdown(COOLDOWN_STORAGE_KEY);
  /** The address the countdown holds back; any other can be sent a code right away. */
  const cooldownFor = ref("");
  /** True while `codeError` is a refused resend's, which only holds until the countdown ends. */
  let errorEndsWithCooldown = false;

  const resendWaiting = computed(
    () => cooldown.active.value && normalizeEmail(cooldownFor.value) === normalizeEmail(email.value)
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

  const holdResend = (seconds: number) => {
    cooldownFor.value = email.value;
    cooldown.start(seconds, normalizeEmail(email.value));
  };

  watch(cooldown.active, (active) => {
    if (!active && errorEndsWithCooldown) {
      showError("");
    }
  });

  /**
   * Opens the step for `address`; `waitSeconds` holds resending back that long. Without it, a
   * countdown kept for the address (e.g. from before a reload) picks up where it was.
   */
  const open = (address: string, kind: CodeNotice, waitSeconds = 0) => {
    email.value = address;
    notice.value = kind;
    showError("");
    if (waitSeconds > 0) {
      holdResend(waitSeconds);
    } else if (cooldown.resume(normalizeEmail(address))) {
      cooldownFor.value = address;
    }
  };

  /** Back to the form, e.g. to fix a mistyped address. The countdown keeps running for it. */
  const leave = () => {
    email.value = "";
    showError("");
  };

  const verify = async (code: string): Promise<RegisterCodeResult> => {
    const problem = confirmationCodeError(code);
    if (problem) {
      showCodeProblem(problem);
      return "failed";
    }
    isVerifying.value = true;
    showError("");

    const result = await apiRequest(Endpoints.Auth.registerVerify, {
      body: { email: email.value, code: code.replace(/\s/g, "") },
      failure: Messages.EmailCode.confirmFailed
    });

    let outcome: RegisterCodeResult = "failed";
    if (result.ok) {
      // The 201 set the session cookie; only the API can tell whether the browser kept it.
      outcome = (await fetchUserDetails()) ? "logged-in" : "created";
    } else if (result.status === HttpStatus.BadRequest) {
      // A wrong, expired or used code.
      showCodeProblem(result.error);
    } else {
      // 409 (taken meanwhile), 429, the server or the network.
      showError(result.error);
      if (result.status === HttpStatus.Conflict) {
        outcome = "taken";
      }
    }
    isVerifying.value = false;

    return outcome;
  };

  /** Mails a new code, which replaces the old one. Returns whether it worked. */
  const resend = async () => {
    isResending.value = true;
    showError("");

    const result = await apiRequest(Endpoints.Auth.registerResend, {
      body: { email: email.value },
      failure: Messages.EmailCode.resendFailed
    });

    if (result.ok) {
      notice.value = "resent";
      holdResend(RESEND_COOLDOWN_SECONDS);
    } else if (result.status === HttpStatus.TooManyRequests) {
      holdResend(retryAfterFrom(result.body));
      // The cooldown's own message names its seconds, which would freeze next to the countdown.
      showError(
        typeof result.body?.retryAfter === "number" ? Messages.EmailCode.cooldown : result.error,
        true
      );
    } else {
      showError(result.error);
      if (result.status === HttpStatus.ServiceUnavailable) {
        // The API replaced the code before the e-mail failed, so the old one is gone too.
        notice.value = "lost";
      }
    }
    isResending.value = false;

    return result.ok;
  };

  return {
    email,
    notice,
    isVerifying,
    isResending,
    codeError,
    codeFieldError,
    cooldown,
    resendWaiting,
    open,
    leave,
    verify,
    resend
  };
};
