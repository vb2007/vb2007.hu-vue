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

export class Header {
  static readonly ContentType = "Content-Type";
}

export class ContentType {
  static readonly Json = "application/json";
}

/** Whether a status is a success (2xx), like `Response.ok`; for XMLHttpRequest, which has no `ok`. */
export const isSuccessStatus = (status: number): boolean => status >= 200 && status < 300;
