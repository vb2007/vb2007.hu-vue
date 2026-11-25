/** The HTTP methods the API uses. */
export class HttpMethod {
  static readonly Get = "GET";
  static readonly Post = "POST";
  static readonly Put = "PUT";
  static readonly Patch = "PATCH";
  static readonly Delete = "DELETE";
}

export type HttpMethodName = (typeof HttpMethod)[Exclude<keyof typeof HttpMethod, "prototype">];

/** The status codes the site reacts to. */
export class HttpStatus {
  static readonly Ok = 200;
  static readonly Accepted = 202;
  static readonly BadRequest = 400;
  static readonly Forbidden = 403;
  static readonly NotFound = 404;
  static readonly Conflict = 409;
  static readonly TooManyRequests = 429;
  static readonly InternalServerError = 500;
  static readonly ServiceUnavailable = 503;
}

/**
 * The `reason` an error body can carry, naming which kind of failure it is when the message
 * alone shouldn't decide (vb2007/vb2007.hu-api's `ErrorReason`).
 */
export class ErrorReason {
  /**
   * A code went out less than a minute ago and still works: the 429 of `POST /auth/register` and
   * `PATCH /user/email`. A rate limiter's 429 has no `reason`.
   */
  static readonly ResendCooldown = "resendCooldown";
  /**
   * The day's mail limit is used up, so nothing was sent: the 503 of `POST /auth/register`, its
   * resend and `PATCH /user/email`, with `retryAfter` up to the next UTC midnight (an upper bound,
   * since an API restart starts the count again). A 503 there without it is a failed send.
   */
  static readonly MailBudget = "mailBudget";
  /**
   * `POST /auth/mfa/email`'s 429 once the account got its login codes of the day
   * (`Limits.Mfa.emailsPerDay`), with `retryAfter`.
   */
  static readonly MfaEmailLimit = "mfaEmailLimit";
  /** The MFA 403 (every `/auth/mfa*` endpoint) without the step's cookie, e.g. the mailed link opened in another browser. */
  static readonly NoChallenge = "noChallenge";
  /** The MFA 403 once the login's second step ran out of time. */
  static readonly Expired = "expired";
  /** The MFA 403 once the second step's tries are used up. */
  static readonly TriesUsedUp = "triesUsedUp";
  /** The MFA 403 for anything else: a newer login replaced it, it finished already, MFA went off, a suspension. */
  static readonly Ended = "ended";
  /** `POST /user/mfa/totp/confirm`'s 400 once the setup's tries are used up. */
  static readonly SetupTriesUsedUp = "setupTriesUsedUp";
  /** `POST /user/mfa/totp/confirm`'s 400 once the setup ran out of time. */
  static readonly SetupExpired = "setupExpired";
  /** `POST /user/mfa/totp/confirm`'s 400 with no setup waiting for this session: never started, replaced, or already confirmed. */
  static readonly NoSetup = "noSetup";
}

/**
 * What an MFA setting's confirmation (`ReauthForm`) expects back besides a success: a missing (400)
 * or wrong (403) password, GitHub's reauth (403) and, turning a method on, an unconfirmed address
 * (409). They're the user's to fix, not faults, so they aren't logged.
 */
export const REAUTH_QUIET_STATUSES: readonly number[] = [
  HttpStatus.BadRequest,
  HttpStatus.Forbidden,
  HttpStatus.Conflict
];

export class Header {
  static readonly ContentType = "Content-Type";
}

export class ContentType {
  static readonly Json = "application/json";
  /** Raw bytes: a download the browser saves under its own name, extension untouched. */
  static readonly OctetStream = "application/octet-stream";
}

/** Whether a status is a success (2xx), like `Response.ok`; for XMLHttpRequest, which has no `ok`. */
export const isSuccessStatus = (status: number): boolean => status >= 200 && status < 300;
