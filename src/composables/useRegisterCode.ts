import { computed, ref, watch } from "vue";
import { UserManagement } from "@/constants/api";
import { retryAfterFrom, useCountdown } from "@/composables/useCountdown";
import { normalizeEmail } from "@/scripts/authentication/register";
import { fetchUserDetails } from "@/scripts/authentication/user";
import { errorFrom } from "@/scripts/pastebin/paste";

/** The API sends at most one code a minute per address. */
export const RESEND_COOLDOWN_SECONDS = 60;

/** Where the resend countdown is kept, so a reload doesn't forget it (one address at a time). */
export const COOLDOWN_STORAGE_KEY = "register-cooldown";

/** The API's codes are 6 digits; it ignores spaces in them. */
const CODE_PATTERN = /^\d{6}$/;

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

/** The body of a failed resend, which also carries a 429's `retryAfter`. */
const readBody = async (
  response: Response
): Promise<{ error?: unknown; retryAfter?: unknown } | undefined> => {
  try {
    return await response.json();
  } catch {
    // Not JSON (e.g. a bare 500).
    return undefined;
  }
};

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
    const digits = code.replace(/\s/g, "");
    if (!CODE_PATTERN.test(digits)) {
      showCodeProblem("Enter the 6-digit code from the e-mail.");
      return "failed";
    }

    let result: RegisterCodeResult = "failed";

    try {
      isVerifying.value = true;
      showError("");

      const response = await fetch(UserManagement.Authentication.registerVerify, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ email: email.value, code: digits }),
        credentials: "include"
      });

      if (response.status === 201) {
        // The response set the session cookie; only the API can tell whether the browser kept it.
        result = (await fetchUserDetails()) ? "logged-in" : "created";
      } else {
        // 400 (wrong, expired or used code), 409 (taken meanwhile) and 429 are the user's to fix.
        const message = await errorFrom(response, "Failed to confirm the code");
        if (response.status === 400) {
          showCodeProblem(message);
        } else {
          showError(message);
        }
        if (response.status === 409) {
          result = "taken";
        }
        if (response.status >= 500) {
          console.error("Failed to confirm the registration code: ", response.status);
        }
      }
    } catch (error) {
      showError("Error connecting to server");
      console.error("Error confirming the registration code: ", error);
    } finally {
      isVerifying.value = false;
    }

    return result;
  };

  /** Mails a new code, which replaces the old one. Returns whether it worked. */
  const resend = async () => {
    let sent = false;

    try {
      isResending.value = true;
      showError("");

      const response = await fetch(UserManagement.Authentication.registerResend, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ email: email.value })
      });

      if (response.ok) {
        notice.value = "resent";
        holdResend(RESEND_COOLDOWN_SECONDS);
        sent = true;
      } else {
        const body = await readBody(response);
        const apiError =
          typeof body?.error === "string" && body.error
            ? body.error
            : `Failed to send a new code: ${response.statusText || response.status}`;

        if (response.status === 429) {
          holdResend(retryAfterFrom(body));
          // The cooldown's own message names its seconds, which would freeze next to the countdown.
          showError(
            typeof body?.retryAfter === "number"
              ? "A code was sent just now. You can send another once the countdown ends."
              : apiError,
            true
          );
        } else {
          showError(apiError);
          if (response.status === 503) {
            // The API replaced the code before the e-mail failed, so the old one is gone too.
            notice.value = "lost";
          }
          if (response.status >= 500) {
            console.error("Failed to resend the registration code: ", response.status);
          }
        }
      }
    } catch (error) {
      showError("Error connecting to server");
      console.error("Error resending the registration code: ", error);
    } finally {
      isResending.value = false;
    }

    return sent;
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
