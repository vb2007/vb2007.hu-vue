import { LoginStatus } from "@/constants/auth";
import { Endpoints } from "@/constants/endpoints";
import { HttpStatus } from "@/constants/http";
import { Messages } from "@/constants/messages";
import { apiErrorOf, apiRequest } from "@/scripts/api/client";
import {
  emailVerified,
  githubLinked,
  githubLogin,
  hasPassword,
  isLoggedIn,
  isSessionChecked,
  isSuperuser,
  pendingEmail,
  userEmail,
  username
} from "@/scripts/authentication/authState";
import { ref } from "vue";

/** A `LoginStatus`, or the API's message when logging in failed. */
export const loginStatus = ref("");

/**
 * The session lives in an HttpOnly cookie set by the API, so the page can't read it.
 * Whether the user is logged in is only known by asking the API (with credentials).
 */
export const fetchUserDetails = async () => {
  const result = await apiRequest(Endpoints.User.get, {
    failure: Messages.Auth.userFailed,
    // Logged out (no session, or an expired or ended one): the API's usual 403, not a fault.
    quietStatuses: [HttpStatus.Forbidden]
  });

  if (!result.ok) {
    return false;
  }

  const { data } = result;
  userEmail.value = data.email;
  username.value = data.username ?? "";
  isSuperuser.value = data.isSuperuser === true;
  githubLinked.value = Boolean(data.githubId);
  githubLogin.value = data.githubLogin ?? "";
  hasPassword.value = data.hasPassword === true;
  pendingEmail.value = data.pendingEmail ?? "";
  emailVerified.value = data.emailVerified === true;
  isLoggedIn.value = true;
  return true;
};

let sessionRestore: Promise<void> | undefined;

/** Looks up the current session once; later calls share the same lookup. */
export const restoreSession = () => {
  sessionRestore ??= fetchUserDetails().then(() => {
    isSessionChecked.value = true;
  });
  return sessionRestore;
};

export const login = async (email: string, password: string) => {
  const result = await apiRequest(Endpoints.Auth.login, {
    body: { email, password },
    failure: Messages.Auth.loginFailed
  });

  if (!result.ok) {
    loginStatus.value = apiErrorOf(result) ?? LoginStatus.UnknownError;
    return;
  }

  // The API answered 200, but only a working session cookie makes the login real.
  loginStatus.value = (await fetchUserDetails())
    ? LoginStatus.Success
    : Messages.Auth.sessionNotKept;
};

/** Forgets the logged-in user locally; the API ends the session itself. */
export const clearSession = () => {
  userEmail.value = "";
  username.value = "";
  isSuperuser.value = false;
  githubLinked.value = false;
  githubLogin.value = "";
  hasPassword.value = false;
  pendingEmail.value = "";
  emailVerified.value = false;
  isLoggedIn.value = false;
};

export const logout = async () => {
  // The cookie is HttpOnly, so only the API can clear it; a failure still logs out here.
  await apiRequest(Endpoints.Auth.logout, { failure: Messages.Auth.logoutFailed });

  clearSession();
};
