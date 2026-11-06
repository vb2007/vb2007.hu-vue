import { test as base, expect, type Route } from "@playwright/test";

/**
 * Stand-in for the vb2007.hu API. Every request that doesn't go to the preview server is routed
 * here and answered by pathname, so it works whatever API host the app was built against.
 *
 * A test arranges state through the helpers (`api.loggedInAs(...)`, `api.shortenReturns(...)`,
 * `api.hasShortLink(...)`, `api.hasPaste(...)`, `api.hasUpload(...)`, `api.quotaIs(...)`,
 * `api.hasUser(...)`, `api.limitsPasswordChecks()`, `api.limitsMailSends()`) before navigating; `hasUpload(..., { owner })` files an upload under another
 * username, for the admin's view of that user's uploads, which `api.holdsUserUploads()` keeps waiting until released and
 * `api.userUploadsFail()` answers with a bare 502, like a gateway; `api.loggedInAs(..., { superuser: true })` opens the admin page; `{ githubLinked: true }` links GitHub as @e2e-octocat, and `{ password: false }` makes it a GitHub-only account.
 * A password account's password is `api.password`: `MOCK_PASSWORD` until it's set or changed.
 * `PATCH /user/email` checks it too. It doesn't change the address: it "mails" `MOCK_EMAIL_CODE` to the new one and
 * answers 202, and `POST /user/email/confirm` with that code switches to it, like the API (vb2007/vb2007.hu-api#215).
 * A `hasUser(...)` address and `MOCK_SUPERUSER_EMAIL` get the same 202 and code: only the confirm refuses them, with 409
 * or 403, and drops the change (vb2007/vb2007.hu-api#291). `api.hasPendingEmail(...)` arranges a change that's already
 * waiting; a new code within a minute of the last one gets the API's cooldown 429 with `retryAfter`, and one sent over
 * 15 minutes ago has expired.
 * Every 429 sends `{ error, retryAfter }` like the API (vb2007/vb2007.hu-api#242): the cooldown's names its seconds, and the rate
 * limiters' (`limitsPasswordChecks()`, and `limitsMailSends()` for every route that mails a code, whose refused password resets go to
 * `limitedPasswordResets`) wait a fixed 15 or 57 minutes.
 * Like the API's domain checks (vb2007/vb2007.hu-api#217), the mock refuses addresses on `DISPOSABLE_DOMAINS` and
 * `UNDELIVERABLE_DOMAINS`, for a new address and for registering. `api.failsNextMail()` answers
 * the next code `PATCH /user/email` mails with the API's 503, which keeps the change that waited before, if any.
 * Every mailed code takes 5 tries, like the API's (vb2007/vb2007.hu-api#220), and the mock's clock is real time:
 * `api.clockRunsFor(ms)` moves it on, e.g. along with `page.clock.runFor(ms)`, so a cooldown can run out.
 * `api.capsCodeChecks()` refuses every code check (register verify, password reset confirm, e-mail confirm), even the right code,
 * for 23 hr 45 min like the daily cap; `api.limitsUsernameChecks()` refuses `GET /auth/username-available` for 42 seconds, and
 * `api.usernameChecks` counts how often it was asked.
 * Linking GitHub skips GitHub: `POST /auth/github/link` checks `api.password` (none for a GitHub-only account; 429 under `limitsPasswordChecks()`, 503 under `api.githubIsNotConfigured()`)
 * and answers a `url` on this mock, `/e2e-github/authorize`, which links @e2e-octocat and comes straight back to `/account?github=linked`, like the API (vb2007/vb2007.hu-api#243).
 * Visiting it without a started link comes back with `?oauthError=invalidState`. `GET /auth/github/link` does the same at once for a GitHub-only account,
 * which also confirms the user for setting a password or deleting the account, and sends a password account back with `?oauthError=passwordRequired`. `DELETE /auth/github/link` takes `api.password` too.
 * `DELETE /user` takes `api.password`, or the username for a GitHub-only account once GitHub confirmed it (vb2007/vb2007.hu-api#245).
 * `POST /auth/login` knows `MOCK_EMAIL` and every account arranged with `loggedInAs` or `hasUser(...)` or registered, whatever the address's case, and takes `api.password`.
 * There is one `api.password`, shared by every account: registering, setting, changing or resetting a password changes it for all of them.
 * An unknown address, a wrong password and a GitHub-only account all get the API's one 403 (vb2007/vb2007.hu-api#320).
 * Logging in, setting and changing the password set a fresh `__Host-VB-AUTH` cookie, like the API; a request that carries an older one is
 * answered as logged out. A test that arranges the user with `loggedInAs` sends no cookie, so this never gets in its way.
 * `api.locksLogins(retryAfter)` answers `POST /auth/login` with the API's 429 after too many failed attempts (vb2007/vb2007.hu-api#204),
 * with that many seconds as `retryAfter` (`null` sends `retryAfter: null`).
 * `GET /auth/username-available` counts `hasUser(...)` names and the logged-in user's as taken, whatever their case (vb2007/vb2007.hu-api#233).
 * `api.mailsResetLink()` returns a reset link's token for the `loggedInAs` account, or `MOCK_EMAIL`'s when logged out (both `MOCK_USER_ID`), or another one, which `POST /auth/password-reset/confirm-link` takes once; resetting, setting or changing an account's password or address voids its links.
 * `api.limitsResetLinks()` answers `POST /auth/password-reset/confirm-link` with the API's 429 after too many rejected links, which waits a fixed 15 minutes and leaves the link usable.
 * Registering mails `REGISTRATION_CODE` and keeps only the address, like the API (vb2007/vb2007.hu-api#295): an address of a `hasUser(...)` account gets the same 202, and a taken name a 409.
 * `POST /auth/register/verify` takes the code with a username and password, which create and log in the account (the password becomes `api.password`). It answers 409 when the
 * address has an account (which ends the waiting registration) or the name was taken meanwhile (which keeps it, so the code still works with another name).
 * Each address waits for its own code, and a resend within a minute of the last code gets the API's 429.
 * A password reset only mails `api.passwordResetCode` to an account's address: the logged-in user's or a `hasUser(...)` one.
 * The code works once, for 30 minutes, and confirms the address for the account's next login.
 * Upload links point at a cdn host this mock also answers, with a tiny PNG for every file. For a one-off response, register `page.route(...)` in the test itself:
 * routes added later take precedence over this one. Like the API (vb2007/vb2007.hu-api#361), every answer signs a private upload's link
 * for an hour on the mock's clock (`?expires=<unix s>&sig=…`; `api.uploads` keeps the plain one), and the cdn refuses a private file
 * without a link that's still live with a 403. Public links stay plain.
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

/** `newSession` sets a fresh `__Host-VB-AUTH` cookie and retires the previous one. */
type MockResponse = { status: number; body?: unknown; location?: string; newSession?: boolean };

