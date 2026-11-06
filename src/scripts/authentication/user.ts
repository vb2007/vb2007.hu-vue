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
  pendingEmail,
  sessionEnded,
  userEmail,
  userId,
  username
} from "@/scripts/authentication/authState";
import { ref } from "vue";

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
 * it returns the seconds the API refuses even the right password for: 0 when it didn't say.
 */
export const login = async (email: string, password: string): Promise<number | undefined> => {
  // Cleared while it works, so the same refusal again is shown (and announced) afresh.
  loginStatus.value = "";
  const result = await apiRequest(Endpoints.Auth.login, {
    body: { email, password },
    failure: Messages.Auth.loginFailed
  });

  if (!result.ok && result.kind === "http" && result.status === HttpStatus.TooManyRequests) {
    // Locked out for up to 15 minutes: the message says it in whole minutes, the held key counts it.
    const seconds = retryAfterFrom(result.body, 0);
    loginStatus.value = Messages.Auth.loginLockedOut(Math.ceil(seconds / 60));
    return seconds;
  }
  if (!result.ok) {
    loginStatus.value = apiErrorOf(result) ?? LoginStatus.UnknownError;
    return;
  }

  // The API answered 200, but only a working session cookie makes the login real.
  loginStatus.value = (await fetchUserDetails())
    ? LoginStatus.Success
    : Messages.Auth.sessionNotKept;
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
