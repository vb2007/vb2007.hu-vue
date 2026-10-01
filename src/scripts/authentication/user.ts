import { UserManagement, AUTH_COOKIE_NAME } from "@/constants/api";
import { isLoggedIn, userEmail } from "@/scripts/authentication/authState";
import { ref } from "vue";

export const loginStatus = ref("");

export const checkAuthCookie = () => {
  const cookies = document.cookie.split("; ");
  const authCookie = cookies.find((cookie) => cookie.startsWith(AUTH_COOKIE_NAME));
  if (authCookie) {
    loginStatus.value = "success";
    isLoggedIn.value = true;
  }
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
      })
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

    const data = await response.json();
    document.cookie = `${AUTH_COOKIE_NAME}${data.sessionToken}; path=/`;
    isLoggedIn.value = true;
    userEmail.value = data.email;
    loginStatus.value = "success";
    return;
  } catch (error) {
    console.error("Error while trying to log in user:", error);
    loginStatus.value = "unknown-error";
    return;
  }
};

export const fetchUserDetails = async () => {
  try {
    const response = await fetch(UserManagement.Actions.user, {
      method: "GET",
      headers: {
        "Content-Type": "application/json"
      },
      credentials: "include"
    });

    if (response.ok) {
      const data = await response.json();
      userEmail.value = data.email;
    } else {
      console.error("Failed to fetch user details");
    }
  } catch (error) {
    console.error("Error fetching user details:", error);
  }
};

/** Marks the user as logged in when the auth cookie is present and loads their details. */
export const restoreSession = () => {
  const cookies = document.cookie.split("; ");
  const authCookie = cookies.find((cookie) => cookie.startsWith(AUTH_COOKIE_NAME));
  if (authCookie) {
    isLoggedIn.value = true;
    fetchUserDetails();
  }
};

export const logout = () => {
  document.cookie = `${AUTH_COOKIE_NAME}; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`;
  userEmail.value = "";
  isLoggedIn.value = false;
};
