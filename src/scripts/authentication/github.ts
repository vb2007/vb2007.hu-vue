import { Messages } from "@/constants/messages";
import { OauthError, type OauthErrorCode } from "@/constants/oauth";

/**
 * The API's GitHub login redirects back with `?oauthError=<code>` when it fails
 * (vb2007/vb2007.hu-api#128). These are the messages shown for each code.
 */
const OAUTH_ERRORS: Record<OauthErrorCode, string> = {
  [OauthError.accessDenied]: "GitHub login was cancelled, so nothing changed.",
  // Also a link not started with the password from this page, or replaced by a newer one (vb2007/vb2007.hu-api#243).
  [OauthError.invalidState]:
    "The GitHub login or link took too long, was started elsewhere, or was replaced by a newer one. Please try again.",
  [OauthError.githubError]: "GitHub couldn't finish the login. Please try again in a moment.",
  [OauthError.noVerifiedEmail]:
    "Your GitHub account has no verified primary e-mail address. Verify one on GitHub, then try again.",
  [OauthError.emailExists]:
    "An account already uses your GitHub e-mail address. Log in with your password, then link GitHub on your account page.",
  [OauthError.githubAlreadyLinked]:
    "That GitHub account is already linked to another account here.",
  [OauthError.githubOtherLinked]:
    "That isn't the GitHub account linked here. Switch to it on GitHub and try again.",
  [OauthError.notLoggedIn]:
    "Your session ended before GitHub could be linked. Log in, then link GitHub again.",
  [OauthError.notConfigured]: "GitHub login isn't available right now.",
  [OauthError.passwordRequired]:
    "Linking GitHub takes your password. Press Link GitHub on this page and enter it there.",
  [OauthError.accountSuspended]: Messages.Auth.githubAccountSuspended
};

export const oauthErrorMessage = (code: string) =>
  OAUTH_ERRORS[code as OauthErrorCode] ?? "GitHub login failed. Please try again.";
