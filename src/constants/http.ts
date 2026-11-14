/** The HTTP methods the API uses. */
export class HttpMethod {
  static readonly Get = "GET";
  static readonly Post = "POST";
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
}

export class Header {
  static readonly ContentType = "Content-Type";
}

export class ContentType {
  static readonly Json = "application/json";
}

/** Whether a status is a success (2xx), like `Response.ok`; for XMLHttpRequest, which has no `ok`. */
export const isSuccessStatus = (status: number): boolean => status >= 200 && status < 300;
