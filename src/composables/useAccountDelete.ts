import { ref } from "vue";
import { Endpoints } from "@/constants/endpoints";
import { Messages } from "@/constants/messages";
import { apiRequest } from "@/scripts/api/client";
import { hasPassword } from "@/scripts/authentication/authState";

/**
 * Deletes the logged-in account with its pastes, short links and uploads (vb2007/vb2007.hu-api#164).
 * An account with a password confirms with it; one made with GitHub confirms with its username.
 */
export const useAccountDelete = () => {
  const isDeleting = ref(false);
  const deleteError = ref("");

  /** Returns whether it worked; the API has then ended the session, so the caller clears it. */
  const deleteAccount = async (confirmation: string) => {
    isDeleting.value = true;
    deleteError.value = "";

    const result = await apiRequest(Endpoints.User.remove, {
      body: hasPassword.value ? { password: confirmation } : { username: confirmation },
      failure: Messages.Account.deleteFailed
    });

    if (!result.ok) {
      deleteError.value = result.error;
    }
    isDeleting.value = false;

    return result.ok;
  };

  return { isDeleting, deleteError, deleteAccount };
};
