import { UserManagement } from "@/constants/api";
import { githubLinked, githubLogin } from "@/scripts/authentication/authState";
import { errorFrom } from "@/scripts/pastebin/paste";

/**
 * The API's GitHub login redirects back with `?oauthError=<code>` when it fails: to `/login` when
 * logging in, to `/account` when linking (vb2007/vb2007.hu-api#128, #132). These are the messages
 * shown for each code.
 */
const OAUTH_ERRORS: Record<string, string> = {
  accessDenied: "GitHub login was cancelled, so nothing changed.",
  invalidState: "The GitHub login took too long or was started elsewhere. Please try again.",
  githubError: "GitHub couldn't finish the login. Please try again in a moment.",
  noVerifiedEmail:
    "Your GitHub account has no verified primary e-mail address. Verify one on GitHub, then try again.",
  emailExists:
    "An account already uses your GitHub e-mail address. Log in with your password, then link GitHub on your account page.",
  githubAlreadyLinked: "That GitHub account is already linked to another account here.",
  notLoggedIn: "Your session ended before GitHub could be linked. Log in, then link GitHub again.",
  notConfigured: "GitHub login isn't available right now."
};

export const oauthErrorMessage = (code: string) =>
  OAUTH_ERRORS[code] ?? "GitHub login failed. Please try again.";

/**
 * Unlinks GitHub from the logged-in account (vb2007/vb2007.hu-api#134). Returns why it failed, or
 * an empty string once it's unlinked.
 */
export const unlinkGithub = async () => {
  try {
    const response = await fetch(UserManagement.Authentication.githubLink, {
      method: "DELETE",
      credentials: "include"
    });

    if (!response.ok) {
      console.error("Failed to unlink GitHub: ", response.status);
      return await errorFrom(response, "Failed to unlink GitHub");
    }

    githubLinked.value = false;
    githubLogin.value = "";
    return "";
  } catch (error) {
    console.error("Error unlinking GitHub: ", error);
    return "Error connecting to server";
  }
};
