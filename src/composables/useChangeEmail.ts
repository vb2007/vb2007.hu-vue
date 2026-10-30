import { ref, watch } from "vue";
import { UserManagement } from "@/constants/api";
import { retryAfterFrom, useCountdown } from "@/composables/useCountdown";
import { emailVerified, pendingEmail, userEmail } from "@/scripts/authentication/authState";
import { normalizeEmail } from "@/scripts/authentication/register";
import { fetchUserDetails } from "@/scripts/authentication/user";
import { errorFrom } from "@/scripts/pastebin/paste";

/** The API mails at most one code a minute, per account (vb2007/vb2007.hu-api#215). */
export const CODE_COOLDOWN_SECONDS = 60;
/** Where the countdown to the next code is kept, so a reload doesn't spend a try on a 429. */
export const COOLDOWN_STORAGE_KEY = "email-change-cooldown";
/** The cooldown's 429 counts its wait down on the key, so its message has no number to go stale. */
export const COOLDOWN_MESSAGE =
  "A code was sent just now. You can send another once the countdown ends.";

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
    try {
      sessionStorage.removeItem(COOLDOWN_STORAGE_KEY);
    } catch {
      // Storage is off: nothing was kept to resume.
    }
  };

  // A rate limiter's 429 has no wait to count down, so its message stays when the key comes back.
  watch(cooldown.active, (waiting) => {
    if (!waiting && changeError.value === COOLDOWN_MESSAGE) changeError.value = "";
  });

  /**
   * Returns whether it worked: a code went to the new address, now `pendingEmail`, or the address
   * was already the current one. The user is refreshed either way.
   */
  const change = async (email: string, password: string) => {
    let changed = false;

    try {
      isChanging.value = true;
      changeError.value = "";
      changeMessage.value = "";
      confirmError.value = "";

      const response = await fetch(UserManagement.Actions.userEmail, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
        credentials: "include"
      });

      if (response.status === 202) {
        // The API's message is written for API clients; the pending address tells the page's user.
        if (!(await fetchUserDetails())) {
          pendingEmail.value = normalizeEmail(email);
        }
        cooldown.start(CODE_COOLDOWN_SECONDS, account());
        changed = true;
      } else if (response.ok) {
        const data = await response.json().catch(() => ({}));
        changeMessage.value = data.message ?? "E-mail address updated.";
        if (!(await fetchUserDetails())) {
          userEmail.value = normalizeEmail(email);
        }
        changed = true;
      } else if (response.status === 429) {
        // Only the one-code-a-minute cooldown sends retryAfter; the rate limiters send an error alone.
        const data = await response.json().catch(() => null);
        const isCooldown = typeof data?.retryAfter === "number";
        changeError.value = isCooldown
          ? COOLDOWN_MESSAGE
          : (data?.error ?? "Too many requests: try again later.");
        cooldown.start(retryAfterFrom(data), account());
        // The code it waits for may have been asked for elsewhere, e.g. in another tab.
        if (isCooldown) await fetchUserDetails();
      } else {
        changeError.value = await errorFrom(response, "Failed to change e-mail");
        console.error("Failed to change e-mail: ", response.status);
        // The API keeps the new change even when its mail fails, so show what it has now.
        if (response.status === 503) await fetchUserDetails();
      }
    } catch (error) {
      changeError.value = "Error connecting to server";
      console.error("Error changing e-mail: ", error);
    } finally {
      isChanging.value = false;
    }

    return changed;
  };

  /**
   * Sends the code mailed to `pendingEmail`; returns whether the address changed. A refused code
   * refreshes the user: a 403 or 409 drops the waiting change, and a 400 may mean it expired.
   */
  const confirm = async (code: string) => {
    let confirmed = false;
    const address = pendingEmail.value;

    try {
      isConfirming.value = true;
      codeError.value = "";
      confirmError.value = "";
      changeMessage.value = "";

      const response = await fetch(UserManagement.Actions.userEmailConfirm, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
        credentials: "include"
      });

      if (response.ok) {
        const data = await response.json().catch(() => ({}));
        if (!(await fetchUserDetails())) {
          userEmail.value = pendingEmail.value;
          pendingEmail.value = "";
          emailVerified.value = true;
        }
        endCooldown();
        // Only now, so it doesn't sit next to the waiting address it replaces.
        changeMessage.value = data.message ?? "E-mail address updated.";
        confirmed = true;
      } else {
        const error = await errorFrom(response, "Failed to confirm e-mail");
        console.error("Failed to confirm e-mail: ", response.status);
        const dropped = response.status === 403 || response.status === 409;
        if (dropped || response.status === 400) {
          // GET /user leaves out an expired change, so a 400 for one takes the code step away too.
          const refreshed = await fetchUserDetails();
          if (dropped && !refreshed) pendingEmail.value = "";
        }

        if (!pendingEmail.value) {
          // Its code step is gone with it, so the message names the address it was about. A 400
          // means the code expired, and the API's "check it" no longer fits without the field.
          endCooldown();
          confirmError.value =
            response.status === 400
              ? `${address} wasn't confirmed: its code expired. Send a new one with Change e-mail.`
              : `${address} wasn't confirmed. ${error}`;
        } else if (response.status === 400) {
          codeError.value = error;
        } else {
          confirmError.value = error;
        }
      }
    } catch (error) {
      confirmError.value = "Error connecting to server";
      console.error("Error confirming e-mail: ", error);
    } finally {
      isConfirming.value = false;
    }

    return confirmed;
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
