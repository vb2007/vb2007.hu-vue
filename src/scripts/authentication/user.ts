import { LoginStatus } from "@/constants/auth";
import { Endpoints } from "@/constants/endpoints";
import { HttpStatus } from "@/constants/http";
import { Messages } from "@/constants/messages";
import { retryAfterFrom } from "@/composables/useCountdown";
import { apiErrorOf, apiRequest, onSessionRefused } from "@/scripts/api/client";
import {
  emailVerified,
  githubLinked,
  githubLogin,
  hasPassword,
  isLoggedIn,
  isSessionChecked,
  isSuperuser,
  mfa,
  NO_MFA,
  pendingEmail,
  sessionEnded,
  userEmail,
  userId,
  username
} from "@/scripts/authentication/authState";
import { ref } from "vue";
import type { MfaMethod } from "@/types/api/mfa";

/**
 * `GET /user` lookups can answer out of order (e.g. the page load's after a login's), so each is
 * numbered as it's sent. `appliedLookup` is the newest one the state stands on: an answer from an
 * older lookup is ignored, and so is one sent before the page forgot the user (`clearSession`).
 */
let sentLookups = 0;
let appliedLookup = 0;

/** A `LoginStatus`, or the API's message when logging in failed. */
export const loginStatus = ref("");

/**
 * Logins are numbered as they're sent: only the newest one reports, and none sent before
 * `forgetLogin`, e.g. one still on its way when the form was left.
 */
let sentLogins = 0;

/**
 * The methods of the second step the newest login waits for (vb2007/vb2007.hu-api#448), in the
 * API's order; empty without one.
 */
export const mfaMethods = ref<MfaMethod[]>([]);

/** Forgets the last login's outcome, its second step, and the one of any login still on its way. */
export const forgetLogin = () => {
  sentLogins++;
  loginStatus.value = "";
  mfaMethods.value = [];
};

/**
 * The newest login's number: a later step of it (the second step, its mailed link) passes it to
 * `isCurrentLogin` and `finishLogin`, so a step left meanwhile reports nothing.
 */
export const currentLogin = () => sentLogins;
export const isCurrentLogin = (attempt: number) => attempt === sentLogins;

/** The second step waits: the login form gives way to it. */
export const startMfa = (methods: MfaMethod[]) => {
  mfaMethods.value = methods;
  loginStatus.value = LoginStatus.MfaRequired;
};

/** The second step ended without a session (it expired, or used up its tries): back to the password. */
export const endMfa = (message: string) => {
  mfaMethods.value = [];
  loginStatus.value = message;
};

/**
 * Whether the login finished elsewhere while its second step waited, e.g. with the mailed link
 * opened in another tab: the session is this browser's too, so the page takes it on, and the step
 * goes for good (a later logout brings back the password form, not a dead step).
 */
export const finishedElsewhere = async (attempt: number) => {
  const loggedIn = await fetchUserDetails();
  if (loggedIn && isCurrentLogin(attempt)) {
    mfaMethods.value = [];
    loginStatus.value = LoginStatus.Success;
  }
  return loggedIn;
};

/**
 * Takes on the session the API started, from a password or a second step: only a working cookie
 * makes the login real. A login that's no longer the newest still logs the page in, but reports
 * nothing.
 */
export const finishLogin = async (attempt: number) => {
  const kept = await fetchUserDetails();
  if (!isCurrentLogin(attempt)) return;
  mfaMethods.value = [];
  loginStatus.value = kept ? LoginStatus.Success : Messages.Auth.sessionNotKept;
};

/**
 * The session lives in an HttpOnly cookie set by the API, so the page can't read it.
 * Whether the user is logged in is only known by asking the API (with credentials).
 */
