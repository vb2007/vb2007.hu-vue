import { test as base, expect, type Route } from "@playwright/test";

/**
 * Stand-in for the vb2007.hu API. Every request that doesn't go to the preview server is routed
 * here and answered by pathname, so it works whatever API host the app was built against.
 *
 * A test arranges state through the helpers (`api.loggedInAs(...)`, `api.shortenReturns(...)`,
 * `api.hasShortLink(...)`, `api.hasPaste(...)`, `api.hasUpload(...)`, `api.quotaIs(...)`,
 * `api.hasUser(...)`, `api.limitsPasswordChecks()`) before navigating; `hasUpload(..., { owner })` files an upload under another
 * username, for the admin's view of that user's uploads; `api.loggedInAs(..., { superuser: true })` opens the admin page; `{ githubLinked: true }` links GitHub as @e2e-octocat, and `{ password: false }` makes it a GitHub-only account.
 * A password account's password is `api.password`: `MOCK_PASSWORD` until it's set or changed.
 * `PATCH /user/email` checks it too, and `hasUser(...)` addresses count as taken. It doesn't change the address: it
 * "mails" `MOCK_EMAIL_CODE` to the new one and answers 202, and `POST /user/email/confirm` with that code switches to it,
 * like the API (vb2007/vb2007.hu-api#215). `api.hasPendingEmail(...)` arranges a change that's already waiting; a new code
 * within a minute of the last one gets the API's 429 with `retryAfter`, and one sent over 15 minutes ago has expired.
 * Linking GitHub (`GET /auth/github/link`) skips GitHub: it links @e2e-octocat and comes straight back to `/account?github=linked`, which also confirms the user for setting a password.
 * `DELETE /user` takes `api.password`, or the username for a GitHub-only account.
 * Logging in, setting and changing the password set a fresh `VB-AUTH` cookie, like the API; a request that carries an older one is
 * answered as logged out. A test that arranges the user with `loggedInAs` sends no cookie, so this never gets in its way.
 * Registering mails `REGISTRATION_CODE`, which `POST /auth/register/verify` takes to create and log in the account (with the registered password as `api.password`).
 * Upload links point at a cdn host this mock also answers, with a tiny PNG for every file. For a one-off response, register `page.route(...)` in the test itself:
 * routes added later take precedence over this one.
 *
 * Requests this mock doesn't know are aborted and fail the test at teardown, so e2e runs can
 * never reach a real server. Add a case to `respond` when the app starts calling a new endpoint.
 */
export interface MockPaste {
  _id: string;
  content: string;
  addedBy: string;
  addedOn: string;
  /** A highlight.js id (vb2007/vb2007.hu-api#123); left out for pastes from before it. */
  language?: string;
}

export interface MockUpload {
  id: string;
  originalFileName: string;
  extension: string;
  mimeType: string;
  fileSize: number;
  visibility: "public" | "private";
  url: string;
  uploadedOn: string;
  updatedOn: string;
}

/** A user as the admin list returns them (vb2007/vb2007.hu-api#120). */
export interface MockAdminUser {
  id: string;
  username: string;
  email: string;
  createdAt: string;
  isSuperuser: boolean;
  uploads: { usedBytes: number; count: number; quotaBytes: number; hasCustomQuota: boolean };
}

/** `newSession` sets a fresh `VB-AUTH` cookie and retires the previous one. */
type MockResponse = { status: number; body?: unknown; location?: string; newSession?: boolean };

type UploadCategory = "image" | "video" | "audio" | "document" | "archive";

/** A subset of the API's allowlist (vb2007/vb2007.hu-api#82), enough for the e2e files. */
const ALLOWED_TYPES: { mimeType: string; extension: string; category: UploadCategory }[] = [
  { mimeType: "image/png", extension: ".png", category: "image" },
  { mimeType: "image/jpeg", extension: ".jpg", category: "image" },
  { mimeType: "video/mp4", extension: ".mp4", category: "video" },
  { mimeType: "audio/mpeg", extension: ".mp3", category: "audio" },
  { mimeType: "application/pdf", extension: ".pdf", category: "document" },
  { mimeType: "text/plain", extension: ".txt", category: "document" },
  { mimeType: "application/zip", extension: ".zip", category: "archive" }
];
const CATEGORIES: UploadCategory[] = ["image", "video", "audio", "document", "archive"];
const MB = 1024 * 1024;
export const MOCK_PASSWORD = "e2e-password";
/** The code `PATCH /user/email` "mails" to the new address. */
export const MOCK_EMAIL_CODE = "246810";
const DEFAULT_QUOTA = 10 * 1024 * MB;

