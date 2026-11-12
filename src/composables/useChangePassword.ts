import { ref } from "vue";
import { Endpoints } from "@/constants/endpoints";
import { HttpStatus } from "@/constants/http";
import { Messages } from "@/constants/messages";
import { retryAfterFrom } from "@/composables/useCountdown";
import { useRetryHold } from "@/composables/useRetryHold";
import { apiRequest } from "@/scripts/api/client";
import { passwordChanges, pendingEmail, userEmail } from "@/scripts/authentication/authState";
import { normalizeEmail } from "@/scripts/authentication/register";
import { fetchUserDetails } from "@/scripts/authentication/user";

/**
 * Changes the logged-in user's password (vb2007/vb2007.hu-api#161); the API renews the session
 * cookie, and drops a waiting e-mail change (vb2007/vb2007.hu-api#474), which `changed` then names.
 */
export const useChangePassword = () => {
  const isChanging = ref(false);
  const changeError = ref("");
  const changed = ref("");
  /** After the password checks' 429 (too many wrong passwords), saving waits its `retryAfter`. */
  const hold = useRetryHold(changeError);

  /** Returns whether it worked. */
  const change = async (currentPassword: string, newPassword: string) => {
    isChanging.value = true;
    changeError.value = "";
    changed.value = "";
    const waiting = pendingEmail.value;

    const result = await apiRequest(Endpoints.User.changePassword, {
      body: { currentPassword, newPassword },
      failure: Messages.Account.changePasswordFailed
    });

    if (result.ok) {
      // The API drops a waiting e-mail change with the old password (vb2007/vb2007.hu-api#474), so
      // the refresh takes its code step away; without one, it's dropped here as well.
      if (!(await fetchUserDetails())) pendingEmail.value = "";
      // A refresh that finds the account on the waiting address means it was confirmed elsewhere
      // (another tab or device) first, so nothing was cancelled. One whose code had expired is
      // unset with the password all the same, so its code needs replacing either way.
      const cancelled =
        waiting &&
        !pendingEmail.value &&
        normalizeEmail(userEmail.value) !== normalizeEmail(waiting);
      changed.value = cancelled
        ? `${result.data.message} ${Messages.Account.emailChangeCancelled(waiting)}`
        : result.data.message;
      passwordChanges.value++;
    } else {
      changeError.value = result.error;
      if (result.status === HttpStatus.TooManyRequests) hold.start(retryAfterFrom(result.body));
    }
    isChanging.value = false;

    return result.ok;
  };

  return { isChanging, changeError, changed, change, hold };
};
