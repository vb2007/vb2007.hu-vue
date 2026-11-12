import { onScopeDispose, ref, watch } from "vue";
import { Endpoints } from "@/constants/endpoints";
import { HttpStatus } from "@/constants/http";
import { Limits } from "@/constants/limits";
import { Messages } from "@/constants/messages";
import { codeCooldownOf, retryAfterFrom, useCountdown } from "@/composables/useCountdown";
import { useRetryHold } from "@/composables/useRetryHold";
import { apiErrorOf, apiRequest, isLoggedOutAnswer } from "@/scripts/api/client";
import {
  emailVerified,
  isLoggedIn,
  passwordChanges,
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
   * The code's own cooldown ends with the change it was for, however that went: e.g. a password
   * change, here or in another tab (vb2007/vb2007.hu-api#474), or a reset, which logs the page out
   * first, so this also looks as the form mounts again. That cooldown is the count a sent code
   * started (no note) or the cooldown's 429 (its message as the note). A hold with any other note
   * (a rate limiter's, or one that can come with no change waiting at all) isn't about the change,
   * so it stays.
   */
  watch(
    pendingEmail,
    (waiting) => {
      const note = cooldown.note.value;
      const isCodeCooldown = !note || note === Messages.EmailCode.cooldown;
      if (!waiting && isLoggedIn.value && cooldown.active.value && isCodeCooldown) endCooldown();
    },
    { immediate: true }
  );

  /** Errors about a code that no longer works, shown with the code step or in its place. */
  const clearCodeErrors = () => {
    codeError.value = "";
    confirmError.value = "";
  };

  /**
   * A change that goes or is replaced (a password change, a refresh that no longer finds it, or a
   * new one from another tab) takes the errors of its code step with it. This runs synchronously,
   * as the address is set: `confirm` sets its own outcome only after its refresh, so it stays.
   */
  watch(pendingEmail, clearCodeErrors, { flush: "sync" });

  /**
   * A new password also drops a refusal that already took the change away (e.g. its tries ran out
   * here, or another tab's password change left this tab's code unusable): shown under the new
   * password's success, it would read as caused by it.
   */
  watch(passwordChanges, clearCodeErrors);

  /**
   * Coming back to the tab while a change waits looks the account up again: another tab may have
   * confirmed the change or dropped it with a new password, and this tab's countdown is its own
   * (sessionStorage). One lookup per return, and only while there's a change to check.
   */
  const onReturn = () => {
    if (document.hidden || !isLoggedIn.value || !pendingEmail.value) return;
    if (isChanging.value || isConfirming.value) return;
    void fetchUserDetails();
  };
  document.addEventListener("visibilitychange", onReturn);
  onScopeDispose(() => document.removeEventListener("visibilitychange", onReturn));

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
      failure: Messages.Account.changeEmailFailed,
      // A wrong password, the superuser's address, or the password or session changing meanwhile:
      // each is shown, none is a fault.
      quietStatuses: [HttpStatus.Forbidden]
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
    } else if (isLoggedOutAnswer(result.status, apiErrorOf(result))) {
      // The password or session stopped holding between the API's check and its store, so it kept
      // and mailed nothing (vb2007/vb2007.hu-api#466). The client's recheck (`onSessionRefused`)
      // has run by now: an ended session logged the page out, and the account page says so. Still
      // logged in, it changed in this browser (e.g. the password, in another tab), and that recheck
      // already refreshed the account, which a password change left without its waiting change.
      // The form keeps what was typed.
      if (isLoggedIn.value) changeError.value = Messages.Account.emailChangeInterrupted;
    } else {
      changeError.value = result.error;
      // When its mail fails, the API restores the change that waited before, if any
      // (`restoreEmailChange`, vb2007/vb2007.hu-api#294), so show what it has now. A wrong
      // password may be one changed elsewhere, which dropped the waiting change
      // (vb2007/vb2007.hu-api#474), so that refreshes too.
      if (
        result.status === HttpStatus.ServiceUnavailable ||
        result.status === HttpStatus.Forbidden
      ) {
        await fetchUserDetails();
      }
    }
    isChanging.value = false;

    return result.ok;
  };

  /**
   * Sends the code mailed to `pendingEmail`; returns whether the address changed. A refused code
   * refreshes the user: a 400 may mean it expired or its tries are used up, and a 403 or 409
   * drops the waiting change. The API refuses the superuser's address (403) or another account's
   * (409) only here, not when it mails the code, so it doesn't show which addresses have accounts
   * (vb2007/vb2007.hu-api#291).
   * A 403 can also be the session ending (expired, ended by a password reset, or replaced by a
   * login elsewhere): the client's own check has then logged the page out (`onSessionRefused`), as
   * a refresh after a 400 does for one, and the account page says so instead.
   * When the refresh finds the account on the waiting address, the change was confirmed elsewhere
   * (another tab or device), so it counts.
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
      // An ended session's 403 has logged the page out already (`onSessionRefused`): no refresh.
      if (isLoggedIn.value && (dropped || result.status === HttpStatus.BadRequest)) {
        // GET /user leaves out a change whose code expired or whose tries ran out (the 5th wrong
        // code, or any code after that: vb2007/vb2007.hu-api#463), so a 400 for one takes the code
        // step away too.
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
        // means the code expired, ran out of tries or was dropped by a password change elsewhere
        // (the refresh can't tell which), and the API's "check it" no longer fits without the field.
        endCooldown();
        confirmError.value =
          result.status === HttpStatus.BadRequest
            ? Messages.Account.codeNoLongerWorks(address)
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
