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

    const data = await response.json();
    switch (response.status) {
      case 200:
        document.cookie = `${AUTH_COOKIE_NAME}${data.sessionToken}; path=/`;
        isLoggedIn.value = true;
        userEmail.value = data.email;
        break;
      case 400:
      case 403:
        return data.error;
      default:
        throw new Error(`HTTP error! status: ${response.status}`);
    }
  } catch (error) {
    console.error("Error while trying to log in user:", error);
    return "unknown-error";
  }
};
