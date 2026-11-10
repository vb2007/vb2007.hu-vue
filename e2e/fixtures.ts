import { isIP } from "node:net";
import { test as base, expect, type Page, type Route } from "@playwright/test";

/**
 * Stand-in for the vb2007.hu API. Every request that doesn't go to the preview server is routed
 * here and answered by pathname, so it works whatever API host the app was built against.
 *
 * A test arranges state through the helpers (`api.loggedInAs(...)`, `api.shortenReturns(...)`,
 * `api.hasShortLink(...)`, `api.hasPaste(...)`, `api.hasUpload(...)`, `api.quotaIs(...)`,
 * `api.hasUser(...)`, `api.limitsPasswordChecks()`, `api.limitsMailSends()`) before navigating; `hasUpload(..., { owner })` files an upload under another
 * username, for the admin's view of that user's uploads, which `api.holdsUserUploads()` keeps waiting until released and
 * `api.userUploadsFail()` answers with a bare 502, like a gateway; `GET /admin/uploads` lists every owner's, each with its owner
 * (the `hasUser(...)` account by that name, whatever its case, else a login's, else `null`, as for a deleted account), its `q` matching the owner's name too.
 * The superuser is one address, like the API's `SUPERUSER_EMAIL`: `MOCK_SUPERUSER_EMAIL` until `api.loggedInAs(..., { superuser: true })`
 * or `hasUser(..., { superuser: true })` makes it that account's instead (arranging a second address throws). Every check goes by the session's address (the admin
 * routes, `GET /user`'s `isSuperuser`, deleting or changing anyone's paste or short link), so logging in there opens the admin page;
 * its overview counts `GET /admin/stats` from the mock's own admin list, pastes, short links and uploads (`api.statsFail()` makes it a bare 502),
 * and `GET /admin/mail-budget` reports `api.sentMailToday(n)` mails (0 by default) of the API's default 250; `{ githubLinked: true }` links GitHub as @e2e-octocat, and `{ password: false }` makes it a GitHub-only account.
 * A password account's password is `api.password`: `MOCK_PASSWORD` until it's set or changed.
 * `PATCH /user/email` checks it too. It doesn't change the address: it "mails" `MOCK_EMAIL_CODE` to the new one and
 * answers 202, and `POST /user/email/confirm` with that code switches to it, like the API (vb2007/vb2007.hu-api#215).
 * Another account's address (any the login knows, see below) and the superuser's get the same 202 and code: only the confirm refuses them, with 409
 * or 403, and drops the change (vb2007/vb2007.hu-api#291). `api.hasPendingEmail(...)` arranges a change that's already
 * waiting; a new code within a minute of the last one gets the API's cooldown 429 with `retryAfter`, and one sent over
 * 15 minutes ago has expired.
 * Every 429 sends `{ error, retryAfter }` like the API (vb2007/vb2007.hu-api#242): the cooldown's names its seconds, and the rate
 * limiters' (`limitsPasswordChecks()`, and `limitsMailSends()` for every route that mails a code, whose refused password resets go to
 * `limitedPasswordResets`) wait a fixed 15 or 57 minutes.
 * Like the API's domain checks (vb2007/vb2007.hu-api#217), the mock refuses addresses on `DISPOSABLE_DOMAINS` and
 * `UNDELIVERABLE_DOMAINS`, for a new address and for registering. `api.failsNextMail()` fails the next code mail that is
 * actually sent, like a mail server that's down (vb2007/vb2007.hu-api#294): `PATCH /user/email` and `POST /auth/register` answer
 * the API's 503 and keep the change or registration that waited before (a new one isn't kept); `POST /auth/register/resend` and
 * `POST /auth/password-reset` answer 200 as ever and keep the code sent before. A request that sends no mail (a cooldown's 429 or,
 * for a resend, its silent 200, an address nobody waits on) leaves it for the next one.
 * The day's mails are counted like the API's (`api.sentMailToday(n)` sets the count, `GET /admin/mail-budget` reports it): every
 * mail the mock sends adds one (the codes, and the notices after an e-mail change or a password reset, which the budget can refuse
 * unseen), a failed code mail gives its count back, and each resend reserves one before it looks at the address, kept whatever
 * becomes of it. At `n` 200 of 250 or more registering fails the same way (503), and a resend answers the 503 the API gives
 * before it touches the code; from 225 a password reset mails nothing (still 200, keeping the code from before); at 250 every
 * mail is refused, `PATCH /user/email` too (503). Addresses on the reserved top-level domains (`.test`, `.example`, `.invalid`,
 * `.localhost`) are neither counted nor refused.
 * Every mailed code takes 5 tries, like the API's (vb2007/vb2007.hu-api#220), and the mock's clock is real time:
 * `api.clockRunsFor(ms)` moves it on, e.g. along with `page.clock.runFor(ms)`, so a cooldown can run out.
 * `api.capsCodeChecks()` refuses every code check (register verify, password reset confirm, e-mail confirm), even the right code,
 * for 23 hr 45 min like the daily cap; `api.limitsUsernameChecks()` refuses `GET /auth/username-available` for 42 seconds, and
 * `api.usernameChecks` counts how often it was asked.
 * Linking GitHub skips GitHub: `POST /auth/github/link` checks `api.password` (none for a GitHub-only account; 429 under `limitsPasswordChecks()`, 503 under `api.githubIsNotConfigured()`)
 * and answers a `url` on this mock, `/e2e-github/authorize`, which links @e2e-octocat and comes straight back to `/account?github=linked`, like the API (vb2007/vb2007.hu-api#243).
 * Visiting it without a started link comes back with `?oauthError=invalidState`. `GET /auth/github/link` does the same at once for a GitHub-only account,
 * which also confirms the user for setting a password or deleting the account, and sends a password account back with `?oauthError=passwordRequired`, and a GitHub-only one with `?oauthError=notConfigured` under `api.githubIsNotConfigured()`. `DELETE /auth/github/link` takes `api.password` too.
 * `DELETE /user` takes `api.password`, or the username for a GitHub-only account once GitHub confirmed it (vb2007/vb2007.hu-api#245).
 * `POST /auth/login` knows `MOCK_EMAIL` and every account arranged with `loggedInAs` or `hasUser(...)` or registered, whatever the address's case, and takes `api.password`.
 * One id is one account, like the API's: `MOCK_EMAIL`'s and the `loggedInAs` one share `MOCK_USER_ID`, so `loggedInAs` with another address
 * replaces `MOCK_EMAIL`'s account (arrange `hasUser(...)` for a second one). A `hasUser(...)` row at an address the login already knows takes
 * that account over with its own id and name, and with `password: false`, `githubLogin` and `emailVerified` when given, in either
 * order (the logged-in account aside, which stays as arranged), so `hasUser("me")` makes `MOCK_EMAIL`'s account "me", which a later `loggedInAs`
 * leaves alone. `DELETE /user` takes the account out of the login and the admin list, with its pastes, short links and uploads, like the admin's delete;
 * either delete also voids the account's waiting reset code, reset links and e-mail change, and forgets that a reset confirmed its address. The admin route refuses to suspend or delete the
 * superuser's address with 409, whatever the row's own flag, and its rows answer `isSuperuser` from the address too. A row's address
 * is its name's at example.com, normalized like the API's, and its upload usage (count and bytes) the uploads it owns, unless `usedBytes` or `count` stand in for both.
 * There is one `api.password`, shared by every account: registering, setting, changing or resetting a password changes it for all of them.
 * An unknown address, a wrong password and a GitHub-only account all get the API's one 403 (vb2007/vb2007.hu-api#320).
 * A suspended `hasUser(...)` account (`suspendedAt`, or suspended through `PATCH /admin/users/:id/suspension`) gets the API's
 * suspension 403 instead, but only after the right password, and its session answers as logged out (vb2007/vb2007.hu-api#273).
 * Suspending it through the admin route, or lifting a suspension, voids its waiting reset code, reset links and e-mail change, like the API's `setUserSuspension`.
 * Pastes and short links are kept by their owner's name, like uploads, and match it whatever its case, as the API's keying by id would.
 * Where the API populates the owner (`GET /paste/:id`, `GET /pastes/:username`, `GET /shortenUrl/:code`), it's named by its account's
 * current name, or the name it was filed under when no account has it.
 * Logging in, setting and changing the password set a fresh `__Host-VB-AUTH` cookie, like the API, and `api.replacesSession()` stands
 * in for a login elsewhere, which keeps the account logged in on a cookie the browser doesn't have. A request that carries an older one
 * gets the logged-out 403 on every route the API guards with `isAuthenticated`; the public ones (`PUBLIC_ROUTES`) answer it as a guest's.
 * A test that arranges the user with `loggedInAs` sends no cookie, so this never gets in its way.
 * `api.locksLogins(retryAfter)` answers `POST /auth/login` with the API's 429 after too many failed attempts (vb2007/vb2007.hu-api#204),
 * with that many seconds as `retryAfter` (`null` sends `retryAfter: null`); `locksLogins(retryAfter, email)` locks only that address, like the
 * API's limiters that count the address (`loginPerEmail`, and `loginPerAccount` with the IP), whatever its case.
 * Every account the login knows counts as taken, whether or not anyone is logged in to it, like the API's stored users: its address for
 * `POST /auth/register/verify`, `POST /user/email/confirm` and the password reset's code, and its name, trimmed and whatever its case, for
 * `GET /auth/username-available` and registering (vb2007/vb2007.hu-api#233). So `MOCK_EMAIL` and "e2e" are taken from the start.
 * `GET /auth/username-available`, registering, confirming the code and `PATCH /admin/users/:id` answer 400 first for a name the API's rule refuses (`usernameRefusal`).
 * `api.mailsResetLink()` returns a reset link's token for the logged-in account (with its id, e.g. `MOCK_USER_ID` for `loggedInAs`), or `MOCK_EMAIL`'s login's when logged out, or another one, which `POST /auth/password-reset/confirm-link` takes once; resetting, setting or changing an account's password or address voids its links
 * and the reset code waiting for its address, like the API's unset `passwordReset`.
 * `api.limitsResetLinks()` answers `POST /auth/password-reset/confirm-link` with the API's 429 after too many rejected links, which waits a fixed 15 minutes and leaves the link usable.
 * Registering mails `REGISTRATION_CODE` and keeps only the address, like the API (vb2007/vb2007.hu-api#295): an account's address gets the same 202, and a taken name a 409.
 * `POST /auth/register/verify` takes the code with a username and password, which create and log in the account (the password becomes `api.password`). It answers 409 when the
 * address has an account (which ends the waiting registration) or the name was taken meanwhile (which keeps it, so the code still works with another name).
 * Each address waits for its own code. Registering again within a minute of the last code gets the API's 429, but a resend
 * (`POST /auth/register/resend`) answers 200 whatever the address, even without a code or inside the minute, and then sends
 * nothing (the API answers before it looks); without an address, or one of only whitespace, it answers 400 first.
 * A password reset only mails `api.passwordResetCode` to an account's address, any the login knows, and not to a suspended `hasUser(...)` one. Without an address, or with one of only whitespace, it answers 400 before recording or mailing anything.
 * The code works once, for 30 minutes, and confirms the address for the account's next login.
 * `GET /shortenUrls` lists the logged-in user's short links (`hasShortLink(..., addedBy)` files one under another username), and
 * `DELETE /shortenUrl/:shortenedUrl` deletes the user's own, or any for the superuser; `api.shortLinks.delete(code)` takes one away behind the page's back.
 * `GET /admin/short-urls` lists every account's links from the same store for the superuser, with a `null` owner for an `addedBy` no account has.
 * The admin's System page lists `api.hasPendingRegistration(email, { expiresInMinutes })` sign-ups (newest expiry first, apart from the
 * register flow's own codes) and removes them by id. `api.countsRateLimit(name, { email, ip })` arranges a limiter counting for a key;
 * `DELETE /admin/rate-limits` empties every arranged one whose whole key it's given, answers their names in the API's order
 * (vb2007/vb2007.hu-api#284), and checks the body like the API. An e-mail alone also empties `loginPerAccount` from every IP, and an IP
 * with it only that IP's (vb2007/vb2007.hu-api#365). The account's own limiters and the daily wrong-code caps
 * (`accountCodeChecksPerAccount`, `passwordChecksPerAccount`, `passwordResetCodeFailures`, `emailChangeCodeFailures`,
 * `registrationCodeFailures`) go with the e-mail alone, with or without an IP, and an IP alone leaves them (vb2007/vb2007.hu-api#384).
 * Upload links point at a cdn host this mock also answers, with a tiny PNG for every file. For a one-off response, register `page.route(...)` in the test itself:
 * routes added later take precedence over this one. Like the API (vb2007/vb2007.hu-api#361), every answer signs a private upload's link
 * for an hour on the mock's clock (`?expires=<unix s>&sig=…`; `api.uploads` keeps the plain one), `GET /upload/:id` included, and the
 * cdn answers a private file without a link that's still live with a 404. Public links stay plain.
 * The admin can rename a `hasUser(...)` account (what it owns goes along), log it out (`api.loggedOutUsers` lists the ids; the
 * admin's own row, at the logged-in address, ends this session too) and delete it with what it owns (the admin's own row answers 409).
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
  /** When the superuser suspended them, or `null` (vb2007/vb2007.hu-api#273). */
  suspendedAt: string | null;
  uploads: { usedBytes: number; count: number; quotaBytes: number; hasCustomQuota: boolean };
}

