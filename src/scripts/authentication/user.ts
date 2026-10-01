import { UserManagement } from "@/constants/api";
import { isLoggedIn, isSessionChecked, userEmail } from "@/scripts/authentication/authState";
import { ref } from "vue";

export const loginStatus = ref("");

/**
 * The session lives in an HttpOnly cookie set by the API, so the page can't read it.
 * Whether the user is logged in is only known by asking the API (with credentials).
 */
const fetchUserDetails = async () => {
  try {
    const response = await fetch(UserManagement.Actions.user, {
      method: "GET",
      credentials: "include"
    });

    if (!response.ok) {
      return false;
    }

    const data = await response.json();
    userEmail.value = data.email;
    isLoggedIn.value = true;
    return true;
  } catch (error) {
    console.error("Error fetching user details:", error);
    return false;
  }
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
  try {
    const response = await fetch(UserManagement.Authentication.login, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        email: email,
        password: password
      }),
      credentials: "include"
    });

    if (!response.ok) {
      let errorMessage = "unknown-error";

      try {
        const data = await response.json();
        if (data.error) {
          errorMessage = data.error;
        }
      } catch (jsonError) {
        console.error("Error parsing JSON response:", jsonError);
      }

      loginStatus.value = errorMessage;
      return;
    }

    // The API answered 200, but only a working session cookie makes the login real.
    if (await fetchUserDetails()) {
      loginStatus.value = "success";
    } else {
      loginStatus.value =
        "Login succeeded, but your browser didn't keep the session. Please check that cookies are enabled.";
    }
  } catch (error) {
    console.error("Error while trying to log in user:", error);
    loginStatus.value = "unknown-error";
  }
};

export const logout = async () => {
  // The cookie is HttpOnly, so only the API can clear it.
  try {
    await fetch(UserManagement.Authentication.logout, {
      method: "POST",
      credentials: "include",
      redirect: "manual"
    });
  } catch (error) {
    console.error("Error while trying to log out user:", error);
  }

  userEmail.value = "";
  isLoggedIn.value = false;
};