/**
 * The API's 429s once its password checks or its mail sends are limited. Like every rate limiter's,
 * they say how long to wait (vb2007/vb2007.hu-api#242), though no code was sent: only the code
 * cooldown's means one was. The waits are fixed, so a label that counts them reads the same for a minute.
 */
const PASSWORD_CHECKS_LIMITED: MockResponse = {
  status: 429,
  body: { error: "Too many failed attempts: try again later.", retryAfter: 900 }
};
const MAIL_SENDS_LIMITED: MockResponse = {
  status: 429,
  body: { error: "Too many e-mails requested: try again later.", retryAfter: 3412 }
};
/** The daily cap of 20 rejected codes, which refuses even the right one, for most of a day. */
const CODE_CHECKS_CAPPED: MockResponse = {
  status: 429,
  body: { error: "Too many failed attempts: try again later.", retryAfter: 85_500 }
};
const USERNAME_CHECKS_LIMITED: MockResponse = {
  status: 429,
  body: { error: "Too many username checks requested: try again later.", retryAfter: 42 }
};

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
/** The password account `POST /auth/login` knows from the start. */
export const MOCK_EMAIL = "me@example.com";
/** The `_id` of `MOCK_EMAIL`'s account and of the one `loggedInAs` arranges, which their reset links start with. */
export const MOCK_USER_ID = "e2e0e2e0e2e0e2e0e2e0e2e0";
/** The code `PATCH /user/email` "mails" to the new address. */
export const MOCK_EMAIL_CODE = "246810";
/** The API's `SUPERUSER_EMAIL`, which `POST /user/email/confirm` keeps from other accounts. */
export const MOCK_SUPERUSER_EMAIL = "admin@example.com";
const DEFAULT_QUOTA = 10 * 1024 * MB;
/** What mongoose's `ObjectId.isValid` accepts as a string: 24 hex characters. */
const OBJECT_ID = /^[0-9a-f]{24}$/i;

/** The code the mock "mails" after `POST /auth/register` (vb2007/vb2007.hu-api#28). */
export const REGISTRATION_CODE = "123456";

/** The API refuses these domains and their subdomains (vb2007/vb2007.hu-api#217). */
export const DISPOSABLE_DOMAINS = ["mailinator.com"];
/** Domains whose DNS takes no mail, which the API refuses too. */
export const UNDELIVERABLE_DOMAINS = ["no-mail.invalid"];

const normalizeEmail = (email: string) => email.trim().toLowerCase();
const normalizeCode = (code?: string) => code?.replace(/\s/g, "");

/** The API's refusal of an address's domain, if it has one. */
const domainError = (email: string) => {
  const domain = email.split("@").pop()!;
  const isOn = (domains: string[]) =>
    domains.some((listed) => domain === listed || domain.endsWith(`.${listed}`));
  if (isOn(DISPOSABLE_DOMAINS)) {
    return "Disposable (temporary) e-mail addresses can't be used: use a permanent one.";
  }
  if (isOn(UNDELIVERABLE_DOMAINS)) {
    return "This e-mail address's domain can't receive e-mail: check it for typos.";
  }
};

/** A mailed code, like the API's (vb2007/vb2007.hu-api#220): one a minute, 5 tries. */
type MockCode = { sentAt: number; expiresAt: number; attempts: number };
const CODE_TRIES = 5;
const CODE_COOLDOWN_MS = 60_000;
const invalidCode = (): MockResponse => ({
  status: 400,
  body: { error: "The code is wrong, expired or already used: check it or request a new one." }
});

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

/**
 * The API's `validateUri` (`src/helpers/text.ts` in vb2007/vb2007.hu-api): one of these prefixes,
 * whatever its case, and no whitespace.
 */
const URI_PREFIXES = [
  "acap://",
  "app://",
  "file://",
  "ftp://",
  "ftps://",
  "http://",
  "https://",
  "icap://",
  "imap://",
  "irc://",
  "mailto:",
  "ms-access:",
  "ms-excel:",
  "ms-infopath:",
  "ms-powerpoint:",
  "ms-project:",
  "ms-publisher:",
  "ms-spd:",
  "ms-visio:",
  "ms-word:",
  "msteams://",
  "mtqp://",
  "nntp://",
  "pop://",
  "rsync://",
  "rtmp://",
  "rtsp://",
  "sftp://",
  "shortcuts://",
  "smb://",
  "smtp://",
  "ssh://",
  "telnet://",
  "viber://",
  "webcal://",
  "wss://",
  "xmpp://",
  "zoomus://",
  "zoommtg://"
];
const isValidUri = (url: unknown): url is string =>
  typeof url === "string" &&
  !/\s/.test(url) &&
  URI_PREFIXES.some((prefix) => url.toLowerCase().startsWith(prefix));

interface MockUser {
  _id: string;
  email: string;
  username: string;
  isSuperuser: boolean;
  hasPassword: boolean;
  emailVerified: boolean;
  githubId?: string;
  githubLogin?: string;
}