/**
 * A `hasUser(...)` account as the mock keeps it: what the admin routes answer, less what the API derives on each
 * answer (`isSuperuser` from the address, the upload usage from the uploads), which `adminRow` adds.
 */
export interface MockListedUser extends Omit<MockAdminUser, "isSuperuser" | "uploads"> {
  uploads: Pick<MockAdminUser["uploads"], "quotaBytes" | "hasCustomQuota">;
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

/** The API's `Responses.notLoggedIn`: what `isAuthenticated` and its controllers tell a guest. */
const NOT_LOGGED_IN = {
  status: 403,
  body: { error: "You must be logged in to perform this action." }
} satisfies MockResponse;

/**
 * The routes the API serves without `isAuthenticated` (`src/router/*.ts` in vb2007/vb2007.hu-api, which has no session
 * middleware), so a session it has replaced still gets through, as a guest. Every other route refuses that session first.
 * `GET /e2e-github/authorize` stands in for the public `GET /auth/github/callback`.
 */
const PUBLIC_ROUTES = [
  /^GET \/(shortenUrl|r|paste)\/[^/]+$/,
  /^GET \/auth\/(username-available|github\/link)$/,
  /^POST \/auth\/(login|logout|register(\/resend|\/verify)?|password-reset(\/confirm|\/confirm-link)?)$/,
  /^GET \/e2e-github\/authorize$/
];

/** The API's `PASTE_LANGUAGE_MIN_LENGTH` and `PASTE_LANGUAGE_MAX_LENGTH`, and its `pasteLanguagePattern`. */
const PASTE_LANGUAGE_MIN_LENGTH = 1;
const PASTE_LANGUAGE_MAX_LENGTH = 32;
const PASTE_LANGUAGE = new RegExp(
  `^[a-z0-9+#-]{${PASTE_LANGUAGE_MIN_LENGTH},${PASTE_LANGUAGE_MAX_LENGTH}}$`
);

/** The API's `LIST_MAX_LIMIT` and `LIST_QUERY_MAX_LENGTH`. */
const LIST_MAX_LIMIT = 50;
const LIST_QUERY_MAX_LENGTH = 100;

/** A list's query parameter and the API's check of its value, from one of its `…ListValidators` records. */
type ListParamCheck = [param: string, isValid: (value: string) => boolean];

const isIntegerInRange = (value: string, min: number, max: number) =>
  /^\d+$/.test(value) && Number(value) >= min && Number(value) <= max;
const isOneOf =
  (...values: string[]) =>
  (value: string) =>
    values.includes(value);

const LIMIT_CHECK: ListParamCheck = [
  "limit",
  (value) => isIntegerInRange(value, 1, LIST_MAX_LIMIT)
];
const PAGE_CHECK: ListParamCheck = [
  "page",
  (value) => isIntegerInRange(value, 1, Number.MAX_SAFE_INTEGER)
];
const SORT_ORDER_CHECK: ListParamCheck = ["sortOrder", isOneOf("asc", "desc")];
const isListQuery = (value: string) => value.length <= LIST_QUERY_MAX_LENGTH;

/** `findInvalidPasteListParam`'s checks, in its order: a user's pastes take no `q`. */
const PASTE_LIST_CHECKS: ListParamCheck[] = [
  LIMIT_CHECK,
  PAGE_CHECK,
  ["sortBy", isOneOf("addedOn")],
  SORT_ORDER_CHECK
];
/** `findInvalidAdminPasteListParam`'s checks, in its order. */
const ADMIN_PASTE_LIST_CHECKS: ListParamCheck[] = [...PASTE_LIST_CHECKS, ["q", isListQuery]];
/** `findInvalidShortUrlListParam`'s checks, in its order, for the user's links and the admin's. */
const SHORT_URL_LIST_CHECKS: ListParamCheck[] = [
  LIMIT_CHECK,
  PAGE_CHECK,
  ["sortBy", isOneOf("addedOn")],
  SORT_ORDER_CHECK,
  ["q", (value) => isListQuery(value) && !value.includes("\0")]
];
/** `findInvalidPendingRegistrationListParam`'s checks, in its order: no sorting, so `sortBy` and `sortOrder` pass unread. */
const PENDING_REGISTRATION_LIST_CHECKS: ListParamCheck[] = [
  LIMIT_CHECK,
  PAGE_CHECK,
  ["q", isListQuery]
];
/** `findInvalidUserListParam`'s checks, in its order. */
const USER_LIST_CHECKS: ListParamCheck[] = [
  LIMIT_CHECK,
  PAGE_CHECK,
  ["sortBy", isOneOf("usedBytes", "username", "createdAt")],
  SORT_ORDER_CHECK,
  ["q", isListQuery]
];
/** `findInvalidUploadListParam`'s checks, in its order: every upload list, the user's and the admin's. */
const UPLOAD_LIST_CHECKS: ListParamCheck[] = [
  LIMIT_CHECK,
  PAGE_CHECK,
  ["sortBy", isOneOf("uploadedOn", "originalFileName", "fileSize")],
  SORT_ORDER_CHECK,
  ["visibility", isOneOf("public", "private")],
  ["q", isListQuery]
];

/**
 * What the API's `findInvalid…ListParam` refuses: the first parameter in `checks`' order that is sent but fails
 * its check, answered with a 400. An empty value is checked as `""`, which only `q` takes. A repeated parameter
 * reaches the API as an array, which no check accepts. So do bracket keys like `limit[]=1` or `q[a]=x` (an array or
 * an object to the API's qs parser, so refused there), but the double doesn't model them: the site never sends them.
 */
function refuseListQuery(
  query: URLSearchParams,
  checks: ListParamCheck[]
): { status: 400; body: { error: string } } | undefined {
  const invalid = checks.find(
    ([param, isValid]) =>
      query.has(param) && (query.getAll(param).length > 1 || !isValid(query.get(param)!))
  );
  return invalid && { status: 400, body: { error: `Invalid value for ${invalid[0]}.` } };
}

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
/**
 * The API's `SUPERUSER_EMAIL` until an account is arranged with `superuser: true`, whose address then takes its place
 * (there's only ever one: arranging a second throws). `POST /user/email/confirm` keeps it from other accounts.
 */
export const MOCK_SUPERUSER_EMAIL = "admin@example.com";
const DEFAULT_QUOTA = 10 * 1024 * MB;
/**
 * The API's mail budget with `MAIL_DAILY_LIMIT` unset: warned at 80 %, sign-up codes stopped a fifth short and
 * password reset codes a tenth short. Every other mail (an e-mail change's code, the notices) goes up to the limit.
 */
const MAIL_DAILY_LIMIT = 250;
const MAIL_WARNING_AT = 200;
const MAIL_REGISTRATION_STOPS_AT = 200;
const MAIL_PASSWORD_RESET_STOPS_AT = 225;
/** The API sends nothing to these top-level domains (RFC 6761) and counts nothing for them, whatever the budget. */
const RESERVED_TLDS = ["test", "example", "invalid", "localhost"];
/** Which share of the day's mails a mail draws on (see `sendsMail`). */
type MailKind = "registration" | "passwordReset" | "account";
/** What mongoose's `ObjectId.isValid` accepts as a string: 24 hex characters. */
const OBJECT_ID = /^[0-9a-f]{24}$/i;

/** The API's answer to `POST /auth/password-reset`: its `passwordResetSent` (vb2007/vb2007.hu-api#232). */
export const PASSWORD_RESET_SENT =
  "If an account uses this address, a password reset code was sent to it in the last minute or just now: use the latest one.";

/** The API's `Responses.EmailCodes.mailFailed`: a code that couldn't be mailed. */
export const MAIL_FAILED_ERROR = "The e-mail couldn't be sent: please try again later.";

/** The code the mock "mails" after `POST /auth/register` (vb2007/vb2007.hu-api#28). */
export const REGISTRATION_CODE = "123456";

/** The API refuses these domains and their subdomains (vb2007/vb2007.hu-api#217). */
export const DISPOSABLE_DOMAINS = ["mailinator.com"];
/** Domains whose DNS takes no mail, which the API refuses too. */
export const UNDELIVERABLE_DOMAINS = ["no-mail.invalid"];

const normalizeEmail = (email: string) => email.trim().toLowerCase();
/**
 * Whether two usernames name the same account, whatever their case, like the API's collation. Pastes, short links and
 * uploads are kept by their owner's name here (the API keys them by id), so this is how they find their account.
 */
const sameUsername = (one: string, other: string) => one.toLowerCase() === other.toLowerCase();

/** The API's rate limiters in the order `DELETE /admin/rate-limits` names them, with what keys each. */
const RATE_LIMITERS = {
  loginPerIp: ["ip"],
  loginPerAccount: ["email", "ip"],
  loginPerEmail: ["email"],
  codeChecksPerIp: ["ip"],
  codeChecksPerEmail: ["email"],
  resetLinkChecksPerIp: ["ip"],
  mailSendsPerIp: ["ip"],
  usernameChecksPerIp: ["ip"],
  accountCodeChecksPerIp: ["ip"],
  accountCodeChecksPerAccount: ["email"],
  passwordChecksPerIp: ["ip"],
  passwordChecksPerAccount: ["email"],
  passwordResetCodeFailures: ["email"],
  emailChangeCodeFailures: ["email"],
  registrationCodeFailures: ["email"]
} as const;
export type MockRateLimiter = keyof typeof RATE_LIMITERS;
type RateLimitKey = { email?: string; ip?: string };
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

/** What the API asks of a required body field: a string, not an empty one. */
const isFilledString = (value: unknown): value is string => typeof value === "string" && !!value;

const USERNAME_COLLATOR = new Intl.Collator("en", { sensitivity: "accent" });

/**
 * The API's 400 for a username (its `usernameFormatError`, vb2007/vb2007.hu-api#319), if any. On
 * the trimmed name: over 16 UTF-16 units, then invisible, control or collation-ignored characters
 * and whitespace other than spaces (U+FE0E/U+FE0F pass after an emoji), then fewer than 2
 * characters other than combining marks.
 */
const usernameRefusal = (username: string): MockResponse | undefined => {
  const refuse = (error: string) => ({ status: 400, body: { error } });
  const name = username.trim();
  if (name.length > 16) {
    return refuse("The username's too long: it must be between 2 and 16 characters.");
  }
  const checked = name.replace(/(?<=\p{Emoji})[\ufe0e\ufe0f]/gu, "");
  if (
    /[^\S ]|[\p{C}\p{Default_Ignorable_Code_Point}\u2800]/u.test(checked) ||
    [...checked].some((character) => USERNAME_COLLATOR.compare(character, "") === 0)
  ) {
    return refuse(
      "The username has invalid characters: it can't contain invisible or control characters, or whitespace other than spaces."
    );
  }
  if ([...name.replace(/\p{M}/gu, "")].length < 2) {
    return refuse("The username's too short: it must be between 2 and 16 characters.");
  }
};

/** A mailed code, like the API's (vb2007/vb2007.hu-api#220): one a minute, 5 tries. */
type MockCode = { sentAt: number; expiresAt: number; attempts: number };
const CODE_TRIES = 5;
const CODE_COOLDOWN_MS = 60_000;
const MAIL_FAILED: MockResponse = { status: 503, body: { error: MAIL_FAILED_ERROR } };

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
    hasFile: filePart !== "",
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
  hasPassword: boolean;
  emailVerified: boolean;
  githubId?: string;
  githubLogin?: string;
}

