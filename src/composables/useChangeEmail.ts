import { ref, watch } from "vue";
import { Endpoints } from "@/constants/endpoints";
import { HttpStatus } from "@/constants/http";
import { Limits } from "@/constants/limits";
import { Messages } from "@/constants/messages";
import { codeCooldownOf, retryAfterFrom, useCountdown } from "@/composables/useCountdown";
import { useRetryHold } from "@/composables/useRetryHold";
import { apiErrorOf, apiRequest } from "@/scripts/api/client";
import {
  emailVerified,
  isLoggedIn,
  pendingEmail,
  userEmail
} from "@/scripts/authentication/authState";
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
  /** Runs until the API takes the form again: after a code was sent, or any 429. */
  const cooldown = useCountdown(COOLDOWN_STORAGE_KEY);
  /** The API's cooldown is per account, so it's kept for the account's current address. */
  const account = () => normalizeEmail(userEmail.value);
  cooldown.resume(account());

  /** Once the waiting change is gone, the API takes a new address straight away. */
  const endCooldown = () => {
    cooldown.stop();
    removeSaved(COOLDOWN_STORAGE_KEY);
  };

  /**
   * After the code checks' 429 (too many wrong codes, or the daily cap, where even the right code
   * is refused), Confirm code waits; Change e-mail has limits of its own, so it doesn't.
   */
  const confirmHold = useRetryHold(confirmError);

  // Every 429 counts its wait down on the key and keeps its message as the countdown's note, so
  // the message goes once the key comes back. `showWait` brings it back, e.g. after a reload.
  watch(cooldown.active, (waiting) => {
    if (!waiting && changeError.value === cooldown.note.value) changeError.value = "";
  });

  /** Shows why the key waits, if a 429 started its countdown (also one from before a reload). */
  const showWait = () => {
    if (cooldown.active.value) changeError.value = cooldown.note.value;
  };

  /**
   * Returns whether it worked: a code went to the new address, now `pendingEmail`, or the address
   * was already the current one. The user is refreshed either way.
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
      // The one-code-a-minute cooldown, or a rate limiter (wrong passwords, too many e-mails):
      // both count the API's retryAfter down on the key, but only the cooldown means a code went out.
      const isCooldown = codeCooldownOf(result) !== undefined;
      changeError.value = isCooldown
        ? Messages.EmailCode.cooldown
        : (apiErrorOf(result) ?? Messages.Account.tooManyRequests);
      cooldown.start(retryAfterFrom(result.body), account(), changeError.value);
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
   * refreshes the user: a 403 or 409 drops the waiting change, and a 400 may mean it expired. A
   * 403 can also be the session ending (expired, ended by a password reset, or replaced by a login
   * elsewhere): the refresh then logs the page out, and the account page says so instead. When the
   * refresh finds the account on the waiting address, the change was confirmed elsewhere (another
   * tab or device), so it counts.
   */
  const confirm = async (code: string) => {
    const address = pendingEmail.value;
    isConfirming.value = true;
    codeError.value = "";
    confirmError.value = "";
    changeMessage.value = "";

    const result = await apiRequest(Endpoints.User.confirmEmail, {
      body: { code },
      failure: Messages.Account.confirmEmailFailed,
      // A dropped change or an ended session: both are shown, neither is a fault.
      quietStatuses: [HttpStatus.Forbidden]
    });

    let changed = result.ok;

    if (result.ok) {
      if (!(await fetchUserDetails())) {
        userEmail.value = pendingEmail.value;
        pendingEmail.value = "";
        emailVerified.value = true;
      }
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

      if (!isLoggedIn.value) {
        // The session ended: nothing was said about the change, and the account page now says why.
      } else if (
        !pendingEmail.value &&
        normalizeEmail(userEmail.value) === normalizeEmail(address)
      ) {
        // Confirmed elsewhere, so its code was spent (400), or a race found the address taken by
        // this very account (409). The refresh already shows it, verified, as a 200 would. A newer
        // change waiting since then keeps its code step and cooldown, with the usual error.
        changed = true;
      } else if (!pendingEmail.value) {
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
        if (result.status === HttpStatus.TooManyRequests) {
          confirmHold.start(retryAfterFrom(result.body));
        }
      }
    }

    if (changed) {
      endCooldown();
      // Only now, so it doesn't sit next to the waiting address it replaces.
      changeMessage.value = (result.ok ? result.data.message : "") || Messages.Account.emailUpdated;
    }
    isConfirming.value = false;

    return changed;
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
    cooldown,
    showWait,
    confirmHold
  };
};