export class MockApi {
  private user: MockUser | null = null;
  /** The accounts `POST /auth/login` knows; logging in makes one of them `user` again. */
  private readonly accounts: MockUser[] = [
    {
      _id: MOCK_USER_ID,
      email: MOCK_EMAIL,
      username: "e2e",
      isSuperuser: false,
      hasPassword: true,
      emailVerified: false
    }
  ];
  /** A new address waiting for `MOCK_EMAIL_CODE`. */
  private emailChange: (MockCode & { email: string }) | null = null;
  /** Seconds of cooldown the next `PATCH /user/email` finds left, whenever it arrives (see `hasPendingEmail`). */
  private emailCooldownOnSend: number | null = null;
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
  /** The only `__Host-VB-AUTH` value still accepted; each new session replaces it. */
  private session = "";
  private sessionCount = 0;
  /** Registrations waiting for their code, by address: only the code, like the API's (vb2007/vb2007.hu-api#295). */
  private readonly pendingRegistrations = new Map<string, MockCode>();
  /** Password reset codes waiting, by account address. */
  private readonly resetCodes = new Map<string, MockCode>();
  /** Addresses a password reset confirmed, verified at their next login. */
  private readonly verifiedAddresses = new Set<string>();
  private mailFails = false;
  /** How far `clockRunsFor` moved the mock's clock past real time. */
  private clockOffset = 0;
  private cdnOrigin = "https://cdn.e2e.invalid";
  private appOrigin = "";
  /** A fresh GitHub login or relink, which `POST /user/password` needs (vb2007/vb2007.hu-api#183). */
  private githubConfirmed = false;
  private passwordChecksLimited = false;
  private mailSendsLimited = false;
  private resetLinksLimited = false;
  private codeChecksCapped = false;
  private usernameChecksLimited = false;
  /** How often `GET /auth/username-available` was asked, limited or not. */
  usernameChecks = 0;
  /** Set by `locksLogins`: the `retryAfter` of the login's 429. */
  private loginLockout: { retryAfter: number | null } | null = null;
  /** A `POST /auth/github/link` waiting for its trip to the mock's GitHub authorize page. */
  private githubLinkStarted = false;
  private githubUnconfigured = false;
  /** What the admin's view of a user's uploads waits for before it answers (see `holdsUserUploads`). */
  private userUploadsHold: Promise<void> | null = null;
  private userUploadsDown = false;
  /** The API host the app was built against, known once the app has called it. */
  apiOrigin = "";
  /** The code every password reset "mails"; the addresses asked for go to `passwordResets`. */
  readonly passwordResetCode = "123456";
  readonly passwordResets: string[] = [];
  /** The reset links still live (see `mailsResetLink`): token -> the account's id and address. */
  private readonly resetLinks = new Map<string, { userId: string; email: string }>();
  private resetLinkCount = 0;
  /** The addresses a password reset was asked for while `limitsMailSends()` refused it. */
  readonly limitedPasswordResets: string[] = [];
  readonly unhandled: string[] = [];

  loggedOut() {
    this.user = null;
  }

  loggedInAs(
    email = "e2e@example.com",
    username = "e2e",
    { superuser = false, githubLinked = false, password = true, emailVerified = false } = {}
  ) {
    this.user = {
      _id: MOCK_USER_ID,
      email,
      username,
      isSuperuser: superuser,
      hasPassword: password,
      emailVerified
    };
    if (githubLinked) {
      this.user.githubId = "583231";
      this.user.githubLogin = "e2e-octocat";
    }
    this.knowsAccount(this.user);
  }