/** The code the mock "mails" after `POST /auth/register` (vb2007/vb2007.hu-api#28). */
export const REGISTRATION_CODE = "123456";

/** 1×1 PNG served for every cdn file, so thumbnails and previews load. */
const PIXEL = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk2Lb3PwAEtwJBEP5yGQAAAABJRU5ErkJggg==",
  "base64"
);

/** The `visibility` field and the file part of a multipart upload body. */
const parseMultipart = (body: Buffer, contentType: string) => {
  const boundary = contentType.match(/boundary=(.+)$/)![1];
  const parts = body.toString("latin1").split(`--${boundary}`);
  const field = (name: string) =>
    parts.find((part) => part.includes(`name="${name}"`))?.split("\r\n\r\n")[1];
  const filePart = parts.find((part) => part.includes('name="file"')) ?? "";
  const [headers, ...content] = filePart.split("\r\n\r\n");
  return {
    visibility: field("visibility")?.replace(/\r\n$/, ""),
    fileName: headers.match(/filename="([^"]*)"/)?.[1] ?? "",
    mimeType: headers.match(/Content-Type: (\S+)/i)?.[1] ?? "",
    // The part ends with CRLF before the next boundary.
    size: Math.max(0, content.join("\r\n\r\n").length - 2)
  };
};

export class MockApi {
  private user: {
    email: string;
    username: string;
    isSuperuser: boolean;
    hasPassword: boolean;
    emailVerified: boolean;
    githubId?: string;
    githubLogin?: string;
  } | null = null;
  /** A new address waiting for `MOCK_EMAIL_CODE`, and when its code was sent. */
  private emailChange: { email: string; sentAt: number } | null = null;
  private shortCode = "e2e123";
  /** Short code -> link, filled by shortening and by `hasShortLink`. */
  readonly shortLinks = new Map<string, { target: string; addedBy: string; addedOn: string }>();
  /** In-memory paste store, oldest first. */
  readonly pastes: MockPaste[] = [];
  private nextPasteId = 1;
  /** In-memory upload store, oldest first. */
  readonly uploads: MockUpload[] = [];
  /** Upload id -> the username it belongs to. */
  private readonly uploadOwners = new Map<string, string>();
  private nextUploadId = 1;
  private quotaBytes = DEFAULT_QUOTA;
  /** Accounts the admin page lists, oldest first. */
  readonly users: MockAdminUser[] = [];
  /** What `PATCH /user/password` checks the current password against, and changes. */
  password = MOCK_PASSWORD;
  /** The only `VB-AUTH` value still accepted; each new session replaces it. */
  private session = "";
  private sessionCount = 0;
  /** The registration waiting for its code, by `POST /auth/register`. */
  private pendingRegistration: {
    email: string;
    username: string;
    password: string;
    sentAt: number;
  } | null = null;
  private cdnOrigin = "https://cdn.e2e.invalid";
  private appOrigin = "";
  /** A fresh GitHub login or relink, which `POST /user/password` needs (vb2007/vb2007.hu-api#183). */
  private githubConfirmed = false;
  private passwordChecksLimited = false;
  /** The code every password reset "mails"; the addresses asked for go to `passwordResets`. */
  readonly passwordResetCode = "123456";
  readonly passwordResets: string[] = [];
  readonly unhandled: string[] = [];

  loggedOut() {
    this.user = null;
  }

  loggedInAs(
    email = "e2e@example.com",
    username = "e2e",
    { superuser = false, githubLinked = false, password = true, emailVerified = false } = {}
  ) {
    this.user = { email, username, isSuperuser: superuser, hasPassword: password, emailVerified };
    if (githubLinked) {
      this.user.githubId = "583231";
      this.user.githubLogin = "e2e-octocat";
    }
  }

  /** Adds an account to the admin list; `quotaBytes` makes it a custom quota. */
  hasUser(
    username: string,
    {
      usedBytes = 0,
      count = 0,
      quotaBytes
    }: { usedBytes?: number; count?: number; quotaBytes?: number } = {}
  ) {
    const user: MockAdminUser = {
      id: `${this.users.length + 1}`.padStart(24, "b"),
      username,
      email: `${username}@example.com`,
      // Each account is a day newer than the last, so sorting by date is deterministic.
      createdAt: new Date(Date.UTC(2026, 0, 1 + this.users.length)).toISOString(),
      isSuperuser: false,
      uploads: {
        usedBytes,
        count,
        quotaBytes: quotaBytes ?? DEFAULT_QUOTA,
        hasCustomQuota: quotaBytes !== undefined
      }
    };
    this.users.push(user);
    return user;
  }

