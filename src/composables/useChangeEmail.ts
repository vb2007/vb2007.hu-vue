import { ref, watch } from "vue";
import { UserManagement } from "@/constants/api";
import { retryAfterFrom, useCountdown } from "@/composables/useCountdown";
import { emailVerified, pendingEmail, userEmail } from "@/scripts/authentication/authState";
import { normalizeEmail } from "@/scripts/authentication/register";
import { fetchUserDetails } from "@/scripts/authentication/user";
import { errorFrom } from "@/scripts/pastebin/paste";

/** The API mails at most one code a minute (vb2007/vb2007.hu-api#215). */
export const CODE_COOLDOWN_SECONDS = 60;

/**
 * Changes the logged-in user's e-mail address (vb2007/vb2007.hu-api#162). The API mails a code to
 * the new address first, and switches to it once the code comes back (vb2007/vb2007.hu-api#215).
 */
export const useChangeEmail = () => {
  const isChanging = ref(false);
  const changeError = ref("");
  const changeMessage = ref("");
  const isConfirming = ref(false);
  const confirmError = ref("");
  /** Runs until the API takes the form again: after a code was sent, or a 429. */
  const cooldown = useCountdown();

  // A 429's message names the wait as it was when it came, so it's stale once the wait is over.
  watch(cooldown.active, (waiting) => {
    if (!waiting) changeError.value = "";
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
        cooldown.start(CODE_COOLDOWN_SECONDS);
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
        changeError.value = data?.error ?? "Too many requests: try again later.";
        cooldown.start(retryAfterFrom(data));
      } else {
        changeError.value = await errorFrom(response, "Failed to change e-mail");
        console.error("Failed to change e-mail: ", response.status);
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
   * Sends the code mailed to `pendingEmail`; returns whether the address changed. A 403 or 409
   * drops the waiting change on the API, so the user is refreshed and `pendingEmail` goes too.
   */
  const confirm = async (code: string) => {
    let confirmed = false;

    try {
      isConfirming.value = true;
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
        // Only now, so it doesn't sit next to the waiting address it replaces.
        changeMessage.value = data.message ?? "E-mail address updated.";
        confirmed = true;
      } else {
        confirmError.value = await errorFrom(response, "Failed to confirm e-mail");
        console.error("Failed to confirm e-mail: ", response.status);
        if ((response.status === 403 || response.status === 409) && !(await fetchUserDetails())) {
          pendingEmail.value = "";
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
    confirmError,
    confirm,
    cooldown
  };
};
