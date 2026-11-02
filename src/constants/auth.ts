/** What `loginStatus` holds besides the API's own error message. */
export class LoginStatus {
  static readonly Success = "success";
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