  /** Stores a paste as if `username` had created it, in `language` if given, and returns it. */
  hasPaste(content: string, username = "e2e", language?: string) {
    const id = `${this.nextPasteId++}`.padStart(24, "0");
    // Each paste is a minute newer than the last, so sorting by date is deterministic.
    const addedOn = new Date(Date.UTC(2026, 9, 10, 12, this.pastes.length)).toISOString();
    const paste: MockPaste = { _id: id, content, addedBy: username, addedOn };
    if (language) paste.language = language;
    this.pastes.push(paste);
    return paste;
  }

  /** Stores an upload as if the logged-in user (or `owner`) had sent it, and returns it. */
  hasUpload(
    originalFileName: string,
    {
      fileSize = 2048,
      visibility = "private" as MockUpload["visibility"],
      owner = this.user?.username ?? "e2e"
    } = {}
  ) {
    const extension = originalFileName.slice(originalFileName.lastIndexOf(".")).toLowerCase();
    const type = ALLOWED_TYPES.find((allowed) => allowed.extension === extension)!;
    const id = `${this.nextUploadId++}`.padStart(24, "0");
    // Each upload is a minute newer than the last, so sorting by date is deterministic.
    const uploadedOn = new Date(Date.UTC(2026, 9, 10, 12, this.uploads.length)).toISOString();
    const upload: MockUpload = {
      id,
      originalFileName,
      extension,
      mimeType: type.mimeType,
      fileSize,
      visibility,
      url: `${this.cdnOrigin}/useruploads/${"a".repeat(24)}/${id}${extension}`,
      uploadedOn,
      updatedOn: uploadedOn
    };
    this.uploads.push(upload);
    this.uploadOwners.set(id, owner);
    return upload;
  }

  /** A change to `email` that waits for its code, mailed `sentSecondsAgo`. */
  hasPendingEmail(email: string, { sentSecondsAgo = 120 } = {}) {
    this.emailChange = { email, sentAt: Date.now() - sentSecondsAgo * 1000 };
  }

  /** Answers password checks with 429, like the API after too many failed attempts. */
  limitsPasswordChecks() {
    this.passwordChecksLimited = true;
  }

  quotaIs(bytes: number) {
    this.quotaBytes = bytes;
  }

  shortenReturns(code: string) {
    this.shortCode = code;
  }

  hasShortLink(code: string, target: string, addedBy = "e2e") {
    this.shortLinks.set(code, { target, addedBy, addedOn: "2026-10-10T12:00:00.000Z" });
  }

  async handle(route: Route, appOrigin: string) {
    this.appOrigin = appOrigin;
    const request = route.request();
    // The app calls the API cross-origin with credentials, so every answer needs CORS headers.
    const headers = {
      "Access-Control-Allow-Origin": appOrigin,
      "Access-Control-Allow-Credentials": "true",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS"
    };
    if (request.method() === "OPTIONS") {
      return route.fulfill({ status: 204, headers });
    }

    const url = new URL(request.url());
    if (url.origin === this.cdnOrigin && url.pathname.startsWith("/useruploads/")) {
      return route.fulfill({ status: 200, contentType: "image/png", body: PIXEL });
    }

    const contentType = (await request.headerValue("content-type")) ?? "";
    if (contentType.startsWith("multipart/form-data")) {
      const response = this.receiveUpload(parseMultipart(request.postDataBuffer()!, contentType));
      return route.fulfill({ status: response.status, headers, json: response.body });
    }

    const cookie = (await request.headerValue("cookie")) ?? "";
    const sentSession = cookie.match(/(?:^|;\s*)VB-AUTH=([^;]+)/)?.[1];
    const response =
      sentSession && sentSession !== this.session
        ? this.staleSession(`${request.method()} ${url.pathname}`)
        : this.respond(
            `${request.method()} ${url.pathname}`,
            request.postDataJSON(),
            url.searchParams
          );
    if (!response) {
      this.unhandled.push(`${request.method()} ${request.url()}`);
      return route.abort();
    }
    if (response.location) {
      return route.fulfill({ status: response.status, headers: { location: response.location } });
    }
    if (response.newSession) {
      this.session = `e2e-session-${++this.sessionCount}`;
      const sessionCookie = `VB-AUTH=${this.session}; Path=/; HttpOnly; Secure; SameSite=None`;
      return route.fulfill({
        status: response.status,
        headers: { ...headers, "Set-Cookie": sessionCookie },
        json: response.body ?? {}
      });
    }
    return route.fulfill({ status: response.status, headers, json: response.body ?? {} });
  }

  /** What the API answers a session it has replaced: logged out. */
  private staleSession(endpoint: string): MockResponse {
    return endpoint === "GET /user"
      ? { status: 401 }
      : { status: 403, body: { error: "You are not logged in." } };
  }