  /** Lets `POST /auth/login` find `user`, replacing an account with the same address. */
  private knowsAccount(user: MockUser) {
    const index = this.accounts.findIndex(
      (account) => normalizeEmail(account.email) === normalizeEmail(user.email)
    );
    if (index === -1) this.accounts.push(user);
    else this.accounts[index] = user;
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
    // A password reset can reach this account, so logging in reaches it too; an arranged one stays.
    const email = normalizeEmail(user.email);
    if (!this.accounts.some((account) => normalizeEmail(account.email) === email)) {
      this.accounts.push({
        _id: user.id,
        email: user.email,
        username,
        isSuperuser: false,
        hasPassword: true,
        emailVerified: false
      });
    }
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

  /**
   * A change to `email` that waits for its code, mailed `sentSecondsAgo`. With `cooldownLeftOnSend`, the next
   * request for a code finds exactly that many seconds of the API's cooldown left, however long the page took to
   * get there: a slow CI host can't run a short cooldown out before the test reaches "Send code".
   */
  hasPendingEmail(
    email: string,
    {
      sentSecondsAgo = 120,
      cooldownLeftOnSend
    }: { sentSecondsAgo?: number; cooldownLeftOnSend?: number } = {}
  ) {
    this.emailChange = { email, ...this.newCode(15, this.now() - sentSecondsAgo * 1000) };
    this.emailCooldownOnSend = cooldownLeftOnSend ?? null;
  }

  /**
   * "Mails" a reset link for the account `userId` at `email` and returns its token, which
   * `POST /auth/password-reset/confirm-link` takes once, like the API (vb2007/vb2007.hu-api#256).
   */
  mailsResetLink(userId = MOCK_USER_ID, email = this.user?.email ?? MOCK_EMAIL) {
    const token = `${userId}.${`${++this.resetLinkCount}`.padStart(43, "e2e_-")}`;
    this.resetLinks.set(token, { userId, email });
    return token;
  }

  /** Voids the reset links of the accounts `matches` picks, as resetting or changing the password or address does. */
  private voidResetLinks(matches: (link: { userId: string; email: string }) => boolean) {
    for (const [token, link] of this.resetLinks) {
      if (matches(link)) this.resetLinks.delete(token);
    }
  }

  /** Answers the next code `PATCH /user/email` mails with the API's 503, like a mail server that's down. */
  failsNextMail() {
    this.mailFails = true;
  }

  /** Moves the mock's clock on, e.g. along with `page.clock.runFor(ms)`, which only moves the page's. */
  clockRunsFor(ms: number) {
    this.clockOffset += ms;
  }

  private now() {
    return Date.now() + this.clockOffset;
  }

  private newCode(validMinutes: number, sentAt = this.now()): MockCode {
    return { sentAt, expiresAt: sentAt + validMinutes * 60_000, attempts: 0 };
  }

  /** Like the API's claim: a code that's still live, with tries left, uses one up. */
  private claims(code: MockCode | null | undefined): code is MockCode {
    if (!code || this.now() >= code.expiresAt || code.attempts >= CODE_TRIES) return false;
    code.attempts++;
    return true;
  }

  /** The API's 429 for a code asked for within a minute of the last one. */
  private resendTooSoon(sentAt = 0): MockResponse | undefined {
    const retryAfter = Math.ceil((sentAt + CODE_COOLDOWN_MS - this.now()) / 1000);
    if (retryAfter > 0) {
      return {
        status: 429,
        body: {
          error: `A code was sent just now: wait ${retryAfter} seconds before requesting another one.`,
          retryAfter
        }
      };
    }
  }

  /** Whether an account uses the address: the logged-in user's or a `hasUser(...)` one. */
  private hasAccount(email: string) {
    return [this.user?.email, ...this.users.map((user) => user.email)].some(
      (address) => address !== undefined && normalizeEmail(address) === email
    );
  }

  /** Answers password checks with 429, like the API after too many failed attempts. */
  limitsPasswordChecks() {
    this.passwordChecksLimited = true;
  }

  /** Answers every request that mails a code with 429, like the API past its hourly e-mail limit. */
  limitsMailSends() {
    this.mailSendsLimited = true;
  }

  /** Answers reset links with 429, like the API after too many rejected links from one network. */
  limitsResetLinks() {
    this.resetLinksLimited = true;
  }

  /**
   * Answers every code check (register verify, password reset confirm, e-mail confirm) with 429,
   * like the API at its daily cap of rejected codes, where even the right code is refused.
   */
  capsCodeChecks() {
    this.codeChecksCapped = true;
  }

  /** Answers `GET /auth/username-available` with 429, like the API past 30 checks a minute, until `false`. */
  limitsUsernameChecks(limited = true) {
    this.usernameChecksLimited = limited;
  }

  /** Answers logins with 429, like the API after too many failed attempts (vb2007/vb2007.hu-api#204). */
  locksLogins(retryAfter: number | null) {
    this.loginLockout = { retryAfter };
  }

  /** Answers `POST /auth/github/link` with the API's 503 for a server without GitHub's OAuth app. */
  githubIsNotConfigured() {
    this.githubUnconfigured = true;
  }

  /** Keeps the admin's view of a user's uploads waiting; call the returned function to answer. */
  holdsUserUploads() {
    let release!: () => void;
    this.userUploadsHold = new Promise((resolve) => (release = resolve));
    return () => {
      this.userUploadsHold = null;
      release();
    };
  }

  /** Answers the admin's view of a user's uploads with a 502 and no `{ error }`, like a gateway. */
  userUploadsFail() {
    this.userUploadsDown = true;
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
    if (url.origin !== this.cdnOrigin) this.apiOrigin = url.origin;
    if (url.origin === this.cdnOrigin && url.pathname.startsWith("/useruploads/")) {
      const upload = this.uploads.find((item) => new URL(item.url).pathname === url.pathname);
      const expires = Number(url.searchParams.get("expires"));
      const opens =
        upload?.visibility === "public" ||
        (url.searchParams.has("sig") && expires * 1000 > this.now());
      return opens
        ? route.fulfill({ status: 200, contentType: "image/png", body: PIXEL })
        : route.fulfill({ status: 403 });
    }

    if (this.userUploadsHold && /^\/admin\/users\/[^/]+\/uploads$/.test(url.pathname)) {
      await this.userUploadsHold;
    }

    const contentType = (await request.headerValue("content-type")) ?? "";
    if (contentType.startsWith("multipart/form-data")) {
      const response = this.receiveUpload(parseMultipart(request.postDataBuffer()!, contentType));
      return route.fulfill({ status: response.status, headers, json: response.body });
    }

    const cookie = (await request.headerValue("cookie")) ?? "";
    const sentSession = cookie.match(/(?:^|;\s*)__Host-VB-AUTH=([^;]+)/)?.[1];
    const response =
      sentSession && sentSession !== this.session
        ? this.staleSession()
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
      const sessionCookie = `__Host-VB-AUTH=${this.session}; Path=/; HttpOnly; Secure; SameSite=None`;
      return route.fulfill({
        status: response.status,
        headers: { ...headers, "Set-Cookie": sessionCookie },
        json: response.body ?? {}
      });
    }
    return route.fulfill({ status: response.status, headers, json: response.body ?? {} });
  }

