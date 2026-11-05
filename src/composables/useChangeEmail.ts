import { ref, watch } from "vue";
import { Endpoints } from "@/constants/endpoints";
import { HttpStatus } from "@/constants/http";
import { Limits } from "@/constants/limits";
import { Messages } from "@/constants/messages";
import { retryAfterFrom, useCountdown } from "@/composables/useCountdown";
import { apiErrorOf, apiRequest } from "@/scripts/api/client";
import { emailVerified, pendingEmail, userEmail } from "@/scripts/authentication/authState";
import { normalizeEmail } from "@/scripts/authentication/register";
import { fetchUserDetails } from "@/scripts/authentication/user";
import { removeSaved } from "@/scripts/utility/savedForOwner";

/** The API mails at most one code a minute, per account (vb2007/vb2007.hu-api#215). */
export const CODE_COOLDOWN_SECONDS = Limits.Code.cooldownSeconds;
/** Where the countdown to the next code is kept, so a reload doesn't spend a try on a 429. */
export const COOLDOWN_STORAGE_KEY = "email-change-cooldown";

/**
 * Changes the logged-in user's e-mail address (vb2007/vb2007.hu-api#162). The API mails a code to
 * the new address first, and switches to it once the code comes back (vb2007/vb2007.hu-api#215).
 */
export const useChangeEmail = () => {
  const isChanging = ref(false);
  const changeError = ref("");
  const changeMessage = ref("");
  const isConfirming = ref(false);
  /** A refused code while the change still waits, shown with the code field. */
  const codeError = ref("");
  /** Any other confirm failure, including one that dropped the waiting change. */
  const confirmError = ref("");
  /** Runs until the API takes the form again: after a code was sent, or a 429. */
  const cooldown = useCountdown(COOLDOWN_STORAGE_KEY);
  /** The API's cooldown is per account, so it's kept for the account's current address. */
  const account = () => normalizeEmail(userEmail.value);
  cooldown.resume(account());

  /** Once the waiting change is gone, the API takes a new address straight away. */
  const endCooldown = () => {
    cooldown.stop();
    removeSaved(COOLDOWN_STORAGE_KEY);
  };

  // The cooldown's 429 counts its wait down on the key, so its message has no number to go stale.
  // A rate limiter's 429 has no wait to count down, so its message stays when the key comes back.
  watch(cooldown.active, (waiting) => {
    if (!waiting && changeError.value === Messages.EmailCode.cooldown) changeError.value = "";
  });

  /**
   * Returns whether it worked: a code went to the new address, now `pendingEmail`, or the address
   * was already the current one. The user is refreshed either way. A taken address gets a code too:
   * only `confirm` refuses it.
   */
  const change = async (email: string, password: string) => {
    isChanging.value = true;
    changeError.value = "";
    changeMessage.value = "";
    confirmError.value = "";

    const result = await apiRequest(Endpoints.User.changeEmail, {
      body: { email, password },
      failure: Messages.Account.changeEmailFailed
    });

    if (result.ok && result.status === HttpStatus.Accepted) {
      // The API's message is written for API clients; the pending address tells the page's user.
      if (!(await fetchUserDetails())) {
        pendingEmail.value = normalizeEmail(email);
      }
      cooldown.start(CODE_COOLDOWN_SECONDS, account());
    } else if (result.ok) {
      changeMessage.value = result.data.message ?? Messages.Account.emailUpdated;
      if (!(await fetchUserDetails())) {
        userEmail.value = normalizeEmail(email);
      }
    } else if (result.status === HttpStatus.TooManyRequests) {
      // Only the one-code-a-minute cooldown sends retryAfter; the rate limiters send an error alone.
      const isCooldown = typeof result.body?.retryAfter === "number";
      changeError.value = isCooldown
        ? Messages.EmailCode.cooldown
        : (apiErrorOf(result) ?? Messages.Account.tooManyRequests);
      cooldown.start(retryAfterFrom(result.body), account());
      // The code it waits for may have been asked for elsewhere, e.g. in another tab.
      if (isCooldown) await fetchUserDetails();
    } else {
      changeError.value = result.error;
      // The API keeps the new change even when its mail fails, so show what it has now.
      if (result.status === HttpStatus.ServiceUnavailable) await fetchUserDetails();
    }
    isChanging.value = false;

    return result.ok;
  };

  /**
   * Sends the code mailed to `pendingEmail`; returns whether the address changed. A refused code
   * refreshes the user: a 400 may mean it expired, and a 403 or 409 drops the waiting change. The
   * API refuses the superuser's address (403) or another account's (409) only here, not when it
   * mails the code, so it doesn't show which addresses have accounts (vb2007/vb2007.hu-api#291).
   * An expired session's 403 ("You are not logged in.") isn't told apart, so it reads as a drop too.
   */
  const confirm = async (code: string) => {
    const address = pendingEmail.value;
    isConfirming.value = true;
    codeError.value = "";
    confirmError.value = "";
    changeMessage.value = "";

    const result = await apiRequest(Endpoints.User.confirmEmail, {
      body: { code },
      failure: Messages.Account.confirmEmailFailed
    });

    if (result.ok) {
      if (!(await fetchUserDetails())) {
        userEmail.value = pendingEmail.value;
        pendingEmail.value = "";
        emailVerified.value = true;
      }
      endCooldown();
      // Only now, so it doesn't sit next to the waiting address it replaces.
      changeMessage.value = result.data.message ?? Messages.Account.emailUpdated;
    } else if (result.kind !== "http") {
      confirmError.value = result.error;
    } else {
      const dropped =
        result.status === HttpStatus.Forbidden || result.status === HttpStatus.Conflict;
      if (dropped || result.status === HttpStatus.BadRequest) {
        // GET /user leaves out an expired change, so a 400 for one takes the code step away too.
        const refreshed = await fetchUserDetails();
        if (dropped && !refreshed) pendingEmail.value = "";
      }

      if (!pendingEmail.value) {
        // Its code step is gone with it, so the message names the address it was about. A 400
        // means the code expired, and the API's "check it" no longer fits without the field.
        endCooldown();
        confirmError.value =
          result.status === HttpStatus.BadRequest
            ? Messages.Account.codeExpired(address)
            : Messages.Account.notConfirmed(address, result.error);
      } else if (result.status === HttpStatus.BadRequest) {
        codeError.value = result.error;
      } else {
        confirmError.value = result.error;
      }
    }
    isConfirming.value = false;

    return result.ok;
  };

  return {
    isChanging,
    changeError,
    changeMessage,
    change,
    isConfirming,
    codeError,
    confirmError,
    confirm,
    cooldown
  };
};