export class MockApi {
  private user: MockUser | null = null;
  /** The one superuser address, like the API's `SUPERUSER_EMAIL`: `MOCK_SUPERUSER_EMAIL` until an account is arranged as the superuser. */
  private superuserEmail = MOCK_SUPERUSER_EMAIL;
  /** Whether a test arranged the superuser (`superuser: true`), which then can't move to another address. */
  private superuserArranged = false;
  /** The accounts `POST /auth/login` knows; logging in makes one of them `user` again. */
  private readonly accounts: MockUser[] = [
    {
      _id: MOCK_USER_ID,
      email: MOCK_EMAIL,
      username: "e2e",
      hasPassword: true,
      emailVerified: false
    }
  ];
  /** A new address waiting for `MOCK_EMAIL_CODE`. */
  private emailChange: (MockCode & { email: string }) | null = null;
  /** Seconds of cooldown the next `PATCH /user/email` finds left, whenever it arrives (see `hasPendingEmail`). */
  private emailCooldownOnSend: number | null = null;
  private shortCode = "e2e123";
  /** Short code -> link, oldest first, filled by shortening and by `hasShortLink`; `addedBy` is a username. */
  readonly shortLinks = new Map<string, { target: string; addedBy: string; addedOn: string }>();
  /** In-memory paste store, oldest first. */
  readonly pastes: MockPaste[] = [];
  private nextPasteId = 1;
  /** How many accounts `POST /auth/register/verify` created, for their ids. */
  private registeredCount = 0;
  /** In-memory upload store, oldest first. */
  readonly uploads: MockUpload[] = [];
  /** Upload id -> the username it belongs to. */
  private readonly uploadOwners = new Map<string, string>();
  private nextUploadId = 1;
  private quotaBytes = DEFAULT_QUOTA;
  /** Accounts the admin page lists, oldest first. */
  readonly users: MockListedUser[] = [];
  /** The upload usage `hasUser(..., { usedBytes, count })` arranged in place of the uploads an account owns. */
  private readonly arrangedUploadUsage = new WeakMap<
    MockListedUser,
    { usedBytes: number; count: number }
  >();
  /** The ids `POST /admin/users/:id/logout` was asked for. */
  readonly loggedOutUsers: string[] = [];
  /** Admin-listed account id -> the new address its e-mail change waits on (see `hasUser`). */
  private readonly userPendingEmails = new Map<string, string>();
  /** Sign-ups the admin's System page lists (see `hasPendingRegistration`). */
  readonly adminPendingRegistrations: { id: string; email: string; expiresAt: string }[] = [];
  /** Rate limiters counting for a key (see `countsRateLimit`). */
  private rateLimitCounts: (RateLimitKey & { name: MockRateLimiter })[] = [];
  /** What `PATCH /user/password` checks the current password against, and changes. */
  password = MOCK_PASSWORD;
  /** The only `__Host-VB-AUTH` value still accepted; each new session replaces it. */
  private session = "";
  private sessionCount = 0;
  /** Registrations waiting for their code, by address: only the code, like the API's (vb2007/vb2007.hu-api#295). */
  private readonly pendingRegistrations = new Map<string, MockCode>();
  /** Password reset codes waiting, by account address. */
  private readonly resetCodes = new Map<string, MockCode>();
  /** Addresses a password reset confirmed, verified at their next login; deleting the account drops its address. */
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
  /** Set by `locksLogins`: the `retryAfter` of the login's 429, and the address it's for, if one. */
  private loginLockout: { retryAfter: number | null; email?: string } | null = null;
  /** A `POST /auth/github/link` waiting for its trip to the mock's GitHub authorize page. */
  private githubLinkStarted = false;
  private githubUnconfigured = false;
  /** What the admin's view of a user's uploads waits for before it answers (see `holdsUserUploads`). */
  private userUploadsHold: Promise<void> | null = null;
  private userUploadsDown = false;
  /** Mails the API counted today, for `GET /admin/mail-budget` (see `sentMailToday`). */
  private mailSentToday = 0;
  private statsDown = false;
  /** The API host the app was built against, known once the app has called it. */
  apiOrigin = "";
  /** The code every password reset "mails"; the addresses asked for go to `passwordResets`, trimmed like the API reads them. */
  readonly passwordResetCode = "123456";
  readonly passwordResets: string[] = [];
  /** The reset links still live (see `mailsResetLink`): token -> the account's id and address. */
  private readonly resetLinks = new Map<string, { userId: string; email: string }>();
  private resetLinkCount = 0;
  /** The `email` values a password reset was asked for while `limitsMailSends()` refused it, as sent (the API's limit answers before it reads the body). */
  readonly limitedPasswordResets: string[] = [];
  readonly unhandled: string[] = [];

  loggedOut() {
    this.user = null;
  }

  /**
   * A login elsewhere, which the API's one session per account replaces this browser's with: the account stays
   * logged in, but the browser's `__Host-VB-AUTH` cookie no longer works.
   */
  replacesSession() {
    this.session = `e2e-session-${++this.sessionCount}`;
  }

  loggedInAs(
    email = "e2e@example.com",
    username = "e2e",
    { superuser = false, githubLinked = false, password = true, emailVerified = false } = {}
  ) {
    // Before anything changes, so a second superuser address leaves the arrangement as it was.
    if (superuser) this.arrangesSuperuser(normalizeEmail(email));
    this.user = {
      _id: MOCK_USER_ID,
      email: normalizeEmail(email),
      username,
      hasPassword: password,
      emailVerified
    };
    if (githubLinked) {
      this.user.githubId = "583231";
      this.user.githubLogin = "e2e-octocat";
    }
    this.knowsAccount(this.user);
  }

  /**
   * Lets `POST /auth/login` find `user`, replacing the account with the same id or address: the API stores one
   * account per id, so `loggedInAs` with another address moves `MOCK_EMAIL`'s account (the same `MOCK_USER_ID`) to it.
   */
  private knowsAccount(user: MockUser) {
    this.forgetsAccount(user);
    this.accounts.push(user);
  }

  /**
   * Makes `email` the superuser's address, like setting the API's `SUPERUSER_EMAIL`. There's only one, so a test that
   * arranges another address as the superuser too fails at once rather than quietly moving it.
   */
  private arrangesSuperuser(email: string) {
    if (this.superuserArranged && email !== this.superuserEmail) {
      throw new Error(
        `The superuser is already arranged as ${this.superuserEmail}: the API has one SUPERUSER_EMAIL, so ${email} can't be the superuser too.`
      );
    }
    this.superuserEmail = email;
    this.superuserArranged = true;
  }

  /** Takes the account with `user`'s id or address out of `accounts`. */
  private forgetsAccount(user: MockUser) {
    const same = (account: MockUser) =>
      account._id === user._id || normalizeEmail(account.email) === normalizeEmail(user.email);
    for (let index = this.accounts.length - 1; index >= 0; index--) {
      if (same(this.accounts[index])) this.accounts.splice(index, 1);
    }
  }

  /**
   * Adds an account to the admin list; `quotaBytes` makes it a custom quota, `suspendedAt` suspends
   * it, `githubLogin` links GitHub and `password: false` makes it a GitHub-only account;
   * `emailVerified` confirms its address and `pendingEmail` leaves a change waiting for its code.
   * Its address is `<username>@example.com`, normalized like the API's. Its upload usage (count and bytes used) is
   * the uploads it owns, or `usedBytes` and `count` in their place (e.g. for a list that shows many), which then stand
   * in for both together, the one left out as 0. The admin list and its page both answer it.
   * `superuser` makes its address the superuser's (see `isSuperuserEmail`), as the admin's own row, which the API
   * won't suspend or delete. A row at the logged-in account's address is that account, with its id, so logging it
   * out ends this session.
   */
  hasUser(
    username: string,
    {
      usedBytes,
      count,
      quotaBytes,
      suspendedAt = null,
      githubLogin,
      password = true,
      superuser = false,
      emailVerified = false,
      pendingEmail
    }: {
      usedBytes?: number;
      count?: number;
      quotaBytes?: number;
      suspendedAt?: string | null;
      githubLogin?: string;
      password?: boolean;
      superuser?: boolean;
      emailVerified?: boolean;
      pendingEmail?: string;
    } = {}
  ) {
    const email = normalizeEmail(`${username}@example.com`);
    if (superuser) this.arrangesSuperuser(email);
    // What the admin routes answer about the superuser and the uploads is derived (see `adminRow`).
    const user: MockListedUser = {
      id: this.user?.email === email ? this.user._id : `${this.users.length + 1}`.padStart(24, "b"),
      username,
      email,
      // Each account is a day newer than the last, so sorting by date is deterministic.
      createdAt: new Date(Date.UTC(2026, 0, 1 + this.users.length)).toISOString(),
      suspendedAt,
      uploads: {
        quotaBytes: quotaBytes ?? DEFAULT_QUOTA,
        hasCustomQuota: quotaBytes !== undefined
      }
    };
    this.users.push(user);
    if (usedBytes !== undefined || count !== undefined) {
      this.arrangedUploadUsage.set(user, { usedBytes: usedBytes ?? 0, count: count ?? 0 });
    }
    if (pendingEmail) this.userPendingEmails.set(user.id, pendingEmail);
    this.knowsListedAccount(user, { password, emailVerified, githubLogin });
    return user;
  }

