import { ref } from "vue";
import { Endpoints } from "@/constants/endpoints";
import { HttpStatus } from "@/constants/http";
import { Messages } from "@/constants/messages";
import { retryAfterFrom } from "@/composables/useCountdown";
import { useRetryHold } from "@/composables/useRetryHold";
import { apiRequest } from "@/scripts/api/client";
import { hasPassword } from "@/scripts/authentication/authState";

/**
 * Deletes the logged-in account with its pastes, short links and uploads (vb2007/vb2007.hu-api#164).
 * An account with a password confirms with it; one made with GitHub confirms with its username,
 * after a GitHub login or relink in the last minutes (vb2007/vb2007.hu-api#245).
 */
export const useAccountDelete = () => {
  const isDeleting = ref(false);
  const deleteError = ref("");
  /** The API wants a fresh GitHub login or relink before it deletes an account without a password. */
  const needsGithub = ref(false);
  /** After the password checks' 429 (too many wrong passwords), deleting waits its `retryAfter`. */
  const hold = useRetryHold(deleteError);

  /** Returns whether it worked; the API has then ended the session, so the caller clears it. */
  const deleteAccount = async (confirmation: string) => {
    const withPassword = hasPassword.value;
    isDeleting.value = true;
    deleteError.value = "";
    needsGithub.value = false;

    const result = await apiRequest(Endpoints.User.remove, {
      body: withPassword ? { password: confirmation } : { username: confirmation },
      failure: Messages.Account.deleteFailed
    });

    if (!result.ok) {
      deleteError.value = result.error;
      needsGithub.value =
        !withPassword &&
        result.status === HttpStatus.Forbidden &&
        result.error.startsWith(Messages.Account.githubReauthPrefix);
      if (result.status === HttpStatus.TooManyRequests) hold.start(retryAfterFrom(result.body));
    }
    isDeleting.value = false;

    return result.ok;
  };

  return { isDeleting, deleteError, needsGithub, deleteAccount, hold };
};