export const fetchUserDetails = async () => {
  const lookup = ++sentLookups;
  const result = await apiRequest(Endpoints.User.get, {
    failure: Messages.Auth.userFailed,
    // A visitor who isn't logged in: the usual answer, not a fault.
    quietStatuses: [HttpStatus.Forbidden]
  });

  /** Whether this answer is newer than what the state stands on; it then becomes that answer. */
  const takesOver = () => {
    if (lookup <= appliedLookup) return false;
    appliedLookup = lookup;
    return true;
  };

  if (!result.ok) {
    // GET /user answers 403 only for a missing or ended session. Only the API's own 403 (with its
    // { error }) says so, not a proxy's block page; other failures say nothing about the session.
    const loggedOut = result.status === HttpStatus.Forbidden && apiErrorOf(result) !== undefined;
    if (loggedOut && takesOver()) {
      // A later check (e.g. a call's own refresh after `onSessionRefused`'s) keeps the notice.
      const ended = isLoggedIn.value || sessionEnded.value;
      forgetUser();
      sessionEnded.value = ended;
    }
    return false;
  }

  if (!takesOver()) {
    return true;
  }

  const { data } = result;
  userEmail.value = data.email;
  userId.value = data._id;
  username.value = data.username ?? "";
  isSuperuser.value = data.isSuperuser === true;
  githubLinked.value = Boolean(data.githubId);
  githubLogin.value = data.githubLogin ?? "";
  hasPassword.value = data.hasPassword === true;
  pendingEmail.value = data.pendingEmail ?? "";
  emailVerified.value = data.emailVerified === true;
  mfa.value = { ...NO_MFA, ...data.mfa };
  isLoggedIn.value = true;
  sessionEnded.value = false;
  return true;
};

// Any other call the API turns away as logged out asks `GET /user` again, whose 403 then logs the
// page out above, with the session-ended notice. Asking rather than logging out right away ignores
// an answer to a request sent before the latest login. `GET /user`'s own 403 is handled above, so
// it doesn't ask again, and a visitor has no session to lose. Refusals that arrive together (e.g.
// a page's parallel loads) share one check.
let sessionRecheck: Promise<boolean> | undefined;
onSessionRefused((endpoint) => {
  if (endpoint === Endpoints.User.get || !isLoggedIn.value) return;
  return (sessionRecheck ??= fetchUserDetails().finally(() => (sessionRecheck = undefined)));
});

let sessionRestore: Promise<void> | undefined;

/** Looks up the current session once; later calls share the same lookup. */
export const restoreSession = () => {
  sessionRestore ??= fetchUserDetails().then(() => {
    isSessionChecked.value = true;
  });
  return sessionRestore;
};

/**
 * Logs in; `loginStatus` says how it went. After the login limiter's 429 (vb2007/vb2007.hu-api#204)
 * it returns the seconds the API refuses even the right password for: 0 when it didn't say. A
 * login that's no longer the newest (see `forgetLogin`) reports nothing and holds nothing, but a
 * session it started still logs the page in.
 */
export const login = async (email: string, password: string): Promise<number | undefined> => {
  const attempt = ++sentLogins;
  // Cleared while it works, so the same refusal again is shown (and announced) afresh.
  loginStatus.value = "";
  const result = await apiRequest(Endpoints.Auth.login, {
    body: { email, password },
    failure: Messages.Auth.loginFailed
  });
  /** Whether a newer login, or `forgetLogin`, came since: then this one's outcome is no one's. */
  const isStale = () => attempt !== sentLogins;

  if (!result.ok) {
    if (isStale()) return;
    if (result.kind === "http" && result.status === HttpStatus.TooManyRequests) {
      // Locked out for up to 15 minutes: the form holds its key for the wait and counts it down
      // there.
      loginStatus.value = Messages.Auth.loginLockedOut;
      return retryAfterFrom(result.body, 0);
    }
    loginStatus.value = apiErrorOf(result) ?? LoginStatus.UnknownError;
    return;
  }

  // A 202: the password was right, but the account has a second step, so no session yet.
  if (result.status === HttpStatus.Accepted && "mfaRequired" in result.data) {
    if (!isStale()) startMfa(result.data.methods);
    return;
  }

  await finishLogin(attempt);
};

const forgetUser = () => {
  userEmail.value = "";
  userId.value = "";
  username.value = "";
  isSuperuser.value = false;
  githubLinked.value = false;
  githubLogin.value = "";
  hasPassword.value = false;
  pendingEmail.value = "";
  emailVerified.value = false;
  mfa.value = { ...NO_MFA };
  isLoggedIn.value = false;
  sessionEnded.value = false;
};

/** Forgets the logged-in user locally; the API ends the session itself. */
export const clearSession = () => {
  // A lookup still on its way was sent before this, so its answer no longer counts.
  appliedLookup = sentLookups;
  forgetUser();
};

export const logout = async () => {
  // The cookie is HttpOnly, so only the API can clear it; a failure still logs out here.
  await apiRequest(Endpoints.Auth.logout, { failure: Messages.Auth.logoutFailed });

  clearSession();
};
