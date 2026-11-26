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
  /** A GitHub login into a suspended account, which starts no session (vb2007/vb2007.hu-api#273). */
  static readonly accountSuspended = "accountSuspended";
  /** A link callback sent with an `Authorization` header: linking takes the session alone, never an API key (vb2007/vb2007.hu-api#514). */
  static readonly apiKeyNotAccepted = "apiKeyNotAccepted";
}

export type OauthErrorCode = (typeof OauthError)[Exclude<keyof typeof OauthError, "prototype">];

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