  /** What the API answers a session it has replaced: logged out. */
  private staleSession(): MockResponse {
    return { status: 403, body: { error: "You must be logged in to perform this action." } };
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
      token?: string;
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
          : { status: 403, body: { error: "You must be logged in to perform this action." } };
      case "POST /auth/login":
        return this.login(body?.email, body?.password);
      case "DELETE /user":
        return this.deleteAccount(body);
      case "POST /auth/logout":
        this.user = null;
        return { status: 200 };
      case "GET /auth/github/link":
        if (!this.user) {
          return { status: 302, location: `${this.appOrigin}/account?oauthError=notLoggedIn` };
        }
        // Only an account without a password may link through a plain navigation (vb2007/vb2007.hu-api#243).
        if (this.user.hasPassword) {
          return {
            status: 302,
            location: `${this.appOrigin}/account?oauthError=passwordRequired`
          };
        }
        return this.linkGithub();
      case "POST /auth/github/link":
        return this.startGithubLink(body?.password);
      case "GET /e2e-github/authorize":
        // Stands in for GitHub's authorize page, which approves at once and returns to the API's callback.
        if (!this.githubLinkStarted) {
          return { status: 302, location: `${this.appOrigin}/account?oauthError=invalidState` };
        }
        this.githubLinkStarted = false;
        return this.linkGithub();
      case "POST /user/password":
        return this.setPassword(body?.password);
      case "DELETE /auth/github/link": {
        const guarded = this.guardGithubLink();
        if (guarded || !this.user) return guarded;
        if (!this.user.githubId) {
          return { status: 404, body: { error: "No GitHub account is linked to this account." } };
        }
        if (!this.user.hasPassword) {
          return {
            status: 403,
            body: {
              error:
                "This account has no password: set one before unlinking GitHub, since it's the only way to log in."
            }
          };
        }
        const refusal = this.checkGithubPassword(body?.password);
        if (refusal) return refusal;
        delete this.user.githubId;
        delete this.user.githubLogin;
        return { status: 200, body: { message: "GitHub account unlinked successfully." } };
      }
      case "PATCH /user/email":
        return this.changeEmail(body?.email, body?.password);
      case "POST /user/email/confirm":
        if (this.user && this.codeChecksCapped) return CODE_CHECKS_CAPPED;
        return this.confirmEmail(body?.code);
      case "PATCH /user/password":
        return this.changePassword(body?.currentPassword, body?.newPassword);
      case "GET /auth/username-available": {
        this.usernameChecks++;
        if (this.usernameChecksLimited) return USERNAME_CHECKS_LIMITED;
        const name = (query.get("username") ?? "").toLowerCase();
        const taken = [...this.users.map((user) => user.username), this.user?.username].some(
          (username) => username?.toLowerCase() === name
        );
        return { status: 200, body: { available: !taken } };
      }
      case "POST /auth/register":
        if (this.mailSendsLimited) return MAIL_SENDS_LIMITED;
        return this.register(body);
      case "POST /auth/register/verify":
        if (this.codeChecksCapped) return CODE_CHECKS_CAPPED;
        return this.verifyRegistration(body);
      case "POST /auth/register/resend":
        if (this.mailSendsLimited) return MAIL_SENDS_LIMITED;
        return this.resendRegistrationCode(body?.email);
      case "POST /auth/password-reset": {
        if (this.mailSendsLimited) {
          this.limitedPasswordResets.push(body?.email ?? "");
          return MAIL_SENDS_LIMITED;
        }
        if (!body?.email) {
          return { status: 400, body: { error: "You must provide an E-mail address." } };
        }
        this.passwordResets.push(body.email);
        // Like the API, only an account's address gets a code, at most one a minute.
        const email = normalizeEmail(body.email);
        if (this.hasAccount(email) && !this.resendTooSoon(this.resetCodes.get(email)?.sentAt)) {
          this.resetCodes.set(email, this.newCode(30));
        }
        return {
          status: 200,
          body: {
            message: "If an account uses this address, a password reset code was sent to it."
          }
        };
      }
      case "POST /auth/password-reset/confirm":
        if (this.codeChecksCapped) return CODE_CHECKS_CAPPED;
        return this.confirmPasswordReset(body);
      case "POST /auth/password-reset/confirm-link":
        // The limit counts failed tries, like the password checks', and uses no link up.
        if (this.resetLinksLimited) return PASSWORD_CHECKS_LIMITED;
        return this.confirmPasswordResetLink(body);
      case "POST /shortenUrl/create":
        return this.shorten((body as { url?: unknown } | null)?.url);
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
   * Like the API (vb2007/vb2007.hu-api#320): one 403 for an unknown address, a wrong password and
   * an account without a password, so it doesn't reveal which addresses have accounts.
   */
  private login(email?: string, password?: string): MockResponse {
    if (this.loginLockout) {
      const { retryAfter } = this.loginLockout;
      return {
        status: 429,
        body: { error: "Too many failed attempts: try again later.", retryAfter }
      };
    }
    if (!email?.trim() || !password) {
      return { status: 400, body: { error: "You must provide an E-mail address and a password." } };
    }
    const account = this.accounts.find(
      (candidate) => normalizeEmail(candidate.email) === normalizeEmail(email)
    );
    if (!account?.hasPassword || password !== this.password) {
      return {
        status: 403,
        body: {
          error:
            "Incorrect e-mail address or password. If you signed up with GitHub, log in with GitHub."
        }
      };
    }
    if (this.verifiedAddresses.has(normalizeEmail(email))) account.emailVerified = true;
    this.user = account;
    return { status: 200, newSession: true };
  }

  /** Links @e2e-octocat and comes back to the account page, which also confirms the user. */
  private linkGithub(): MockResponse {
    this.user!.githubId = "583231";
    this.user!.githubLogin = "e2e-octocat";
    this.githubConfirmed = true;
    return { status: 302, location: `${this.appOrigin}/account?github=linked` };
  }

  /**
   * What runs before the GitHub link routes' own checks: the API's `isAuthenticated`, then its shared password limit
   * (vb2007/vb2007.hu-api#243). Undefined when the request gets through.
   */
  private guardGithubLink(): MockResponse | undefined {
    if (!this.user) {
      return { status: 403, body: { error: "You must be logged in to perform this action." } };
    }
    if (this.passwordChecksLimited) {
      return PASSWORD_CHECKS_LIMITED;
    }
  }

  /** The password linking and unlinking GitHub take (vb2007/vb2007.hu-api#243); undefined when it's right. */
  private checkGithubPassword(password?: string): MockResponse | undefined {
    if (!password) {
      return {
        status: 400,
        body: { error: "You must provide your password to link or unlink GitHub." }
      };
    }
    if (password !== this.password) {
      return { status: 403, body: { error: "The provided password is incorrect." } };
    }
  }

  /** `POST /auth/github/link`: answers where GitHub's authorize page is, here on the mock API. */
  private startGithubLink(password?: string): MockResponse {
    const guarded = this.guardGithubLink();
    if (guarded) return guarded;
    if (this.githubUnconfigured) return { status: 503, body: { error: "notConfigured" } };
    if (this.user!.hasPassword) {
      const refusal = this.checkGithubPassword(password);
      if (refusal) return refusal;
    }
    this.githubLinkStarted = true;
    return { status: 200, body: { url: `${this.apiOrigin}/e2e-github/authorize?state=e2e` } };
  }

  /**
   * Like the API, one code a minute per address; the one sent then still works. An address that
   * has an account gets the same answers, so registering doesn't reveal it.
   */
  private register(body: { email?: string; username?: string; password?: string } | null) {
    if (this.isUsernameTaken(body?.username)) {
      return { status: 409, body: { error: "This username is already taken." } };
    }
    const email = normalizeEmail(body?.email ?? "");
    const refusal = domainError(email);
    if (refusal) return { status: 400, body: { error: refusal } };
    const tooSoon = this.resendTooSoon(this.pendingRegistrations.get(email)?.sentAt);
    if (tooSoon) return tooSoon;
    this.pendingRegistrations.set(email, this.newCode(15));
    return {
      status: 202,
      body: {
        message: `A confirmation code was sent to ${email}: send it to POST /auth/register/verify to finish registering.`
      }
    };
  }

  /** A waiting registration gets a new code, at most one a minute; the answer doesn't say whether one waits. */
  private resendRegistrationCode(address?: string) {
    const pending = this.pendingRegistrations.get(normalizeEmail(address ?? ""));
    if (pending) {
      const tooSoon = this.resendTooSoon(pending.sentAt);
      if (tooSoon) return tooSoon;
      Object.assign(pending, this.newCode(15));
    }
    return {
      status: 200,
      body: {
        message:
          "If a registration is waiting for this address, a new confirmation code was sent to it."
      }
    };
  }

  /**
   * Checks in the API's order (vb2007/vb2007.hu-api#162, #215 and #217). Another account's address
   * and the superuser's pass, so they don't show which addresses have accounts
   * (vb2007/vb2007.hu-api#291): `confirmEmail` refuses them.
   */
  private changeEmail(email?: string, password?: string) {
    if (!this.user) {
      return { status: 403, body: { error: "You must be logged in to perform this action." } };
    }
    if (this.passwordChecksLimited) {
      return PASSWORD_CHECKS_LIMITED;
    }
    // Like the API's middleware, the mail limit comes after the password checks' and before the rest.
    if (this.mailSendsLimited) return MAIL_SENDS_LIMITED;
    if (!email || !password) {
      return {
        status: 400,
        body: { error: "You must provide an E-mail address and a password." }
      };
    }
    const normalized = email.trim().toLowerCase();
    // The API's isValidEmail (vb2007/vb2007.hu-api#288): plain addresses only.
    const atom = "[a-z0-9!#$%&'*+/=?^_`{|}~-]+";
    const label = "[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?";
    const plain = new RegExp(`^${atom}(?:\\.${atom})*@${label}(?:\\.${label})+$`);
    if (normalized.length > 254 || normalized.indexOf("@") > 64 || !plain.test(normalized)) {
      return {
        status: 400,
        body: { error: "The e-mail address is invalid: must match name@provider.com format." }
      };
    }
    if (this.user.isSuperuser) {
      return {
        status: 403,
        body: {
          error:
            "The superuser's e-mail address can't be changed here: change SUPERUSER_EMAIL in .env instead."
        }
      };
    }
    if (!this.user.hasPassword) {
      return {
        status: 409,
        body: {
          error: "This account has no password: set one before changing the e-mail address."
        }
      };
    }
    if (password !== this.password) {
      return { status: 403, body: { error: "The provided password is incorrect." } };
    }
    if (normalized === this.user.email) {
      return { status: 200, body: { message: "E-mail address updated successfully." } };
    }
    const refusal = domainError(normalized);
    if (refusal) return { status: 400, body: { error: refusal } };
    if (this.emailChange && this.emailCooldownOnSend !== null) {
      this.emailChange.sentAt = this.now() - (60 - this.emailCooldownOnSend) * 1000;
      this.emailCooldownOnSend = null;
    }
    const tooSoon = this.resendTooSoon(this.emailChange?.sentAt);
    if (tooSoon) return tooSoon;
    if (this.mailFails) {
      // Like the API, the change that waited before (if any) stays, so a new code may go at once.
      this.mailFails = false;
      return {
        status: 503,
        body: { error: "The e-mail couldn't be sent: please try again later." }
      };
    }
    this.emailChange = { email: normalized, ...this.newCode(15) };
    return {
      status: 202,
      body: {
        message: `A confirmation code was sent to ${normalized}: send it to POST /user/email/confirm to switch to that address.`
      }
    };
  }

  /** Whether an account has `username`, whatever its case, like `GET /auth/username-available`. */
  private isUsernameTaken(username?: string) {
    const name = username?.trim().toLowerCase();
    return [...this.users.map((user) => user.username), this.user?.username].some(
      (taken) => taken?.toLowerCase() === name
    );
  }

  /**
   * `POST /auth/register/verify`: the waiting registration only holds the address and code, so the
   * account gets the username and password sent here (vb2007/vb2007.hu-api#295).
   */
  private verifyRegistration(
    body: { email?: string; code?: string; username?: string; password?: string } | null
  ): MockResponse {
    const { code, username, password } = body ?? {};
    if (!body?.email || !code || !username || !password) {
      return {
        status: 400,
        body: {
          error:
            "You must provide an E-mail address, the confirmation code, a username and a password."
        }
      };
    }
    const nameLength = username.trim().length;
    if (nameLength < 2 || nameLength > 16) {
      const which = nameLength < 2 ? "short" : "long";
      return {
        status: 400,
        body: { error: `The username's too ${which}: it must be between 2 and 16 characters.` }
      };
    }
    if (password.length < 8 || password.length > 128) {
      const which = password.length < 8 ? "short" : "long";
      return {
        status: 400,
        body: { error: `The password's too ${which}: it must be between 8 and 128 characters.` }
      };
    }
    const email = normalizeEmail(body.email);
    if (
      !this.claims(this.pendingRegistrations.get(email)) ||
      normalizeCode(code) !== REGISTRATION_CODE
    ) {
      return invalidCode();
    }
    if (this.hasAccount(email)) {
      this.pendingRegistrations.delete(email);
      return {
        status: 409,
        body: { error: "An account with this E-mail address already exists." }
      };
    }
    if (this.isUsernameTaken(username)) {
      // Waiting registrations don't hold a name: the code still works with another one.
      return { status: 409, body: { error: "This username is already taken." } };
    }
    this.user = {
      _id: MOCK_USER_ID,
      email,
      username: username.trim(),
      isSuperuser: false,
      hasPassword: true,
      // Entering the mailed code confirms the address.
      emailVerified: true
    };
    this.knowsAccount(this.user);
    this.password = password;
    this.pendingRegistrations.delete(email);
    // Like logging in, confirming the code starts a session.
    return {
      status: 201,
      body: { message: `User ${this.user.username} registered successfully.` },
      newSession: true
    };
  }

  /** A waiting change's code works for 15 minutes; after that, GET /user leaves it out. */
  private isEmailChangeLive() {
    return this.emailChange !== null && this.now() < this.emailChange.expiresAt;
  }

  /**
   * Checks in the API's order (vb2007/vb2007.hu-api#215 and #291): a right code for the superuser's
   * address gets 403 and one for another account's 409, and either drops the waiting change.
   */
  private confirmEmail(code?: string) {
    if (!this.user) {
      return { status: 403, body: { error: "You must be logged in to perform this action." } };
    }
    if (!code) return { status: 400, body: { error: "You must provide the confirmation code." } };
    if (!this.claims(this.emailChange) || normalizeCode(code) !== MOCK_EMAIL_CODE) {
      return invalidCode();
    }
    const { email } = this.emailChange;
    this.emailChange = null;
    if (email === MOCK_SUPERUSER_EMAIL) {
      return { status: 403, body: { error: "This e-mail address is reserved for the superuser." } };
    }
    if (this.users.some((user) => user.email === email)) {
      return {
        status: 409,
        body: { error: "An account with this E-mail address already exists." }
      };
    }
    this.voidResetLinks(({ userId }) => userId === this.user!._id);
    this.user.email = email;
    this.user.emailVerified = true;
    return { status: 200, body: { message: "E-mail address updated successfully." } };
  }

  private changePassword(currentPassword?: string, newPassword?: string) {
    if (!this.user) return { status: 403, body: { error: "You are not logged in." } };
    if (this.passwordChecksLimited) {
      return PASSWORD_CHECKS_LIMITED;
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
    this.voidResetLinks(({ userId }) => userId === this.user!._id);
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
    this.voidResetLinks(({ userId }) => userId === this.user!._id);
    return { status: 200, body: { message: "Password set successfully." }, newSession: true };
  }

  private deleteAccount(body: { password?: string; username?: string } | null) {
    if (!this.user) {
      return { status: 403, body: { error: "You must be logged in to perform this action." } };
    }
    if (this.passwordChecksLimited) {
      return PASSWORD_CHECKS_LIMITED;
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
      if (!this.githubConfirmed) {
        return {
          status: 403,
          body: {
            error:
              "Confirm it's you first: log in with GitHub again (or relink it), then delete the account within 10 minutes."
          }
        };
      }
    }
    const index = this.accounts.indexOf(this.user);
    if (index !== -1) this.accounts.splice(index, 1);
    this.user = null;
    this.githubConfirmed = false;
    return { status: 200, body: { message: "User deleted successfully." } };
  }

  /**
   * Like the API: the right code for an account that asked for one sets the password, confirms the
   * address and ends every session of the account. The code works once.
   */
  private confirmPasswordReset(
    body: { email?: string; code?: string; newPassword?: string } | null
  ): MockResponse {
    if (!body?.email || !body.code || !body.newPassword) {
      return {
        status: 400,
        body: { error: "You must provide the E-mail address, the code and a new password." }
      };
    }
    const lengthProblem = this.resetPasswordLengthError(body.newPassword);
    if (lengthProblem) return lengthProblem;
    const email = normalizeEmail(body.email);
    if (
      !this.claims(this.resetCodes.get(email)) ||
      normalizeCode(body.code) !== this.passwordResetCode
    ) {
      return invalidCode();
    }
    this.resetCodes.delete(email);
    this.password = body.newPassword;
    this.verifiedAddresses.add(email);
    // A reset by code voids the account's mailed links too.
    this.voidResetLinks((link) => normalizeEmail(link.email) === email);
    if (this.user && normalizeEmail(this.user.email) === email) {
      this.user = null;
    }
    return {
      status: 200,
      body: { message: "Password reset successfully: log in with the new password." }
    };
  }

  /** The API's 400 for a new password out of 8 to 128 characters; undefined when it fits. */
  private resetPasswordLengthError(password: string): MockResponse | undefined {
    const length = [...password].length;
    if (length >= 8 && length <= 128) return undefined;
    const problem = length < 8 ? "too short" : "too long";
    return {
      status: 400,
      body: { error: `The password's ${problem}: it must be between 8 and 128 characters.` }
    };
  }

  /**
   * Like the API (vb2007/vb2007.hu-api#256): a live link's token sets the password once and ends
   * every session of its account. A password the API refuses leaves the link usable.
   */
  private confirmPasswordResetLink(body: { token?: string; newPassword?: string } | null) {
    const { token, newPassword } = body ?? {};
    if (typeof token !== "string" || !token || typeof newPassword !== "string" || !newPassword) {
      return {
        status: 400,
        body: { error: "You must provide the reset link's token and a new password." }
      };
    }
    const lengthProblem = this.resetPasswordLengthError(newPassword);
    if (lengthProblem) return lengthProblem;
    if (!this.resetLinks.has(token)) {
      return {
        status: 400,
        body: { error: "The reset link is wrong, expired or already used: request a new one." }
      };
    }
    const { userId } = this.resetLinks.get(token)!;
    // Using one link voids the account's others, like any new password.
    this.voidResetLinks((link) => link.userId === userId);
    this.password = newPassword;
    if (this.user?._id === userId) {
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
    return {
      status: 201,
      body: { message: "File uploaded successfully.", upload: this.served(upload) }
    };
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
    return {
      status: 200,
      body: { message: "Upload updated successfully.", upload: this.served(upload) }
    };
  }

  /** An upload as the API answers it: a private one's link is signed for an hour, like `signUploadPath`. */
  private served(upload: MockUpload): MockUpload {
    if (upload.visibility === "public") return upload;
    const expires = Math.floor(this.now() / 1000) + 60 * 60;
    return {
      ...upload,
      url: `${upload.url}?expires=${expires}&sig=${"e2e-signature_".padEnd(43, "0")}`
    };
  }

  /** What the API's `isAuthenticated` and `isSuperuser` answer before any admin route runs. */
  private refuseNonSuperuser(): MockResponse | undefined {
    if (!this.user) {
      return { status: 403, body: { error: "You must be logged in to perform this action." } };
    }
    if (!this.user.isSuperuser) {
      return { status: 403, body: { error: "You do not have permission to perform this action." } };
    }
  }

  /** The API's `validateMongooseId`: admin routes run it on `:id` after the superuser check. */
  private invalidId(): MockResponse {
    return {
      status: 400,
      body: { error: "Invalid ID format: must be a 24 character HEX string." }
    };
  }

  /** The admin's view of one user's uploads: the same listing, plus whose they are. */
  private listUserUploads(id: string, query: URLSearchParams) {
    const refusal = this.refuseNonSuperuser();
    if (refusal) return refusal;
    if (this.userUploadsDown) return { status: 502 };
    if (!OBJECT_ID.test(id)) return this.invalidId();
    const user = this.users.find((item) => item.id === id);
    if (!user) return { status: 404, body: { error: "There is no such user with that ID." } };
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
        uploads: matching
          .slice((page - 1) * limit, page * limit)
          .map((upload) => this.served(upload)),
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
    const refusal = this.refuseNonSuperuser();
    if (refusal) return refusal;
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
    const refusal = this.refuseNonSuperuser();
    if (refusal) return refusal;
    if (!OBJECT_ID.test(id)) return this.invalidId();
    const user = this.users.find((item) => item.id === id);
    if (!user) return { status: 404, body: { error: "There is no such user with that ID." } };
    const isQuota =
      typeof quotaBytes === "number" && Number.isSafeInteger(quotaBytes) && quotaBytes >= 0;
    if (quotaBytes !== null && !isQuota) {
      return {
        status: 400,
        body: {
          error: "quotaBytes must be a whole number of bytes from 0, or null for the default quota."
        }
      };
    }
    user.uploads.quotaBytes = quotaBytes ?? DEFAULT_QUOTA;
    user.uploads.hasCustomQuota = quotaBytes !== null;
    return { status: 200, body: { message: "Upload quota updated successfully.", user } };
  }

  /**
   * `POST /shortenUrl/create`, per user like the API (vb2007/vb2007.hu-api#247): the same user's URL again gets
   * their link back with a 200, anyone else's link to it doesn't count. A new link takes `shortenReturns`' code,
   * or that code numbered when it's taken.
   */
  private shorten(url: unknown): MockResponse {
    if (!this.user) {
      return { status: 403, body: { error: "You must be logged in to perform this action." } };
    }
    if (!isValidUri(url)) {
      return { status: 400, body: { error: "The URI/URL you've provided isn't valid." } };
    }
    // Like the API's SHORT_URL_MAX_LENGTH (vb2007/vb2007.hu-api#289).
    if (url.length > 2000) {
      return { status: 400, body: { error: "The URI/URL can be at most 2000 characters long." } };
    }
    const answer = (status: number, message: string, code: string) => {
      const link = this.shortLinks.get(code)!;
      return {
        status,
        body: {
          message,
          data: { shortenedUrl: code, originalUrl: url, addedOn: link.addedOn, addedBy: "u1" }
        }
      };
    };
    const username = this.user.username;
    const existing = [...this.shortLinks].find(
      ([, link]) => link.target === url && link.addedBy === username
    );
    if (existing) return answer(200, "You've already shortened this URL.", existing[0]);

    let code = this.shortCode;
    for (let n = 2; this.shortLinks.has(code); n++) code = `${this.shortCode}${n}`;
    this.hasShortLink(code, url, username);
    return answer(201, "URL shortened successfully", code);
  }

  /** Validates the query before it looks the user up, like the API (vb2007/vb2007.hu-api#241). */
  private listPastes(username: string, query: URLSearchParams) {
    if (!this.user) {
      return { status: 403, body: { error: "You must be logged in to perform this action." } };
    }
    const isIntegerInRange = (value: string, min: number, max: number) =>
      /^\d+$/.test(value) && Number(value) >= min && Number(value) <= max;
    const validators: [string, (value: string) => boolean][] = [
      ["limit", (value) => isIntegerInRange(value, 1, 50)],
      ["page", (value) => isIntegerInRange(value, 1, Number.MAX_SAFE_INTEGER)],
      ["sortBy", (value) => value === "addedOn"],
      ["sortOrder", (value) => value === "asc" || value === "desc"]
    ];
    // A repeated parameter reaches the API as an array, which no check accepts.
    const invalid = validators.find(
      ([param, isValid]) =>
        query.has(param) && (query.getAll(param).length > 1 || !isValid(query.get(param)!))
    );
    if (invalid) return { status: 400, body: { error: `Invalid value for ${invalid[0]}.` } };

    // Usernames match whatever their case, like the API's collation.
    const sameName = (name?: string) => name?.toLowerCase() === username.toLowerCase();
    const known = [
      this.user.username,
      ...this.accounts.map((account) => account.username),
      ...this.users.map((user) => user.username),
      ...this.pastes.map((paste) => paste.addedBy)
    ];
    if (!known.some(sameName)) {
      return { status: 404, body: { error: "There is no such user with that username." } };
    }

    const limit = Number(query.get("limit") ?? 10);
    const page = Number(query.get("page") ?? 1);
    const sortOrder = query.get("sortOrder") ?? "desc";
    const owned = this.pastes.filter((paste) => sameName(paste.addedBy));
    const sorted = sortOrder === "asc" ? owned : [...owned].reverse();
    return {
      status: 200,
      body: {
        pastes: sorted
          .slice((page - 1) * limit, page * limit)
          .map((paste) => ({ ...paste, addedBy: { _id: "u1", username: paste.addedBy } })),
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
