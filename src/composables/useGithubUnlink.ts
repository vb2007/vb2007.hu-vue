import { ref } from "vue";
import { UserManagement } from "@/constants/api";
import { githubLinked, githubLogin } from "@/scripts/authentication/authState";
import { errorFrom } from "@/scripts/pastebin/paste";

/** Unlinks the logged-in user's GitHub account (vb2007/vb2007.hu-api#134). */
export const useGithubUnlink = () => {
  const isUnlinking = ref(false);
  const unlinkError = ref("");

  /** Returns whether it worked. */
  const unlink = async () => {
    try {
      isUnlinking.value = true;
      unlinkError.value = "";

      const response = await fetch(UserManagement.Authentication.githubLink, {
        method: "DELETE",
        credentials: "include"
      });

      if (!response.ok) {
        unlinkError.value = await errorFrom(response, "Failed to unlink GitHub");
        console.error("Failed to unlink GitHub: ", response.status);
        return false;
      }

      githubLinked.value = false;
      githubLogin.value = "";
      return true;
    } catch (error) {
      unlinkError.value = "Error connecting to server";
      console.error("Error unlinking GitHub: ", error);
      return false;
    } finally {
      isUnlinking.value = false;
    }
  };

  return { isUnlinking, unlinkError, unlink };
};
