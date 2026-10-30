import { ref } from "vue";
import { UserManagement } from "@/constants/api";
import { errorFrom } from "@/scripts/pastebin/paste";

/** Changes the logged-in user's password (vb2007/vb2007.hu-api#161); the API renews the session cookie. */
export const useChangePassword = () => {
  const isChanging = ref(false);
  const changeError = ref("");
  const changed = ref("");

  /** Returns whether it worked. */
  const change = async (currentPassword: string, newPassword: string) => {
    let succeeded = false;

    try {
      isChanging.value = true;
      changeError.value = "";
      changed.value = "";

      const response = await fetch(UserManagement.Actions.userPassword, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ currentPassword, newPassword })
      });

      if (response.ok) {
        changed.value = (await response.json()).message;
        succeeded = true;
      } else {
        changeError.value = await errorFrom(response, "Failed to change password");
        console.error("Failed to change password: ", response.status);
      }
    } catch (error) {
      changeError.value = "Error connecting to server";
      console.error("Error changing password: ", error);
    } finally {
      isChanging.value = false;
    }

    return succeeded;
  };

  return { isChanging, changeError, changed, change };
};
