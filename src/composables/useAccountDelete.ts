import { ref } from "vue";
import { UserManagement } from "@/constants/api";
import { hasPassword } from "@/scripts/authentication/authState";
import { errorFrom } from "@/scripts/pastebin/paste";

/**
 * Deletes the logged-in account with its pastes, short links and uploads (vb2007/vb2007.hu-api#164).
 * An account with a password confirms with it; one made with GitHub confirms with its username.
 */
export const useAccountDelete = () => {
  const isDeleting = ref(false);
  const deleteError = ref("");

  /** Returns whether it worked; the API has then ended the session, so the caller clears it. */
  const deleteAccount = async (confirmation: string) => {
    let deleted = false;

    try {
      isDeleting.value = true;
      deleteError.value = "";

      const response = await fetch(UserManagement.Actions.user, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(
          hasPassword.value ? { password: confirmation } : { username: confirmation }
        ),
        credentials: "include"
      });

      if (response.ok) {
        deleted = true;
      } else {
        deleteError.value = await errorFrom(response, "Failed to delete the account");
        console.error("Failed to delete the account: ", response.status);
      }
    } catch (error) {
      deleteError.value = "Error connecting to server";
      console.error("Error deleting the account: ", error);
    } finally {
      isDeleting.value = false;
    }

    return deleted;
  };

  return { isDeleting, deleteError, deleteAccount };
};