  private respond(
    endpoint: string,
    body: {
      email?: string;
      password?: string;
      code?: string;
      paste?: string;
      language?: string;
      originalFileName?: string;
      visibility?: MockUpload["visibility"];
      quotaBytes?: number | null;
      currentPassword?: string;
      newPassword?: string;
      username?: string;
    } | null,
    query: URLSearchParams
  ): MockResponse | undefined {
    const lookupRoute = endpoint.match(/^GET \/shortenUrl\/([^/]+)$/);
    if (lookupRoute) {
      const link = this.shortLinks.get(decodeURIComponent(lookupRoute[1]));
      // Shaped like the real API, which also populates the sharer's account.
      return link
        ? {
            status: 200,
            body: {
              originalUrl: link.target,
              addedBy: { _id: "u1", username: link.addedBy, createdAt: "2026-07-31T17:16:07.516Z" },
              addedOn: link.addedOn
            }
          }
        : { status: 404, body: { error: "The shortened URL cannot be found." } };
    }
    const redirectRoute = endpoint.match(/^GET \/r\/([^/]+)$/);
    if (redirectRoute) {
      const link = this.shortLinks.get(decodeURIComponent(redirectRoute[1]));
      return link
        ? { status: 302, location: link.target }
        : { status: 404, body: { error: "The shortened URL cannot be found." } };
    }
    const pasteRoute = endpoint.match(/^(GET|PATCH|DELETE) \/paste\/([^/]+)$/);
    if (pasteRoute) {
      return this.respondPaste(pasteRoute[1], decodeURIComponent(pasteRoute[2]), body?.language);
    }
    const listRoute = endpoint.match(/^GET \/pastes\/([^/]+)$/);
    if (listRoute) {
      return this.listPastes(decodeURIComponent(listRoute[1]), query);
    }

    const uploadRoute = endpoint.match(/^(PATCH|DELETE) \/upload\/([^/]+)$/);
    if (uploadRoute) {
      return this.editUpload(uploadRoute[1], decodeURIComponent(uploadRoute[2]), body);
    }

    const userUploadsRoute = endpoint.match(/^GET \/admin\/users\/([^/]+)\/uploads$/);
    if (userUploadsRoute) {
      return this.listUserUploads(decodeURIComponent(userUploadsRoute[1]), query);
    }
    const quotaRoute = endpoint.match(/^PATCH \/admin\/users\/([^/]+)\/upload-quota$/);
    if (quotaRoute) {
      return this.setQuota(decodeURIComponent(quotaRoute[1]), body?.quotaBytes);
    }

    switch (endpoint) {
      case "GET /admin/users":
        return this.listUsers(query);
      case "GET /uploads":
        return this.listUploads(query, this.user?.username);
      case "GET /uploads/usage":
        return this.usage();
      case "GET /user":
        return this.user
          ? {
              status: 200,
              body: {
                ...this.user,
                pendingEmail: this.isEmailChangeLive() ? this.emailChange!.email : null
              }
            }
          : { status: 401 };
      case "POST /auth/login":
        this.user = {
          email: body?.email ?? "e2e@example.com",
          username: "e2e",
          isSuperuser: false,
          hasPassword: true,
          emailVerified: false
        };
        return { status: 200, newSession: true };
      case "DELETE /user":
        return this.deleteAccount(body);
      case "POST /auth/logout":
        this.user = null;
        return { status: 200 };
      case "GET /auth/github/link":
        if (!this.user) {
          return { status: 302, location: `${this.appOrigin}/account?oauthError=notLoggedIn` };
        }
        this.user.githubId = "583231";
        this.user.githubLogin = "e2e-octocat";
        this.githubConfirmed = true;
        return { status: 302, location: `${this.appOrigin}/account?github=linked` };
      case "POST /user/password":
        return this.setPassword(body?.password);
      case "DELETE /auth/github/link":
        if (!this.user) return { status: 403, body: { error: "You are not logged in." } };
        if (!this.user.githubId)
          return { status: 404, body: { error: "No GitHub account is linked." } };
        if (!this.user.hasPassword) {
          return { status: 403, body: { error: "This account has no password." } };
        }
        delete this.user.githubId;
        delete this.user.githubLogin;
        return { status: 200, body: { message: "GitHub account unlinked successfully." } };
      case "PATCH /user/email":
        return this.changeEmail(body?.email, body?.password);
      case "POST /user/email/confirm":
        return this.confirmEmail(body?.code);
      case "PATCH /user/password":
        return this.changePassword(body?.currentPassword, body?.newPassword);
      case "POST /auth/register": {
        // Like the API, one code a minute per address; the one sent then still works.
        const waited = this.pendingRegistration
          ? Math.ceil(60 - (Date.now() - this.pendingRegistration.sentAt) / 1000)
          : 0;
        if (this.pendingRegistration?.email === body?.email && waited > 0) {
          return {
            status: 429,
            body: {
              error: `A code was sent just now: wait ${waited} seconds before requesting another one.`,
              retryAfter: waited
            }
          };
        }
        this.pendingRegistration = {
          email: body?.email ?? "",
          username: body?.username ?? "",
          password: body?.password ?? "",
          sentAt: Date.now()
        };
        return {
          status: 202,
          body: { message: `A confirmation code was sent to ${body?.email}.` }
        };
      }
      case "POST /auth/register/verify":
        if (
          !this.pendingRegistration ||
          body?.email !== this.pendingRegistration.email ||
          body?.code !== REGISTRATION_CODE
        ) {
          return {
            status: 400,
            body: {
              error: "The code is wrong, expired or already used: check it or request a new one."
            }
          };
        }
        this.user = {
          email: this.pendingRegistration.email,
          username: this.pendingRegistration.username,
          isSuperuser: false,
          hasPassword: true,
          // Entering the mailed code confirms the address.
          emailVerified: true
        };
        this.password = this.pendingRegistration.password;
        this.pendingRegistration = null;
        // Like logging in, confirming the code starts a session.
        return {
          status: 201,
          body: { message: `User ${this.user.username} registered successfully.` },
          newSession: true
        };
      case "POST /auth/register/resend":
        return {
          status: 200,
          body: {
            message:
              "If a registration is waiting for this address, a new confirmation code was sent to it."
          }
        };
      case "POST /auth/password-reset":
        if (!body?.email) {
          return { status: 400, body: { error: "You must provide an E-mail address." } };
        }
        this.passwordResets.push(body.email);
        return {
          status: 200,
          body: {
            message: "If an account uses this address, a password reset code was sent to it."
          }
        };
      case "POST /auth/password-reset/confirm":
        return this.confirmPasswordReset(body);
      case "POST /shortenUrl/create":
        this.hasShortLink(
          this.shortCode,
          (body as { url?: string } | null)?.url ?? "",
          this.user?.username
        );
        return { status: 200, body: { data: { shortenedUrl: this.shortCode } } };
      case "POST /paste":
        if (!this.user) return { status: 403, body: { error: "You are not logged in." } };
        return {
          status: 201,
          body: {
            message: "Paste created successfully.",
            paste: this.hasPaste(body?.paste ?? "", this.user.username, body?.language)
          }
        };
      default:
        return undefined;
    }
  }

