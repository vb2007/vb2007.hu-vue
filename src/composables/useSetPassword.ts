import { ref } from "vue";
import { UserManagement } from "@/constants/api";
import { hasPassword } from "@/scripts/authentication/authState";
import { refreshUser } from "@/scripts/authentication/user";
import { errorFrom } from "@/scripts/pastebin/paste";

/** How the API's 403 starts when GitHub has to confirm it's the user first (vb2007/vb2007.hu-api#183). */
const GITHUB_REAUTH = "Confirm it's you first";

/** Sets a password on an account made with GitHub (vb2007/vb2007.hu-api#155). */
export const useSetPassword = () => {
  const isSetting = ref(false);
  const setError = ref("");
  /** The API wants a fresh GitHub login or relink before it takes the password. */
  const needsGithub = ref(false);

  /** Returns whether it worked. */
  const setPassword = async (password: string) => {
    let set = false;

    try {
      isSetting.value = true;
      setError.value = "";
      needsGithub.value = false;

      const response = await fetch(UserManagement.Actions.password, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
        credentials: "include"
      });

      if (response.ok) {
        hasPassword.value = true;
        await refreshUser();
        set = true;
      } else {
        setError.value = await errorFrom(response, "Failed to set the password");
        needsGithub.value = response.status === 403 && setError.value.startsWith(GITHUB_REAUTH);
        console.error("Failed to set the password: ", response.status);
      }
    } catch (error) {
      setError.value = "Error connecting to server";
      console.error("Error setting the password: ", error);
    } finally {
      isSetting.value = false;
    }

    return set;
  };

  return { isSetting, setError, needsGithub, setPassword };
};
