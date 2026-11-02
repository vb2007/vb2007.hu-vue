import { ref } from "vue";
import { Endpoints } from "@/constants/endpoints";
import { HttpStatus } from "@/constants/http";
import { Messages } from "@/constants/messages";
import { apiRequest } from "@/scripts/api/client";
import { hasPassword } from "@/scripts/authentication/authState";
import { fetchUserDetails } from "@/scripts/authentication/user";

/** Sets a password on an account made with GitHub (vb2007/vb2007.hu-api#155). */
export const useSetPassword = () => {
  const isSetting = ref(false);
  const setError = ref("");
  /** The API wants a fresh GitHub login or relink before it takes the password. */
  const needsGithub = ref(false);

  /** Returns whether the account has a password now; a 409 means it had one already. */
  const setPassword = async (password: string) => {
    isSetting.value = true;
    setError.value = "";
    needsGithub.value = false;

    const result = await apiRequest(Endpoints.User.setPassword, {
      body: { password },
      failure: Messages.Account.setPasswordFailed
    });

    let set = false;
    if (result.ok) {
      hasPassword.value = true;
      await fetchUserDetails();
      set = true;
    } else {
      setError.value = result.error;
      needsGithub.value =
        result.status === HttpStatus.Forbidden &&
        result.error.startsWith(Messages.Account.githubReauthPrefix);
      if (result.status === HttpStatus.Conflict) {
        set = (await fetchUserDetails()) && hasPassword.value;
      }
    }
    isSetting.value = false;

    return set;
  };

  return { isSetting, setError, needsGithub, setPassword };
};