  /**
   * Checks in the API's order (vb2007/vb2007.hu-api#162 and #215), short of the superuser-reserved
   * address and the domain checks.
   */
  private changeEmail(email?: string, password?: string) {
    if (!this.user) {
      return { status: 403, body: { error: "You must be logged in to perform this action." } };
    }
    if (this.passwordChecksLimited) {
      return { status: 429, body: { error: "Too many failed attempts: try again later." } };
    }
    if (!email || !password) {
      return {
        status: 400,
        body: { error: "You must provide an E-mail address and a password." }
      };
    }
    const normalized = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/.test(normalized)) {
      return {
        status: 400,
        body: { error: "The e-mail address is invalid: must match name@provider.com format." }
      };
    }
    if (this.user.isSuperuser) {
      return {
        status: 403,
        body: { error: "The superuser's e-mail address can't be changed here." }
      };
    }
    if (!this.user.hasPassword) {
      return { status: 409, body: { error: "This account has no password." } };
    }
    if (password !== this.password) {
      return { status: 403, body: { error: "The provided password is incorrect." } };
    }
    if (normalized === this.user.email) {
      return { status: 200, body: { message: "E-mail address updated successfully." } };
    }
    if (this.users.some((user) => user.email === normalized)) {
      return {
        status: 409,
        body: { error: "An account with this E-mail address already exists." }
      };
    }
    const retryAfter = Math.ceil(((this.emailChange?.sentAt ?? 0) + 60_000 - Date.now()) / 1000);
    if (retryAfter > 0) {
      return {
        status: 429,
        body: {
          error: `A code was sent just now: wait ${retryAfter} seconds before requesting another one.`,
          retryAfter
        }
      };
    }
    this.emailChange = { email: normalized, sentAt: Date.now() };
    return {
      status: 202,
      body: {
        message: `A confirmation code was sent to ${normalized}: send it to POST /user/email/confirm to switch to that address.`
      }
    };
  }

  /** A waiting change's code works for 15 minutes; after that, GET /user leaves it out. */
  private isEmailChangeLive() {
    return this.emailChange !== null && Date.now() < this.emailChange.sentAt + 15 * 60_000;
  }

  private confirmEmail(code?: string) {
    if (!this.user) return { status: 403, body: { error: "You are not logged in." } };
    if (!code) return { status: 400, body: { error: "You must provide the confirmation code." } };
    if (!this.isEmailChangeLive() || code.replace(/\s/g, "") !== MOCK_EMAIL_CODE) {
      return {
        status: 400,
        body: {
          error: "The code is wrong, expired or already used: check it or request a new one."
        }
      };
    }
    const { email } = this.emailChange!;
    this.emailChange = null;
    if (this.users.some((user) => user.email === email)) {
      return {
        status: 409,
        body: { error: "An account with this E-mail address already exists." }
      };
    }
    this.user.email = email;
    this.user.emailVerified = true;
    return { status: 200, body: { message: "E-mail address updated successfully." } };
  }

  private changePassword(currentPassword?: string, newPassword?: string) {
    if (!this.user) return { status: 403, body: { error: "You are not logged in." } };
    if (this.passwordChecksLimited) {
      return { status: 429, body: { error: "Too many failed attempts: try again later." } };
    }
    if (!currentPassword || !newPassword) {
      return {
        status: 400,
        body: { error: "You must provide the current password and a new password." }
      };
    }
    const length = [...newPassword].length;
    if (length < 8 || length > 128) {
      return {
        status: 400,
        body: {
          error: `The password's too ${length < 8 ? "short" : "long"}: it must be between 8 and 128 characters.`
        }
      };
    }
    if (!this.user.hasPassword) {
      return {
        status: 409,
        body: { error: "This account has no password: set one first with POST /user/password." }
      };
    }
    if (currentPassword !== this.password) {
      return { status: 403, body: { error: "The provided password is incorrect." } };
    }
    this.password = newPassword;
    return { status: 200, body: { message: "Password changed successfully." }, newSession: true };
  }

  private setPassword(password: string | undefined) {
    if (!this.user) {
      return { status: 403, body: { error: "You must be logged in to perform this action." } };
    }
    if (!password) return { status: 400, body: { error: "You must provide a password." } };
    const length = [...password].length;
    if (length < 8 || length > 128) {
      const problem = length < 8 ? "too short" : "too long";
      return {
        status: 400,
        body: { error: `The password's ${problem}: it must be between 8 and 128 characters.` }
      };
    }
    if (this.user.hasPassword) {
      return { status: 409, body: { error: "This account already has a password." } };
    }
    if (!this.githubConfirmed) {
      return {
        status: 403,
        body: {
          error:
            "Confirm it's you first: log in with GitHub again (or relink it), then set the password within 10 minutes."
        }
      };
    }
    this.user.hasPassword = true;
    this.password = password;
    this.githubConfirmed = false;
    return { status: 200, body: { message: "Password set successfully." }, newSession: true };
  }

  private deleteAccount(body: { password?: string; username?: string } | null) {
    if (!this.user) {
      return { status: 403, body: { error: "You must be logged in to perform this action." } };
    }
    if (this.passwordChecksLimited) {
      return { status: 429, body: { error: "Too many failed attempts: try again later." } };
    }
    if (this.user.hasPassword) {
      if (!body?.password) {
        return {
          status: 400,
          body: { error: "You must provide your password to delete this account." }
        };
      }
      if (body.password !== this.password) {
        return { status: 403, body: { error: "The provided password is incorrect." } };
      }
    } else {
      if (!body?.username) {
        return {
          status: 400,
          body: { error: "This account has no password: provide your username to delete it." }
        };
      }
      if (body.username !== this.user.username) {
        return {
          status: 403,
          body: { error: "The provided username doesn't match this account." }
        };
      }
    }
    this.user = null;
    return { status: 200, body: { message: "User deleted successfully." } };
  }

  /**
   * Like the API: the right code for an address that asked for one sets the password and ends
   * every session of the account.
   */
  private confirmPasswordReset(
    body: { email?: string; code?: string; newPassword?: string } | null
  ) {
    const length = [...(body?.newPassword ?? "")].length;
    if (length < 8 || length > 128) {
      const problem = length < 8 ? "too short" : "too long";
      return {
        status: 400,
        body: { error: `The password's ${problem}: it must be between 8 and 128 characters.` }
      };
    }
    const normalize = (email: string) => email.trim().toLowerCase();
    const asked = this.passwordResets.some(
      (email) => normalize(email) === normalize(body?.email ?? "")
    );
    if (!asked || body?.code?.replace(/\s/g, "") !== this.passwordResetCode) {
      return {
        status: 400,
        body: {
          error: "The code is wrong, expired or already used: check it or request a new one."
        }
      };
    }
    this.password = body.newPassword!;
    if (this.user && normalize(this.user.email) === normalize(body.email!)) {
      this.user = null;
    }
    return {
      status: 200,
      body: { message: "Password reset successfully: log in with the new password." }
    };
  }

  private respondPaste(method: string, id: string, language?: string) {
    if (!/^[0-9a-f]{24}$/.test(id)) {
      return { status: 400, body: { error: "Invalid ID format." } };
    }
    const index = this.pastes.findIndex((paste) => paste._id === id);
    if (index === -1) {
      return { status: 404, body: { error: "There is no such paste with that ID." } };
    }
    const paste = this.pastes[index];
    if (method === "GET") {
      // Populated like the real API does since vb2007/vb2007.hu-api#124.
      return {
        status: 200,
        body: { paste: { ...paste, addedBy: { _id: "u1", username: paste.addedBy } } }
      };
    }
    if (!this.user) return { status: 403, body: { error: "You are not logged in." } };
    if (method === "PATCH") {
      if (paste.addedBy !== this.user.username && !this.user.isSuperuser) {
        return { status: 403, body: { error: "You are not authorized." } };
      }
      if (!/^[a-z0-9+#-]{1,32}$/.test(language ?? "")) {
        return { status: 400, body: { error: "That isn't a valid language." } };
      }
      paste.language = language;
      return { status: 200, body: { message: "Paste updated successfully.", paste } };
    }
    const [deleted] = this.pastes.splice(index, 1);
    return { status: 200, body: { message: "Paste deleted successfully.", paste: deleted } };
  }

  private usedBytes() {
    return this.uploads.reduce((sum, upload) => sum + upload.fileSize, 0);
  }

  private usage() {
    if (!this.user) return { status: 403, body: { error: "You are not logged in." } };
    const categoryOf = (upload: MockUpload) =>
      ALLOWED_TYPES.find((type) => type.mimeType === upload.mimeType)!.category;
    return {
      status: 200,
      body: {
        usedBytes: this.usedBytes(),
        quotaBytes: this.quotaBytes,
        count: this.uploads.length,
        maxFileSizeBytes: 100 * MB,
        allowedTypes: ALLOWED_TYPES,
        byCategory: CATEGORIES.map((category) => {
          const inCategory = this.uploads.filter((upload) => categoryOf(upload) === category);
          return {
            category,
            bytes: inCategory.reduce((sum, upload) => sum + upload.fileSize, 0),
            count: inCategory.length
          };
        })
      }
    };
  }

  private receiveUpload(part: ReturnType<typeof parseMultipart>) {
    if (!this.user) return { status: 403, body: { error: "You are not logged in." } };
    const extension = part.fileName.slice(part.fileName.lastIndexOf(".")).toLowerCase();
    if (!ALLOWED_TYPES.some((type) => type.extension === extension)) {
      return { status: 415, body: { error: "This file type isn't supported." } };
    }
    if (this.usedBytes() + part.size > this.quotaBytes) {
      return { status: 413, body: { error: "This upload would go over your storage quota." } };
    }
    const upload = this.hasUpload(part.fileName, {
      fileSize: part.size,
      visibility: part.visibility === "public" ? "public" : "private"
    });
    return { status: 201, body: { message: "File uploaded successfully.", upload } };
  }

  private editUpload(
    method: string,
    id: string,
    body: { originalFileName?: string; visibility?: MockUpload["visibility"] } | null
  ) {
    if (!this.user) return { status: 403, body: { error: "You are not logged in." } };
    const index = this.uploads.findIndex((upload) => upload.id === id);
    if (index === -1) return { status: 404, body: { error: "There is no such upload." } };
    if (method === "DELETE") {
      this.uploads.splice(index, 1);
      return { status: 200, body: { message: "Upload deleted successfully.", upload: { id } } };
    }
    const upload = this.uploads[index];
    Object.assign(upload, body, { updatedOn: "2026-10-11T08:30:00.000Z" });
    return { status: 200, body: { message: "Upload updated successfully.", upload } };
  }

  /** The admin's view of one user's uploads: the same listing, plus whose they are. */
  private listUserUploads(id: string, query: URLSearchParams) {
    if (!this.user?.isSuperuser) {
      return { status: 403, body: { error: "You do not have permission to perform this action." } };
    }
    const user = this.users.find((item) => item.id === id);
    if (!user) return { status: 404, body: { error: "There is no such user." } };
    const listing = this.listUploads(query, user.username);
    return {
      ...listing,
      body: { ...listing.body, user: { id: user.id, username: user.username } }
    };
  }

  private listUploads(query: URLSearchParams, owner: string | undefined) {
    if (!this.user) return { status: 403, body: { error: "You are not logged in." } };
    const limit = Number(query.get("limit") ?? 20);
    const page = Number(query.get("page") ?? 1);
    const sortBy = (query.get("sortBy") ?? "uploadedOn") as keyof MockUpload;
    const sortOrder = query.get("sortOrder") ?? "desc";
    const visibility = query.get("visibility");
    const q = query.get("q")?.toLowerCase();
    const matching = this.uploads
      .filter((upload) => this.uploadOwners.get(upload.id) === owner)
      .filter((upload) => !visibility || upload.visibility === visibility)
      .filter((upload) => !q || upload.originalFileName.toLowerCase().includes(q))
      .sort((a, b) => {
        const order = String(a[sortBy]).localeCompare(String(b[sortBy]), "en", { numeric: true });
        return sortOrder === "asc" ? order : -order;
      });
    return {
      status: 200,
      body: {
        uploads: matching.slice((page - 1) * limit, page * limit),
        pagination: {
          limit,
          page,
          total: matching.length,
          pages: Math.ceil(matching.length / limit),
          sortBy,
          sortOrder
        }
      }
    };
  }

  private listUsers(query: URLSearchParams) {
    if (!this.user?.isSuperuser) {
      return { status: 403, body: { error: "You do not have permission to perform this action." } };
    }
    const limit = Number(query.get("limit") ?? 20);
    const page = Number(query.get("page") ?? 1);
    const sortBy = query.get("sortBy") ?? "usedBytes";
    const sortOrder = query.get("sortOrder") ?? "desc";
    const q = query.get("q")?.toLowerCase();
    const value = (user: MockAdminUser) =>
      sortBy === "usedBytes" ? String(user.uploads.usedBytes) : String(user[sortBy as "username"]);
    const matching = this.users
      .filter((user) => !q || user.username.toLowerCase().includes(q))
      .sort((a, b) => {
        const order = value(a).localeCompare(value(b), "en", { numeric: true });
        return sortOrder === "asc" ? order : -order;
      });
    return {
      status: 200,
      body: {
        users: matching.slice((page - 1) * limit, page * limit),
        pagination: {
          limit,
          page,
          total: matching.length,
          pages: Math.ceil(matching.length / limit),
          sortBy,
          sortOrder
        }
      }
    };
  }

  private setQuota(id: string, quotaBytes: number | null | undefined) {
    if (!this.user?.isSuperuser) {
      return { status: 403, body: { error: "You do not have permission to perform this action." } };
    }
    const user = this.users.find((item) => item.id === id);
    if (!user) return { status: 404, body: { error: "There is no such user." } };
    if (quotaBytes !== null && !Number.isInteger(quotaBytes)) {
      return { status: 400, body: { error: "The quota must be a whole number of bytes or null." } };
    }
    user.uploads.quotaBytes = quotaBytes ?? DEFAULT_QUOTA;
    user.uploads.hasCustomQuota = quotaBytes !== null;
    return { status: 200, body: { message: "Upload quota updated.", user } };
  }

  private listPastes(username: string, query: URLSearchParams) {
    if (!this.user) return { status: 403, body: { error: "You are not logged in." } };
    const limit = Number(query.get("limit") ?? 10);
    const page = Number(query.get("page") ?? 1);
    const sortOrder = query.get("sortOrder") ?? "desc";
    const owned = this.pastes.filter((paste) => paste.addedBy === username);
    const sorted = sortOrder === "asc" ? owned : [...owned].reverse();
    return {
      status: 200,
      body: {
        pastes: sorted
          .slice((page - 1) * limit, page * limit)
          .map((paste) => ({ ...paste, addedBy: { _id: "u1", username } })),
        pagination: {
          limit,
          page,
          total: owned.length,
          pages: Math.ceil(owned.length / limit),
          sortBy: "addedOn",
          sortOrder
        }
      }
    };
  }
}

export const test = base.extend<{ api: MockApi }>({
  api: [
    async ({ page, baseURL }, use) => {
      const appOrigin = new URL(baseURL!).origin;
      const api = new MockApi();
      await page.route(
        (url) => url.origin !== appOrigin,
        (route) => api.handle(route, appOrigin)
      );

      await use(api);

      expect(api.unhandled, "requests the e2e API mock does not handle").toEqual([]);
    },
    // Auto: every test gets the mock, even one that never touches `api` directly.
    { auto: true }
  ]
});

export { expect };
