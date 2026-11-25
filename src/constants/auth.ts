/** What `loginStatus` holds besides the API's own error message. */
export class LoginStatus {
  static readonly Success = "success";
  /** The password was right and the second step waits, with the methods in `mfaMethods`. */
  static readonly MfaRequired = "mfa-required";
  /** Failed without the API's message: offline, or an error without one. */
  static readonly UnknownError = "unknown-error";
}

/** What `registerStatus` holds besides the API's own error message. */
export class RegisterStatus {
  /** The account exists and its session works. */
  static readonly Success = "success";
  /** The account exists, but the browser didn't keep the session cookie. */
  static readonly NoSession = "no-session";
  /** Failed without the API's message: offline, or an error without one. */
  static readonly Error = "error";
}

/** The auth pages' paths, for links between them (the router's own routes spell them out). */
export class AuthPaths {
  static readonly Login = "/login";
  static readonly ResetPassword = "/reset-password";
}

/**
 * The deep link that opens "Create an API key" filled in, e.g. for an app that needs a key:
 * `/account/api-keys?newApiKey=1&name=…&scopes=pastes:read,pastes:write` (`/account` forwards it).
 */
export class ApiKeyLinkQuery {
  static readonly open = "newApiKey";
  static readonly keyName = "name";
  /** Comma-separated; the ones the account can't give a key are left out, and named. */
  static readonly scopes = "scopes";
}
