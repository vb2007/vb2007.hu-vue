/**
 * The API's GitHub login redirects back with `?oauthError=<code>` when it fails
 * (vb2007/vb2007.hu-api#128). These are the messages shown for each code.
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
  githubOtherLinked:
    "That isn't the GitHub account linked here. Switch to it on GitHub and try again.",
  notLoggedIn: "Your session ended before GitHub could be linked. Log in, then link GitHub again.",
  notConfigured: "GitHub login isn't available right now."
};

export const oauthErrorMessage = (code: string) =>
  OAUTH_ERRORS[code] ?? "GitHub login failed. Please try again.";
