/**
 * The codes of the `?oauthError=` the API's GitHub login and linking redirect back with when they
 * fail (vb2007/vb2007.hu-api#128, #132); they mirror the API's `Responses.GithubOauth`.
 */
export class OauthError {
  static readonly notConfigured = "notConfigured";
  static readonly accessDenied = "accessDenied";
  static readonly invalidState = "invalidState";
  static readonly githubError = "githubError";
  static readonly noVerifiedEmail = "noVerifiedEmail";
  static readonly emailExists = "emailExists";
  static readonly githubAlreadyLinked = "githubAlreadyLinked";
  static readonly githubOtherLinked = "githubOtherLinked";
  static readonly notLoggedIn = "notLoggedIn";
  /** A link started through `GET /auth/github/link` by an account with a password (vb2007/vb2007.hu-api#243). */
  static readonly passwordRequired = "passwordRequired";
  /** A GitHub login into a suspended account, which starts no session (vb2007/vb2007.hu-api#273). */
  static readonly accountSuspended = "accountSuspended";
  /** A link callback sent with an `Authorization` header: linking takes the session alone, never an API key (vb2007/vb2007.hu-api#514). */
  static readonly apiKeyNotAccepted = "apiKeyNotAccepted";
}

export type OauthErrorCode = (typeof OauthError)[Exclude<keyof typeof OauthError, "prototype">];

/**
 * "Sign in with vb2007.hu" (vb2007/vb2007.hu-api#575): what the API's `GET /oauth/authorize` hands
 * the `/authorize` page, either the request's parameters or, for a request that can't go back to
 * the app, `?error=` with one of the codes below.
 */
export class AuthorizeQuery {
  static readonly error = "error";
  static readonly invalidClient = "invalid_client";
  static readonly invalidRedirectUri = "invalid_redirect_uri";
  /** The app's id, for `GET /oauth/clients/:clientId`. */
  static readonly clientId = "client_id";
  /** The parameters the page sends back with the answer, each required once. */
  static readonly params = [
    "response_type",
    AuthorizeQuery.clientId,
    "redirect_uri",
    "state",
    "code_challenge",
    "code_challenge_method",
    "nonce"
  ] as const;
}

/** The query parameters the API's GitHub redirects come back with. */
export class OauthQuery {
  /** Holds an `OauthError` code. */
  static readonly error = "oauthError";
  /** `?github=linked` after linking GitHub (vb2007/vb2007.hu-api#132). */
  static readonly github = "github";
  static readonly githubLinked = "linked";
  /** `?mfa=required` after a GitHub login whose account has a second step (vb2007/vb2007.hu-api#448). */
  static readonly mfa = "mfa";
  static readonly mfaRequired = "required";
}
