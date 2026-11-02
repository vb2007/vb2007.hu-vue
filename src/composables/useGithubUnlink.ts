import { ref } from "vue";
import { Endpoints } from "@/constants/endpoints";
import { Messages } from "@/constants/messages";
import { apiRequest } from "@/scripts/api/client";
import { githubLinked, githubLogin } from "@/scripts/authentication/authState";

/** Unlinks the logged-in user's GitHub account (vb2007/vb2007.hu-api#134). */
export const useGithubUnlink = () => {
  const isUnlinking = ref(false);
  const unlinkError = ref("");

  /** Returns whether it worked. */
  const unlink = async () => {
    isUnlinking.value = true;
    unlinkError.value = "";

    const result = await apiRequest(Endpoints.Auth.githubUnlink, {
      failure: Messages.Account.githubUnlinkFailed
    });

    if (result.ok) {
      githubLinked.value = false;
      githubLogin.value = "";
    } else {
      unlinkError.value = result.error;
    }
    isUnlinking.value = false;

    return result.ok;
  };

  return { isUnlinking, unlinkError, unlink };
};