  /**
   * Lets `POST /auth/login` find the `hasUser(...)` row `user`, as one account with one id and one name, whatever was
   * arranged first. The logged-in account stays as `loggedInAs` arranged it. A login already at the address takes the
   * row's id and name (e.g. `MOCK_EMAIL`'s, which then leaves `MOCK_USER_ID`), and how the row logs in where it was
   * arranged (no password, GitHub, a confirmed address); another login with the row's id goes. Whether it's the
   * superuser's comes from the address they share (see `isSuperuserEmail`).
   */
  private knowsListedAccount(
    user: MockListedUser,
    {
      password,
      emailVerified,
      githubLogin
    }: { password: boolean; emailVerified: boolean; githubLogin?: string }
  ) {
    const email = normalizeEmail(user.email);
    const atAddress = this.accounts.find((account) => normalizeEmail(account.email) === email);
    const withId = this.accounts.find((account) => account._id === user.id);
    if (this.user && (atAddress === this.user || withId === this.user)) return;
    for (let index = this.accounts.length - 1; index >= 0; index--) {
      const account = this.accounts[index];
      if (account._id === user.id && account !== atAddress) this.accounts.splice(index, 1);
    }
    if (atAddress) {
      // One account: what the row was arranged with is on the login too. Defaults leave what the login had.
      atAddress._id = user.id;
      atAddress.username = user.username;
      if (!password) atAddress.hasPassword = false;
      if (emailVerified) atAddress.emailVerified = true;
      if (githubLogin) Object.assign(atAddress, { githubId: `gh-${user.username}`, githubLogin });
    } else {
      this.accounts.push({
        _id: user.id,
        email: user.email,
        username: user.username,
        hasPassword: password,
        emailVerified,
        ...(githubLogin && { githubId: `gh-${user.username}`, githubLogin })
      });
    }
  }

  /** Lists a sign-up waiting for its code on the admin's System page; a negative time has expired. */
  hasPendingRegistration(email: string, { expiresInMinutes = 24 * 60 } = {}) {
    const registration = {
      id: `${this.adminPendingRegistrations.length + 1}`.padStart(24, "c"),
      email,
      expiresAt: new Date(this.now() + expiresInMinutes * 60_000).toISOString()
    };
    this.adminPendingRegistrations.push(registration);
    return registration;
  }

  /** A rate limiter counting for `email`, `ip` or both, as its key needs. */
  countsRateLimit(name: MockRateLimiter, { email, ip }: RateLimitKey) {
    this.rateLimitCounts.push({ name, email: email && normalizeEmail(email), ip });
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
    // Normalized, like the address `PATCH /user/email` stores.
    this.emailChange = {
      email: normalizeEmail(email),
      ...this.newCode(15, this.now() - sentSecondsAgo * 1000)
    };
    this.emailCooldownOnSend = cooldownLeftOnSend ?? null;
  }

  /**
   * "Mails" a reset link for the account `userId` at `email` and returns its token, which
   * `POST /auth/password-reset/confirm-link` takes once, like the API (vb2007/vb2007.hu-api#256).
   * Without `userId`, it's the id of the account at `email` (the logged-in one's by default), else `MOCK_USER_ID`: the
   * login's id first, which its session carries, then the admin list's.
   */
  mailsResetLink(userId?: string, email = this.user?.email ?? MOCK_EMAIL) {
    const atAddress = (account: { email: string }) =>
      normalizeEmail(account.email) === normalizeEmail(email);
    const id =
      userId ??
      [...(this.user ? [this.user] : []), ...this.accounts].find(atAddress)?._id ??
      this.storedAccounts().find(atAddress)?.id ??
      MOCK_USER_ID;
    const token = `${id}.${`${++this.resetLinkCount}`.padStart(43, "e2e_-")}`;
    this.resetLinks.set(token, { userId: id, email });
    return token;
  }

  /** Voids the reset code waiting for `email`, which the API unsets (`passwordReset`) wherever it voids the links. */
  private voidResetCode(email: string) {
    this.resetCodes.delete(normalizeEmail(email));
  }

  /** Voids the reset links of the accounts `matches` picks, as resetting or changing the password or address does. */
  private voidResetLinks(matches: (link: { userId: string; email: string }) => boolean) {
    for (const [token, link] of this.resetLinks) {
      if (matches(link)) this.resetLinks.delete(token);
    }
  }

  /**
   * Fails the next code mail that is actually sent (see the top of this file), like a mail server that's down. The API restores
   * what the code replaced, so the code or waiting change or registration from before still works.
   */
  failsNextMail() {
    this.mailFails = true;
  }

  /** Whether the code about to be mailed fails; uses `failsNextMail()` up. */
  private mailFailsNow() {
    const fails = this.mailFails;
    this.mailFails = false;
    return fails;
  }

  /** Whether the day's mails are used up for a mail of this kind (see `sentMailToday`): the API's `dailySendRefusal`. */
  private mailRefused(kind: MailKind) {
    const stopsAt = {
      registration: MAIL_REGISTRATION_STOPS_AT,
      passwordReset: MAIL_PASSWORD_RESET_STOPS_AT,
      account: MAIL_DAILY_LIMIT
    }[kind];
    return this.mailSentToday >= stopsAt;
  }

  /** Whether the API counts a mail to `address` against the day's budget: not for the reserved top-level domains. */
  private countsMail(address: string) {
    return !RESERVED_TLDS.includes(normalizeEmail(address).split("@").pop()!.split(".").pop()!);
  }

  /**
   * Mails `address` like the API's `sendMail`, and tells whether the mail went. It counts against the day's budget, and
   * a refusal by the budget sends nothing (so `failsNextMail()` is left for the next mail). `failsNextMail()` fails it
   * after counting, and the API releases the count again.
   */
  private sendsMail(kind: MailKind, address: string) {
    if (!this.countsMail(address)) return true;
    if (this.mailRefused(kind)) return false;
    this.mailSentToday++;
    if (!this.mailFailsNow()) return true;
    this.mailSentToday--;
    return false;
  }

