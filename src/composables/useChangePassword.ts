import { ref } from "vue";
import { Endpoints } from "@/constants/endpoints";
import { HttpStatus } from "@/constants/http";
import { Messages } from "@/constants/messages";
import { retryAfterFrom } from "@/composables/useCountdown";
import { useRetryHold } from "@/composables/useRetryHold";
import { apiRequest } from "@/scripts/api/client";
import { pendingEmail } from "@/scripts/authentication/authState";
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
      changed.value =
        waiting && !pendingEmail.value
          ? `${result.data.message} ${Messages.Account.emailChangeCancelled(waiting)}`
          : result.data.message;
    } else {
      changeError.value = result.error;
      if (result.status === HttpStatus.TooManyRequests) hold.start(retryAfterFrom(result.body));
    }
    isChanging.value = false;

    return result.ok;
  };

  return { isChanging, changeError, changed, change, hold };
};
