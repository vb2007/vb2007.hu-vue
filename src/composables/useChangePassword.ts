import { ref } from "vue";
import { Endpoints } from "@/constants/endpoints";
import { Messages } from "@/constants/messages";
import { apiRequest } from "@/scripts/api/client";

/** Changes the logged-in user's password (vb2007/vb2007.hu-api#161); the API renews the session cookie. */
export const useChangePassword = () => {
  const isChanging = ref(false);
  const changeError = ref("");
  const changed = ref("");

  /** Returns whether it worked. */
  const change = async (currentPassword: string, newPassword: string) => {
    isChanging.value = true;
    changeError.value = "";
    changed.value = "";

    const result = await apiRequest(Endpoints.User.changePassword, {
      body: { currentPassword, newPassword },
      failure: Messages.Account.changePasswordFailed
    });

    if (result.ok) {
      changed.value = result.data.message;
    } else {
      changeError.value = result.error;
    }
    isChanging.value = false;

    return result.ok;
  };

  return { isChanging, changeError, changed, change };
};