  /** A notice (an e-mail changed, a password reset): it counts when the budget allows, and its failure is only logged. */
  private mailsNotice(address: string) {
    if (this.countsMail(address) && !this.mailRefused("account")) this.mailSentToday++;
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

  /**
   * Every account the mock holds, like the API's users: the logged-in one, those `POST /auth/login` knows
   * (whether or not anyone is logged in to them) and the admin list's.
   */
  private storedAccounts(): { id: string; email: string; username: string }[] {
    return [...(this.user ? [this.user] : []), ...this.users, ...this.accounts].map((account) => ({
      id: "id" in account ? account.id : account._id,
      email: account.email,
      username: account.username
    }));
  }

  /** Whether an account uses the (normalized) address, like the API's `getUserByEmail`. */
  private hasAccount(email: string) {
    return this.storedAccounts().some((account) => normalizeEmail(account.email) === email);
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

  /**
   * Answers logins with 429, like the API after too many failed attempts (vb2007/vb2007.hu-api#204):
   * every login, or only `email`'s.
   */
  locksLogins(retryAfter: number | null, email?: string) {
    this.loginLockout = { retryAfter, email: email && normalizeEmail(email) };
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

  /** Sets how many mails `GET /admin/mail-budget` says the API sent today. */
  sentMailToday(count: number) {
    this.mailSentToday = count;
  }

  /** Answers `GET /admin/stats` with a 502 and no `{ error }`, like a gateway, until called with `false`. */
  statsFail(down = true) {
    this.statsDown = down;
  }

  quotaIs(bytes: number) {
    this.quotaBytes = bytes;
  }

  shortenReturns(code: string) {
    this.shortCode = code;
  }

  hasShortLink(
    code: string,
    target: string,
    addedBy = "e2e",
    addedOn = "2026-10-10T12:00:00.000Z"
  ) {
    this.shortLinks.set(code, { target, addedBy, addedOn });
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
      // The API's access check answers 403, which the cdn's nginx (`cdn.conf`) turns into a 404.
      return opens
        ? route.fulfill({ status: 200, contentType: "image/png", body: PIXEL })
        : route.fulfill({ status: 404 });
    }

    if (this.userUploadsHold && /^\/admin\/users\/[^/]+\/uploads$/.test(url.pathname)) {
      await this.userUploadsHold;
    }

    // Suspending ends the account's session, like the API's: it answers as logged out from then on.
    if (this.user && this.isSuspended(this.user.email)) this.user = null;

    const cookie = (await request.headerValue("cookie")) ?? "";
    const sentSession = cookie.match(/(?:^|;\s*)__Host-VB-AUTH=([^;]+)/)?.[1];
    const staleSession = sentSession !== undefined && sentSession !== this.session;
    const endpoint = `${request.method()} ${url.pathname}`;
    const contentType = (await request.headerValue("content-type")) ?? "";
    // Only `isAuthenticated` refuses a session the API replaced; a public route answers it as a guest's.
    // An upload is guarded too, so it gets the same session checks before its body is read.
    const response: MockResponse | undefined =
      staleSession && !PUBLIC_ROUTES.some((route) => route.test(endpoint))
        ? NOT_LOGGED_IN
        : contentType.startsWith("multipart/form-data")
          ? this.receiveUpload(request.postDataBuffer(), contentType)
          : this.respond(
              endpoint,
              request.postDataJSON(),
              url.searchParams,
              staleSession ? null : this.user
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
      suspended?: unknown;
      ip?: unknown;
    } | null,
    query: URLSearchParams,
    /**
     * Whose session the request carries: `null` for a guest or a replaced session. Only the public routes that
     * read the session (`getSessionUser` in the API) need it: to the others, e.g. the username check or a
     * password reset, `this.user` is still the account itself.
     */
    sessionUser: MockUser | null
  ): MockResponse | undefined {
    const lookupRoute = endpoint.match(/^GET \/shortenUrl\/([^/]+)$/);
    if (lookupRoute) {
      const link = this.shortLinks.get(decodeURIComponent(lookupRoute[1]));
      // Shaped like the real API, which also populates the sharer's account, with its current name.
      return link
        ? {
            status: 200,
            body: {
              originalUrl: link.target,
              addedBy: {
                ...this.populatedOwner(link.addedBy),
                createdAt: "2026-07-31T17:16:07.516Z"
              },
              addedOn: link.addedOn
            }
          }
        : { status: 404, body: { error: "The shortened URL cannot be found." } };
    }
    const deleteShortLinkRoute = endpoint.match(/^DELETE \/shortenUrl\/([^/]+)$/);
    if (deleteShortLinkRoute) {
      return this.deleteShortLink(decodeURIComponent(deleteShortLinkRoute[1]));
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

    const uploadRoute = endpoint.match(/^(GET|PATCH|DELETE) \/upload\/([^/]+)$/);
    if (uploadRoute) {
      return this.editUpload(uploadRoute[1], decodeURIComponent(uploadRoute[2]), body);
    }

    const userUploadsRoute = endpoint.match(/^GET \/admin\/users\/([^/]+)\/uploads$/);
    if (userUploadsRoute) {
      return this.listUserUploads(decodeURIComponent(userUploadsRoute[1]), query);
    }
    const adminUserRoute = endpoint.match(/^(GET|PATCH|DELETE) \/admin\/users\/([^/]+)$/);
    if (adminUserRoute) {
      const id = decodeURIComponent(adminUserRoute[2]);
      if (adminUserRoute[1] === "PATCH") return this.renameUser(id, body?.username);
      if (adminUserRoute[1] === "DELETE") return this.deleteUser(id);
      return this.adminUser(id);
    }
    const logoutRoute = endpoint.match(/^POST \/admin\/users\/([^/]+)\/logout$/);
    if (logoutRoute) {
      return this.logoutUser(decodeURIComponent(logoutRoute[1]));
    }
    const pendingRoute = endpoint.match(/^DELETE \/admin\/pending-registrations\/([^/]+)$/);
    if (pendingRoute) {
      return this.removePendingRegistration(decodeURIComponent(pendingRoute[1]));
    }
    const quotaRoute = endpoint.match(/^PATCH \/admin\/users\/([^/]+)\/upload-quota$/);
    if (quotaRoute) {
      return this.setQuota(decodeURIComponent(quotaRoute[1]), body?.quotaBytes);
    }
    const suspensionRoute = endpoint.match(/^PATCH \/admin\/users\/([^/]+)\/suspension$/);
    if (suspensionRoute) {
      return this.setSuspension(decodeURIComponent(suspensionRoute[1]), body?.suspended);
    }

    switch (endpoint) {
      case "GET /admin/users":
        return this.listUsers(query);
      case "GET /admin/pastes":
        return this.listAdminPastes(query);
      case "GET /admin/short-urls":
        return this.listAdminShortLinks(query);
      case "GET /admin/pending-registrations":
        return this.listPendingRegistrations(query);
      case "DELETE /admin/rate-limits":
        return this.clearRateLimits(body);
      case "GET /admin/stats":
        return this.siteStats();
      case "GET /admin/mail-budget":
        return this.mailBudget();
      case "GET /uploads":
        return this.listUploads(query, this.user?.username);
      case "GET /admin/uploads":
        return this.listAllUploads(query);
      case "GET /uploads/usage":
        return this.usage();
      case "GET /user":
        return this.user
          ? {
              status: 200,
              body: {
                ...this.user,
                // Like the API's `getUser`, from the address.
                isSuperuser: this.isSuperuserEmail(this.user.email),
                pendingEmail: this.isEmailChangeLive() ? this.emailChange!.email : null
              }
            }
          : NOT_LOGGED_IN;
      case "POST /auth/login":
        return this.login(body?.email, body?.password);
      case "DELETE /user":
        return this.deleteAccount(body);
      case "POST /auth/logout":
        // A replaced session's logout only clears the browser's cookie: the session that replaced it lives on.
        if (sessionUser) this.user = null;
        return { status: 200 };
      case "GET /auth/github/link":
        if (!sessionUser) {
          return { status: 302, location: `${this.appOrigin}/account?oauthError=notLoggedIn` };
        }
        // Only an account without a password may link through a plain navigation (vb2007/vb2007.hu-api#243).
        if (sessionUser.hasPassword) {
          return {
            status: 302,
            location: `${this.appOrigin}/account?oauthError=passwordRequired`
          };
        }
        // Checked after the session and the password, like the API's `githubLink`.
        if (this.githubUnconfigured) {
          return { status: 302, location: `${this.appOrigin}/account?oauthError=notConfigured` };
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
        // Like the callback's link check, which needs the session that started the link.
        if (!sessionUser) {
          return { status: 302, location: `${this.appOrigin}/account?oauthError=notLoggedIn` };
        }
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
        const refused = usernameRefusal(query.get("username") ?? "");
        if (refused) return refused;
        const taken = this.isUsernameTaken(query.get("username") ?? "");
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
        // Like the API (vb2007/vb2007.hu-api#425), decided on the trimmed address: nothing, a non-string or only whitespace is a 400.
        const address = typeof body?.email === "string" ? body.email.trim() : "";
        if (!address) {
          return { status: 400, body: { error: "You must provide an E-mail address." } };
        }
        this.passwordResets.push(address);
        // Like the API, only an account's address gets a code, at most one a minute, and not a suspended account's.
        const email = normalizeEmail(address);
        if (
          this.hasAccount(email) &&
          !this.isSuspended(email) &&
          !this.resendTooSoon(this.resetCodes.get(email)?.sentAt)
        ) {
          // A code that couldn't be mailed, or that the day's budget refused, is not kept: the answer stays 200 and the code sent before still works.
          if (this.sendsMail("passwordReset", email)) this.resetCodes.set(email, this.newCode(30));
        }
        return {
          status: 200,
          body: { message: PASSWORD_RESET_SENT }
        };
      }
      case "POST /auth/password-reset/confirm":
        if (this.codeChecksCapped) return CODE_CHECKS_CAPPED;
        return this.confirmPasswordReset(body);
      case "POST /auth/password-reset/confirm-link":
        // The limit counts failed tries, like the password checks', and uses no link up.
        if (this.resetLinksLimited) return PASSWORD_CHECKS_LIMITED;
        return this.confirmPasswordResetLink(body);
      case "POST /shortenUrl":
        return this.shorten((body as { url?: unknown } | null)?.url);
      case "GET /shortenUrls":
        return this.listShortLinks(query);
      case "POST /paste":
        if (!this.user) return NOT_LOGGED_IN;
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
    const lockout = this.loginLockout;
    if (lockout && (!lockout.email || lockout.email === normalizeEmail(email ?? ""))) {
      const { retryAfter } = lockout;
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
    // Only after the right password, so a wrong one doesn't reveal the suspension.
    if (this.isSuspended(account.email)) {
      return {
        status: 403,
        body: {
          error:
            "This account is suspended: it can't log in until the superuser lifts the suspension."
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
      return NOT_LOGGED_IN;
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
    // Like the API, three non-empty strings first: JSON can send anything.
    const username = body?.username;
    if (
      !isFilledString(body?.email) ||
      !isFilledString(username) ||
      !isFilledString(body?.password)
    ) {
      return {
        status: 400,
        body: { error: "You must provide a username, E-mail address, and a password." }
      };
    }
    const refused = usernameRefusal(username);
    if (refused) return refused;
    if (this.isUsernameTaken(body?.username)) {
      return { status: 409, body: { error: "This username is already taken." } };
    }
    const email = normalizeEmail(body?.email ?? "");
    const refusal = domainError(email);
    if (refusal) return { status: 400, body: { error: refusal } };
    const tooSoon = this.resendTooSoon(this.pendingRegistrations.get(email)?.sentAt);
    if (tooSoon) return tooSoon;
    // A code that couldn't be mailed leaves the registration that waited before (if any) as it was.
    if (!this.sendsMail("registration", email)) return MAIL_FAILED;
    this.pendingRegistrations.set(email, this.newCode(15));
    return {
      status: 202,
      body: {
        message: `A confirmation code was sent to ${email}: send it to POST /auth/register/verify to finish registering.`
      }
    };
  }

  /**
   * Like the API (vb2007/vb2007.hu-api#425): no address, or one of only whitespace, is a 400. Otherwise the registration share of the day's mails is reserved before the
   * address is looked at, so any address gets the 503 once it's used up, and every resend counts one mail, whether one
   * is sent or not (no waiting registration, the cooldown, a mail that fails). The answer is the same 200 for every
   * address. Only a waiting registration whose minute is over gets a new code: inside the minute the API sends
   * nothing, answers 200 all the same, and the code from before stays.
   */
  private resendRegistrationCode(address?: unknown) {
    const email = typeof address === "string" ? normalizeEmail(address) : "";
    if (!email) {
      return { status: 400, body: { error: "You must provide an E-mail address." } };
    }
    if (this.mailRefused("registration")) return MAIL_FAILED;
    if (this.countsMail(email)) this.mailSentToday++;
    const pending = this.pendingRegistrations.get(email);
    // A code that couldn't be mailed is only logged: the answer stays 200, the code sent before still works, and the
    // reservation stays counted. A reserved domain's mail is only logged, before anything could fail it.
    if (
      pending &&
      !this.resendTooSoon(pending.sentAt) &&
      (!this.countsMail(email) || !this.mailFailsNow())
    ) {
      Object.assign(pending, this.newCode(15));
    }
    return {
      status: 200,
      body: {
        message:
          "If a registration is waiting for this address, a confirmation code was sent to it in the last minute or just now: use the latest one."
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
      return NOT_LOGGED_IN;
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
    if (this.isSuperuserEmail(this.user.email)) {
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
    if (!this.sendsMail("account", normalized)) {
      // Like the API, the change that waited before (if any) stays, so a new code may go at once.
      return MAIL_FAILED;
    }
    this.emailChange = { email: normalized, ...this.newCode(15) };
    return {
      status: 202,
      body: {
        message: `A confirmation code was sent to ${normalized}: send it to POST /user/email/confirm to switch to that address.`
      }
    };
  }

  /**
   * Whether an account has `username`, trimmed and whatever its case, like the API's `isUsernameTaken`
   * (its collation ignores case). The logged-in user's own name counts too.
   */
  private isUsernameTaken(username?: string) {
    const name = username?.trim().toLowerCase();
    return this.storedAccounts().some((account) => account.username.toLowerCase() === name);
  }

  /**
   * `POST /auth/register/verify`: the waiting registration only holds the address and code, so the
   * account gets the username and password sent here (vb2007/vb2007.hu-api#295).
   */
  private verifyRegistration(
    body: { email?: string; code?: string; username?: string; password?: string } | null
  ): MockResponse {
    const { code, username, password } = body ?? {};
    // Like the API, four non-empty strings: JSON can send anything.
    if (
      !isFilledString(body?.email) ||
      !isFilledString(code) ||
      !isFilledString(username) ||
      !isFilledString(password)
    ) {
      return {
        status: 400,
        body: {
          error:
            "You must provide an E-mail address, the confirmation code, a username and a password."
        }
      };
    }
    const refused = usernameRefusal(username);
    if (refused) return refused;
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
      // A new account gets a new id, so registering leaves `MOCK_EMAIL`'s account (`MOCK_USER_ID`) alone.
      _id: `${++this.registeredCount}`.padStart(24, "d"),
      email,
      username: username.trim(),
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
      return NOT_LOGGED_IN;
    }
    if (!code) return { status: 400, body: { error: "You must provide the confirmation code." } };
    if (!this.claims(this.emailChange) || normalizeCode(code) !== MOCK_EMAIL_CODE) {
      return invalidCode();
    }
    const { email } = this.emailChange;
    this.emailChange = null;
    if (this.isSuperuserEmail(email)) {
      return { status: 403, body: { error: "This e-mail address is reserved for the superuser." } };
    }
    if (this.hasAccount(email)) {
      return {
        status: 409,
        body: { error: "An account with this E-mail address already exists." }
      };
    }
    this.voidResetLinks(({ userId }) => userId === this.user!._id);
    this.voidResetCode(this.user.email);
    // The notice goes to the address the account had.
    this.mailsNotice(this.user.email);
    this.user.email = email;
    this.user.emailVerified = true;
    return { status: 200, body: { message: "E-mail address updated successfully." } };
  }

  private changePassword(currentPassword?: string, newPassword?: string) {
    if (!this.user) {
      return NOT_LOGGED_IN;
    }
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
    this.voidResetCode(this.user.email);
    return { status: 200, body: { message: "Password changed successfully." }, newSession: true };
  }

  private setPassword(password: string | undefined) {
    if (!this.user) {
      return NOT_LOGGED_IN;
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
    this.voidResetCode(this.user.email);
    return { status: 200, body: { message: "Password set successfully." }, newSession: true };
  }

  private deleteAccount(body: { password?: string; username?: string } | null) {
    if (!this.user) {
      return NOT_LOGGED_IN;
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
    // The API deletes the account by its id: neither the login nor the admin list knows it any more, and what it
    // owned goes too (`removeUserContent`), as does what waited on its document: the reset code and links, and the
    // e-mail change, which is the logged-in account's here.
    const deleted = this.user;
    this.forgetsAccount(deleted);
    this.removesContentOf(deleted.username);
    const rowIds: string[] = [];
    for (let index = this.users.length - 1; index >= 0; index--) {
      const row = this.users[index];
      if (row.id === deleted._id || normalizeEmail(row.email) === normalizeEmail(deleted.email)) {
        rowIds.push(row.id);
        this.users.splice(index, 1);
      }
    }
    this.voidsWaiting([deleted._id, ...rowIds], deleted.email);
    this.emailChange = null;
    this.verifiedAddresses.delete(normalizeEmail(deleted.email));
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
    this.mailsNotice(email);
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
    const { userId, email } = this.resetLinks.get(token)!;
    // Using one link voids the account's others and the code waiting for its address, like any new password.
    this.voidResetLinks((link) => link.userId === userId);
    this.voidResetCode(email);
    this.password = newPassword;
    if (this.user?._id === userId) {
      this.user = null;
    }
    this.mailsNotice(email);
    return {
      status: 200,
      body: { message: "Password reset successfully: log in with the new password." }
    };
  }

  /**
   * `GET /paste/:id` is public. `PATCH` and `DELETE` run the API's `isAuthenticated` first, so a guest
   * is logged out before the ID is checked, then `isPasteOwner`: the ID's format, the 404, the owner.
   */
  private respondPaste(method: string, id: string, language?: string) {
    if (method !== "GET" && !this.user) return NOT_LOGGED_IN;
    if (!OBJECT_ID.test(id)) return this.invalidId();
    const index = this.pastes.findIndex((paste) => paste._id === id);
    if (index === -1) {
      return { status: 404, body: { error: "There is no such paste with that ID." } };
    }
    const paste = this.pastes[index];
    if (method === "GET") {
      // Populated like the real API does since vb2007/vb2007.hu-api#124, with the owner's current name.
      return {
        status: 200,
        body: { paste: { ...paste, addedBy: this.populatedOwner(paste.addedBy) } }
      };
    }
    // The API's `isPasteOwner`: the owner, or the superuser for anyone's paste.
    if (
      !sameUsername(paste.addedBy, this.user!.username) &&
      !this.isSuperuserEmail(this.user!.email)
    ) {
      return { status: 403, body: { error: "You do not have permission to perform this action." } };
    }
    if (method === "PATCH") {
      if (!PASTE_LANGUAGE.test(language ?? "")) {
        return {
          status: 400,
          body: {
            error: `The language is invalid: it must be ${PASTE_LANGUAGE_MIN_LENGTH}-${PASTE_LANGUAGE_MAX_LENGTH} lowercase letters, digits or +#- characters.`
          }
        };
      }
      paste.language = language;
      return { status: 200, body: { message: "Paste updated successfully.", paste } };
    }
    this.pastes.splice(index, 1);
    // Like the API's `deletePaste`, which sends only the deleted paste's ID.
    return { status: 200, body: { message: "Paste deleted successfully.", paste: { id } } };
  }

  private usedBytes() {
    return this.uploads.reduce((sum, upload) => sum + upload.fileSize, 0);
  }

  private usage() {
    if (!this.user) return NOT_LOGGED_IN;
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

  /** `POST /upload`: `isAuthenticated` first, then multer's 400s to a body it can't read, as in the API's `handleUpload`. */
  private receiveUpload(body: Buffer | null, contentType: string): MockResponse {
    if (!this.user) return NOT_LOGGED_IN;
    if (!/boundary=.+$/.test(contentType)) {
      return { status: 400, body: { error: "Multipart: Boundary not found" } };
    }
    if (!body?.length) return { status: 400, body: { error: "Unexpected end of form" } };
    const part = parseMultipart(body, contentType);
    // `verifyUploadType` and `checkUploadQuota` pass a body without a file on to `uploadFile`, which refuses it.
    if (!part.hasFile) return { status: 400, body: { error: "No file was provided." } };
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
    if (!this.user) return NOT_LOGGED_IN;
    const index = this.uploads.findIndex((upload) => upload.id === id);
    if (index === -1) return { status: 404, body: { error: "There is no such upload." } };
    if (method === "GET") {
      return { status: 200, body: { upload: this.served(this.uploads[index]) } };
    }
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

  /** What the API's `isAuthenticated` and `isSuperuser` answer before any admin route runs: the latter by the session's address. */
  private refuseNonSuperuser(): MockResponse | undefined {
    if (!this.user) {
      return NOT_LOGGED_IN;
    }
    if (!this.isSuperuserEmail(this.user.email)) {
      return { status: 403, body: { error: "You do not have permission to perform this action." } };
    }
  }

  /** The API's `validateMongooseId` on `:id`: admin routes run it after the superuser check, paste routes after the session. */
  private invalidId(): MockResponse {
    return {
      status: 400,
      body: { error: "Invalid ID format: must be a 24 character HEX string." }
    };
  }

  /** One account for the admin: the list's fields, its logins and how much it owns. */
  private adminUser(id: string): MockResponse {
    const refusal = this.refuseNonSuperuser();
    if (refusal) return refusal;
    if (!OBJECT_ID.test(id)) return this.invalidId();
    const user = this.users.find((item) => item.id === id);
    if (!user) return { status: 404, body: { error: "There is no such user with that ID." } };
    const account = this.accounts.find(
      (item) => normalizeEmail(item.email) === normalizeEmail(user.email)
    );
    const owns = (addedBy: string) => sameUsername(addedBy, user.username);
    return {
      status: 200,
      body: {
        user: {
          ...this.adminRow(user),
          hasPassword: account?.hasPassword ?? true,
          emailVerified: account?.emailVerified ?? false,
          githubLogin: account?.githubLogin ?? null,
          pendingEmail: this.userPendingEmails.get(user.id) ?? null,
          counts: {
            pastes: this.pastes.filter((paste) => owns(paste.addedBy)).length,
            shortUrls: [...this.shortLinks.values()].filter((link) => owns(link.addedBy)).length,
            uploads: this.uploadUsage(user).count
          }
        }
      }
    };
  }

  /** The site's totals, counted from what the mock holds: the admin list's accounts, pastes, short links and uploads. */
  private siteStats(): MockResponse {
    const refusal = this.refuseNonSuperuser();
    if (refusal) return refusal;
    if (this.statsDown) return { status: 502 };
    const publicUploads = this.uploads.filter((upload) => upload.visibility === "public").length;
    return {
      status: 200,
      body: {
        users: this.users.length,
        pastes: this.pastes.length,
        shortUrls: this.shortLinks.size,
        uploads: {
          total: this.uploads.length,
          public: publicUploads,
          private: this.uploads.length - publicUploads,
          storedBytes: this.uploads.reduce((sum, upload) => sum + upload.fileSize, 0)
        },
        pendingRegistrations: this.pendingRegistrations.size,
        settings: { defaultUploadQuotaBytes: DEFAULT_QUOTA, maxFileSizeBytes: 100 * MB }
      }
    };
  }

  /** Today's mail, reset at the next UTC midnight like the API's in-memory count. */
  private mailBudget(): MockResponse {
    const refusal = this.refuseNonSuperuser();
    if (refusal) return refusal;
    const resetsAt = new Date(this.now());
    resetsAt.setUTCHours(24, 0, 0, 0);
    return {
      status: 200,
      body: {
        sentToday: this.mailSentToday,
        dailyLimit: MAIL_DAILY_LIMIT,
        warningAt: MAIL_WARNING_AT,
        registrationStopsAt: MAIL_REGISTRATION_STOPS_AT,
        passwordResetStopsAt: MAIL_PASSWORD_RESET_STOPS_AT,
        resetsAt: resetsAt.toISOString()
      }
    };
  }

  /** The admin's view of one user's uploads: the same listing, plus whose they are. */
  private listUserUploads(id: string, query: URLSearchParams) {
    const refusal = this.refuseNonSuperuser();
    if (refusal) return refusal;
    if (this.userUploadsDown) return { status: 502 };
    if (!OBJECT_ID.test(id)) return this.invalidId();
    // Like the API, the query is checked after the ID's format but before the user is looked up. `listUploads`
    // checks it again, which only its `/uploads` and `/admin/uploads` callers rely on.
    const invalid = refuseListQuery(query, UPLOAD_LIST_CHECKS);
    if (invalid) return invalid;
    const user = this.users.find((item) => item.id === id);
    if (!user) return { status: 404, body: { error: "There is no such user with that ID." } };
    const listing = this.listUploads(query, user.username);
    return {
      ...listing,
      body: { ...listing.body, user: { id: user.id, username: user.username } }
    };
  }

  /** The admin's view of every upload, each with its owner (vb2007/vb2007.hu-api#280). */
  private listAllUploads(query: URLSearchParams) {
    return this.refuseNonSuperuser() ?? this.listUploads(query, null);
  }

  /**
   * Whose a paste, short link or upload filed under `name` is, as the admin's lists name them: the account with the
   * name, whatever its case, like the API's lookup of the owner's id (it's kept by name here). The admin list's row
   * comes first, as `/admin/users/:id` finds it, then a login's; `null` once no account has it.
   */
  private ownerNamed(name: string) {
    const listed = this.users.find((user) => sameUsername(user.username, name));
    if (listed) return { id: listed.id, username: listed.username };
    const account = [...(this.user ? [this.user] : []), ...this.accounts].find((item) =>
      sameUsername(item.username, name)
    );
    return account ? { id: account._id, username: account.username } : null;
  }

  /**
   * The owner of content filed under `name` as the API populates it (`populate("addedBy", "username")`): the
   * account's current name (see `ownerNamed`), or the name it was filed under when no account has it.
   */
  private populatedOwner(name: string) {
    const owner = this.ownerNamed(name);
    return { _id: owner?.id ?? "u1", username: owner?.username ?? name };
  }

  /** Whose an upload is (see `ownerNamed`). */
  private ownerOf(uploadId: string) {
    return this.ownerNamed(this.uploadOwners.get(uploadId)!);
  }

  /** `owner`'s uploads, or everyone's with `null`, each then saying whose it is. A bad query answers 400 like the API's. */
  private listUploads(query: URLSearchParams, owner: string | undefined | null) {
    if (!this.user) return NOT_LOGGED_IN;
    const invalid = refuseListQuery(query, UPLOAD_LIST_CHECKS);
    if (invalid) return invalid;
    const everyone = owner === null;
    const limit = Number(query.get("limit") ?? 20);
    const page = Number(query.get("page") ?? 1);
    const sortBy = (query.get("sortBy") ?? "uploadedOn") as keyof MockUpload;
    const sortOrder = query.get("sortOrder") ?? "desc";
    const visibility = query.get("visibility");
    const q = query.get("q")?.toLowerCase();
    const matching = this.uploads
      .filter((upload) => everyone || sameUsername(this.uploadOwners.get(upload.id)!, owner!))
      .filter((upload) => !visibility || upload.visibility === visibility)
      .filter(
        (upload) =>
          !q ||
          upload.originalFileName.toLowerCase().includes(q) ||
          // Site-wide, the owner's name matches too, while their account exists.
          (everyone && this.ownerOf(upload.id)?.username.toLowerCase().includes(q))
      )
      .sort((a, b) => {
        const order = String(a[sortBy]).localeCompare(String(b[sortBy]), "en", { numeric: true });
        return sortOrder === "asc" ? order : -order;
      });
    return {
      status: 200,
      body: {
        uploads: matching
          .slice((page - 1) * limit, page * limit)
          .map((upload) =>
            everyone
              ? { ...this.served(upload), owner: this.ownerOf(upload.id) }
              : this.served(upload)
          ),
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

  /** Checks the query after the superuser, like the API, whose bad query answers 400. */
  private listUsers(query: URLSearchParams) {
    const refusal = this.refuseNonSuperuser();
    if (refusal) return refusal;
    const invalid = refuseListQuery(query, USER_LIST_CHECKS);
    if (invalid) return invalid;
    const limit = Number(query.get("limit") ?? 20);
    const page = Number(query.get("page") ?? 1);
    const sortBy = query.get("sortBy") ?? "usedBytes";
    const sortOrder = query.get("sortOrder") ?? "desc";
    const q = query.get("q")?.toLowerCase();
    const value = (user: MockListedUser) =>
      sortBy === "usedBytes"
        ? String(this.uploadUsage(user).usedBytes)
        : String(user[sortBy as "username"]);
    const matching = this.users
      // Part of the username or the e-mail address, like the API (vb2007/vb2007.hu-api#272).
      .filter(
        (user) =>
          !q || user.username.toLowerCase().includes(q) || user.email.toLowerCase().includes(q)
      )
      .sort((a, b) => {
        const order = value(a).localeCompare(value(b), "en", { numeric: true });
        return sortOrder === "asc" ? order : -order;
      });
    return {
      status: 200,
      body: {
        users: matching.slice((page - 1) * limit, page * limit).map((user) => this.adminRow(user)),
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

  /** The admin list's account `id`, or what the API answers before it gets there. */
  private adminTarget(id: string): MockListedUser | MockResponse {
    const refusal = this.refuseNonSuperuser();
    if (refusal) return refusal;
    if (!OBJECT_ID.test(id)) return this.invalidId();
    return (
      this.users.find((item) => item.id === id) ?? {
        status: 404,
        body: { error: "There is no such user with that ID." }
      }
    );
  }

  /** The login of an account on the admin list, found by its address like `adminUser`. */
  private accountOf(user: MockListedUser) {
    return this.accounts.find((item) => normalizeEmail(item.email) === normalizeEmail(user.email));
  }

  /**
   * `PATCH /admin/users/:id` (vb2007/vb2007.hu-api#274): the name is kept trimmed, and another
   * account's, in any case, is taken. What they own goes along, as it's kept by name here.
   */
  private renameUser(id: string, username: unknown): MockResponse {
    const target = this.adminTarget(id);
    if ("status" in target) return target;
    if (typeof username !== "string" || !username) {
      return { status: 400, body: { error: "You must provide a username." } };
    }
    const refused = usernameRefusal(username);
    if (refused) return refused;
    const name = username.trim();
    const account = this.accountOf(target);
    const taken = [...this.users, ...this.accounts].some(
      (other) =>
        other !== target && other !== account && other.username.toLowerCase() === name.toLowerCase()
    );
    if (taken) return { status: 409, body: { error: "This username is already taken." } };

    const previous = target.username;
    for (const paste of this.pastes) {
      if (sameUsername(paste.addedBy, previous)) paste.addedBy = name;
    }
    for (const link of this.shortLinks.values()) {
      if (sameUsername(link.addedBy, previous)) link.addedBy = name;
    }
    for (const [upload, owner] of this.uploadOwners) {
      if (sameUsername(owner, previous)) this.uploadOwners.set(upload, name);
    }
    target.username = name;
    if (account) account.username = name;
    return {
      status: 200,
      body: { message: "Username updated successfully.", user: this.adminRow(target) }
    };
  }

  /**
   * `POST /admin/users/:id/logout` (vb2007/vb2007.hu-api#275): a 200 whether they were logged in
   * or not. On the superuser's own account it ends this session too.
   */
  private logoutUser(id: string): MockResponse {
    const target = this.adminTarget(id);
    if ("status" in target) return target;
    this.loggedOutUsers.push(id);
    if (this.user && this.accountOf(target) === this.user) {
      this.user = null;
      this.session = "";
    }
    return {
      status: 200,
      body: {
        message: "User logged out successfully.",
        user: { id: target.id, username: target.username }
      }
    };
  }

  /**
   * Every paste for the admin, from the same store (vb2007/vb2007.hu-api#277): the owner is `null`
   * when no account has the paste's username, and `q` matches part of the owner's name or of the
   * language. Like the API, it checks the query in the docs' order before anything else.
   */
  private listAdminPastes(query: URLSearchParams): MockResponse {
    const refusal = this.refuseNonSuperuser();
    if (refusal) return refusal;
    const invalid = refuseListQuery(query, ADMIN_PASTE_LIST_CHECKS);
    if (invalid) return invalid;

    const limit = Number(query.get("limit") ?? 20);
    const page = Number(query.get("page") ?? 1);
    const sortOrder = query.get("sortOrder") ?? "desc";
    const q = query.get("q")?.toLowerCase();
    const rows = this.pastes.map((paste) => ({
      id: paste._id,
      language: paste.language ?? null,
      // The first 100 code points.
      preview: [...paste.content].slice(0, 100).join(""),
      addedOn: paste.addedOn,
      owner: this.ownerNamed(paste.addedBy)
    }));
    const matching = rows.filter(
      (row) =>
        !q ||
        row.owner?.username.toLowerCase().includes(q) ||
        row.language?.toLowerCase().includes(q)
    );
    // The store is oldest first.
    const sorted = sortOrder === "asc" ? matching : [...matching].reverse();
    return {
      status: 200,
      body: {
        pastes: sorted.slice((page - 1) * limit, page * limit),
        pagination: {
          limit,
          page,
          total: matching.length,
          pages: Math.ceil(matching.length / limit),
          sortBy: "addedOn",
          sortOrder
        }
      }
    };
  }

  /**
   * `DELETE /admin/users/:id` (vb2007/vb2007.hu-api#276): the account leaves the list and the
   * logins, with its pastes, short links and uploads, and what waited on it. Never the superuser's own, by its address.
   */
  private deleteUser(id: string): MockResponse {
    const target = this.adminTarget(id);
    if ("status" in target) return target;
    if (this.isSuperuserEmail(target.email)) {
      return { status: 409, body: { error: "The superuser's own account can't be deleted." } };
    }
    this.voidsWaitingFor(target);
    this.verifiedAddresses.delete(normalizeEmail(target.email));
    this.users.splice(this.users.indexOf(target), 1);
    const account = this.accountOf(target);
    if (account) this.accounts.splice(this.accounts.indexOf(account), 1);
    this.removesContentOf(target.username);
    return { status: 200, body: { message: "User deleted successfully." } };
  }

  /** Takes away what the account `name` owns, whatever the name's case, like the API's `removeUserContent`. */
  private removesContentOf(name: string) {
    const kept = this.pastes.filter((paste) => !sameUsername(paste.addedBy, name));
    this.pastes.splice(0, this.pastes.length, ...kept);
    for (const [code, link] of this.shortLinks) {
      if (sameUsername(link.addedBy, name)) this.shortLinks.delete(code);
    }
    const keptUploads = this.uploads.filter(
      (upload) => !sameUsername(this.uploadOwners.get(upload.id)!, name)
    );
    this.uploads.splice(0, this.uploads.length, ...keptUploads);
  }

  /** Checks the query after the superuser, like the API, whose bad query answers 400. */
  private listPendingRegistrations(query: URLSearchParams) {
    const refusal = this.refuseNonSuperuser();
    if (refusal) return refusal;
    const invalid = refuseListQuery(query, PENDING_REGISTRATION_LIST_CHECKS);
    if (invalid) return invalid;
    const limit = Number(query.get("limit") ?? 20);
    const page = Number(query.get("page") ?? 1);
    const q = query.get("q")?.toLowerCase();
    const matching = this.adminPendingRegistrations
      .filter((registration) => !q || registration.email.toLowerCase().includes(q))
      .sort((a, b) => b.expiresAt.localeCompare(a.expiresAt));
    return {
      status: 200,
      body: {
        pendingRegistrations: matching.slice((page - 1) * limit, page * limit),
        pagination: {
          limit,
          page,
          total: matching.length,
          pages: Math.ceil(matching.length / limit)
        }
      }
    };
  }

  private removePendingRegistration(id: string) {
    const refusal = this.refuseNonSuperuser();
    if (refusal) return refusal;
    if (!OBJECT_ID.test(id)) return this.invalidId();
    const index = this.adminPendingRegistrations.findIndex((item) => item.id === id);
    if (index === -1) {
      return {
        status: 404,
        body: { error: "There is no such pending registration with that ID." }
      };
    }
    this.adminPendingRegistrations.splice(index, 1);
    return { status: 200, body: { message: "Pending registration removed successfully." } };
  }

  /** The API's `clearRateLimitLockouts`: each limiter whose whole key is given, in its order. */
  private clearRateLimits(body: { email?: unknown; ip?: unknown } | null) {
    const refusal = this.refuseNonSuperuser();
    if (refusal) return refusal;
    const { email, ip } = body ?? {};
    if (email === undefined && ip === undefined) {
      return {
        status: 400,
        body: { error: "Send an email, an ip or both to clear their rate limits." }
      };
    }
    if (email !== undefined && (typeof email !== "string" || !email.trim())) {
      return { status: 400, body: { error: "email must be a non-empty string." } };
    }
    if (ip !== undefined && (typeof ip !== "string" || !isIP(ip))) {
      return { status: 400, body: { error: "ip must be a valid IPv4 or IPv6 address." } };
    }
    const key: RateLimitKey = {
      email: email === undefined ? undefined : normalizeEmail(email),
      ip
    };
    // `loginPerAccount` is found by the e-mail alone (from every IP, vb2007/vb2007.hu-api#365); an IP only narrows it.
    const matches = (count: RateLimitKey & { name: MockRateLimiter }) =>
      RATE_LIMITERS[count.name].every((part) =>
        count.name === "loginPerAccount" && part === "ip"
          ? key.ip === undefined || key.ip === count.ip
          : key[part] !== undefined && key[part] === count[part]
      );
    const cleared = new Set(this.rateLimitCounts.filter(matches).map((count) => count.name));
    this.rateLimitCounts = this.rateLimitCounts.filter((count) => !matches(count));
    return {
      status: 200,
      body: {
        message: "Rate limits cleared.",
        cleared: (Object.keys(RATE_LIMITERS) as MockRateLimiter[]).filter((name) =>
          cleared.has(name)
        )
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
    return {
      status: 200,
      body: { message: "Upload quota updated successfully.", user: this.adminRow(user) }
    };
  }

  /** Whether the `hasUser(...)` account at `email` is suspended. */
  private isSuspended(email: string) {
    return this.users.some(
      (user) => user.suspendedAt && normalizeEmail(user.email) === normalizeEmail(email)
    );
  }

  /**
   * Voids the reset code, reset links and e-mail change waiting for the account with one of `ids` at `email`, which
   * the API keeps on the account's document: `setUserSuspension` unsets them, and deleting the document takes them along.
   */
  private voidsWaiting(ids: (string | undefined)[], email: string) {
    const address = normalizeEmail(email);
    this.voidResetCode(address);
    this.voidResetLinks(
      (link) => ids.includes(link.userId) || normalizeEmail(link.email) === address
    );
    for (const id of ids) if (id) this.userPendingEmails.delete(id);
  }

  /**
   * `voidsWaiting` for the admin list's account `user`, whose login may carry another id than the row (see
   * `knowsListedAccount`). The API's suspension also ends the session and unsets `githubLink`, but here those are only
   * this browser's, whose superuser the API never suspends.
   */
  private voidsWaitingFor(user: MockListedUser) {
    this.voidsWaiting([user.id, this.accountOf(user)?._id], user.email);
  }

  /**
   * Whether `email` is the superuser's, like the API's `isSuperuserEmail`: the one superuser address, `MOCK_SUPERUSER_EMAIL`
   * or the address of the account last arranged as the superuser, whatever its case. Every check of the superuser
   * (the session's, the admin routes', the owner checks') and every row at that address goes by it, whatever a flag says.
   */
  private isSuperuserEmail(email: string) {
    return normalizeEmail(email) === this.superuserEmail;
  }

  /**
   * The upload usage of the admin list's account `user`, like the API's `calculateUploadUsage`: the count and bytes of
   * the uploads it owns, whatever the case of the name they're filed under, from the same uploads. A usage
   * `hasUser(..., { usedBytes, count })` arranged stands in for both.
   */
  private uploadUsage(user: MockListedUser) {
    const arranged = this.arrangedUploadUsage.get(user);
    if (arranged) return arranged;
    const owned = this.uploads.filter((upload) =>
      sameUsername(this.uploadOwners.get(upload.id)!, user.username)
    );
    return {
      usedBytes: owned.reduce((sum, upload) => sum + upload.fileSize, 0),
      count: owned.length
    };
  }

  /**
   * The admin list's account `user` as the admin routes answer it, like the API's `toAdminUser`: `isSuperuser` comes
   * from the address (`isSuperuserEmail`), and the upload usage from `uploadUsage`, on every answer.
   */
  private adminRow(user: MockListedUser): MockAdminUser {
    return {
      ...user,
      isSuperuser: this.isSuperuserEmail(user.email),
      uploads: { ...this.uploadUsage(user), ...user.uploads }
    };
  }

  /**
   * Suspends an account or lifts it, like the API (vb2007/vb2007.hu-api#273): suspending again keeps
   * the first `suspendedAt`, and the superuser's address answers 409. Suspending, or lifting a
   * suspension that's there, voids what's waiting (`voidsWaitingFor`).
   */
  private setSuspension(id: string, suspended: unknown): MockResponse {
    const refusal = this.refuseNonSuperuser();
    if (refusal) return refusal;
    if (!OBJECT_ID.test(id)) return this.invalidId();
    const user = this.users.find((item) => item.id === id);
    if (!user) return { status: 404, body: { error: "There is no such user with that ID." } };
    if (typeof suspended !== "boolean") {
      return { status: 400, body: { error: "suspended must be true or false." } };
    }
    if (this.isSuperuserEmail(user.email)) {
      return { status: 409, body: { error: "The superuser's account can't be suspended." } };
    }
    // The API's `setUserSuspension` unsets what's waiting on suspending, and on lifting a suspension that was there.
    if (suspended || user.suspendedAt) this.voidsWaitingFor(user);
    user.suspendedAt = suspended ? (user.suspendedAt ?? new Date(this.now()).toISOString()) : null;
    return {
      status: 200,
      body: {
        message: suspended
          ? "User suspended successfully: their session was ended."
          : "User unsuspended successfully.",
        user: this.adminRow(user)
      }
    };
  }

  /**
   * `POST /shortenUrl`, per user like the API (vb2007/vb2007.hu-api#247): the same user's URL again gets
   * their link back with a 200, anyone else's link to it doesn't count. A new link takes `shortenReturns`' code,
   * or that code numbered when it's taken.
   */
  private shorten(url: unknown): MockResponse {
    if (!this.user) {
      return NOT_LOGGED_IN;
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
      ([, link]) => link.target === url && sameUsername(link.addedBy, username)
    );
    if (existing) return answer(200, "You've already shortened this URL.", existing[0]);

    let code = this.shortCode;
    for (let n = 2; this.shortLinks.has(code); n++) code = `${this.shortCode}${n}`;
    this.hasShortLink(code, url, username, new Date(this.now()).toISOString());
    return answer(201, "URL shortened successfully", code);
  }

  /**
   * `GET /shortenUrls` (vb2007/vb2007.hu-api#285): the logged-in user's links, newest first by default; `q` matches
   * part of the code or the target, whatever its case. A bad parameter answers 400 like the API's.
   */
  private listShortLinks(query: URLSearchParams): MockResponse {
    if (!this.user) {
      return NOT_LOGGED_IN;
    }
    const invalid = refuseListQuery(query, SHORT_URL_LIST_CHECKS);
    if (invalid) return invalid;

    const limit = Number(query.get("limit") ?? 10);
    const page = Number(query.get("page") ?? 1);
    const sortOrder = query.get("sortOrder") ?? "desc";
    const q = query.get("q")?.toLowerCase() ?? "";
    const username = this.user.username;
    const owned = [...this.shortLinks]
      .filter(([, link]) => sameUsername(link.addedBy, username))
      .filter(
        ([code, link]) => code.toLowerCase().includes(q) || link.target.toLowerCase().includes(q)
      )
      .map(([code, link]) => ({
        shortenedUrl: code,
        originalUrl: link.target,
        addedOn: link.addedOn
      }));
    const sorted = this.sortShortLinks(owned, sortOrder);
    return {
      status: 200,
      body: {
        shortUrls: sorted.slice((page - 1) * limit, page * limit),
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

  /**
   * `GET /admin/short-urls` (vb2007/vb2007.hu-api#279): every link, newest first by default, from the same store. The owner
   * is `null` when no account has the link's username, and `q` matches part of the code, the target or the owner's
   * username, whatever its case. Like the API, it checks the query before anything else.
   */
  private listAdminShortLinks(query: URLSearchParams): MockResponse {
    const refusal = this.refuseNonSuperuser();
    if (refusal) return refusal;
    const invalid = refuseListQuery(query, SHORT_URL_LIST_CHECKS);
    if (invalid) return invalid;

    const limit = Number(query.get("limit") ?? 20);
    const page = Number(query.get("page") ?? 1);
    const sortOrder = query.get("sortOrder") ?? "desc";
    const q = query.get("q")?.toLowerCase() ?? "";
    const rows = [...this.shortLinks].map(([code, link]) => ({
      shortenedUrl: code,
      originalUrl: link.target,
      addedOn: link.addedOn,
      owner: this.ownerNamed(link.addedBy)
    }));
    const matching = rows.filter(
      (row) =>
        row.shortenedUrl.toLowerCase().includes(q) ||
        row.originalUrl.toLowerCase().includes(q) ||
        row.owner?.username.toLowerCase().includes(q)
    );
    const sorted = this.sortShortLinks(matching, sortOrder);
    return {
      status: 200,
      body: {
        shortUrls: sorted.slice((page - 1) * limit, page * limit),
        pagination: {
          limit,
          page,
          total: matching.length,
          pages: Math.ceil(matching.length / limit),
          sortBy: "addedOn",
          sortOrder
        }
      }
    };
  }

  /**
   * Short links by date, like the API's `addedOn` sort; links added at the same moment (`hasShortLink`'s default date)
   * keep the order they were added in.
   */
  private sortShortLinks<Row extends { addedOn: string }>(rows: Row[], sortOrder: string) {
    const oldestFirst = [...rows].sort((a, b) => a.addedOn.localeCompare(b.addedOn));
    return sortOrder === "asc" ? oldestFirst : oldestFirst.reverse();
  }

  /** `DELETE /shortenUrl/:shortenedUrl` (vb2007/vb2007.hu-api#278): the owner's own link, or any for the superuser. */
  private deleteShortLink(code: string): MockResponse {
    if (!this.user) {
      return NOT_LOGGED_IN;
    }
    const link = this.shortLinks.get(code);
    if (!link) return { status: 404, body: { error: "The shortened URL cannot be found." } };
    if (
      !sameUsername(link.addedBy, this.user.username) &&
      !this.isSuperuserEmail(this.user.email)
    ) {
      return {
        status: 403,
        body: { error: "You can only delete URLs created with your account." }
      };
    }
    this.shortLinks.delete(code);
    return { status: 200, body: { message: "Shortened URL deleted successfully." } };
  }

  /** Validates the query before it looks the user up, like the API (vb2007/vb2007.hu-api#241). */
  private listPastes(username: string, query: URLSearchParams) {
    if (!this.user) {
      return NOT_LOGGED_IN;
    }
    const invalid = refuseListQuery(query, PASTE_LIST_CHECKS);
    if (invalid) return invalid;

    const known = [
      this.user.username,
      ...this.accounts.map((account) => account.username),
      ...this.users.map((user) => user.username),
      ...this.pastes.map((paste) => paste.addedBy)
    ];
    if (!known.some((name) => sameUsername(name, username))) {
      return { status: 404, body: { error: "There is no such user with that username." } };
    }

    const limit = Number(query.get("limit") ?? 10);
    const page = Number(query.get("page") ?? 1);
    const sortOrder = query.get("sortOrder") ?? "desc";
    const owned = this.pastes.filter((paste) => sameUsername(paste.addedBy, username));
    const sorted = sortOrder === "asc" ? owned : [...owned].reverse();
    return {
      status: 200,
      body: {
        pastes: sorted
          .slice((page - 1) * limit, page * limit)
          .map((paste) => ({ ...paste, addedBy: this.populatedOwner(paste.addedBy) })),
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

/**
 * A `GET` of an API `path` sent from the page itself, so it goes through the double like the site's own calls do:
 * for queries the site never sends. `api.apiOrigin` is only known once the page has made a request.
 */
export async function getFromApi(page: Page, api: MockApi, path: string) {
  expect(api.apiOrigin, "the API's origin, known once the page has called it").not.toBe("");
  return page.evaluate(async (url) => {
    const response = await fetch(url, { credentials: "include" });
    return { status: response.status, body: (await response.json()) as unknown };
  }, `${api.apiOrigin}${path}`);
}

/**
 * A request of any method sent from the page itself (see `getFromApi`), for calls the site's own forms can't make, such as a
 * code confirmed after the account changed under it. Answers the status and the JSON body.
 */
export async function callApi(
  page: Page,
  api: MockApi,
  method: "POST" | "PATCH" | "DELETE",
  path: string,
  body: unknown
) {
  expect(api.apiOrigin, "the API's origin, known once the page has called it").not.toBe("");
  return page.evaluate(
    async ([url, verb, json]) => {
      const response = await fetch(url, {
        method: verb,
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(json)
      });
      return { status: response.status, body: (await response.json()) as unknown };
    },
    [`${api.apiOrigin}${path}`, method, body] as const
  );
}

export { expect };
