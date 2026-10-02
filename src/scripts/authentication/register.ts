import { ref } from "vue";
import { UserManagement } from "@/constants/api";
import { login } from "@/scripts/authentication/user";

export const registerStatus = ref("");

export const validateRegisterData = (
  username: string,
  email: string,
  password: string,
  confirmPassword: string
) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return "invalid-email";
  }

  if (username.length < 2 || username.length > 16) {
    return "invalid-username";
  }

  if (password.length < 6 || password.length > 30) {
    return "invalid-password";
  }

  if (password !== confirmPassword) {
    return "unmatched-passwords";
  }

  return;
};

/** Returns true when the account was created (and, optionally, the user was logged in). */
export const register = async (
  username: string,
  email: string,
  password: string,
  autologin: boolean
) => {
  try {
    const response = await fetch(UserManagement.Authentication.register, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ username, email, password })
    });

    switch (response.status) {
      case 201:
        registerStatus.value = "success";

        if (autologin) {
          setTimeout(async () => {
            try {
              await login(email, password);
            } catch (loginError) {
              console.error("Error while trying to auto-login:", loginError);
            }
          }, 1000);
        }
        return true;
      case 400:
      case 403:
      case 409: {
        let message = "error";
        try {
          const data = await response.json();
          if (data.error) {
            message = data.error;
          }
        } catch (jsonError) {
          console.error("Error parsing JSON response:", jsonError);
        }
        registerStatus.value = message;
        return false;
      }
      default:
        throw new Error(`HTTP error! status: ${response.status}`);
    }
  } catch (error) {
    console.error("Error while trying to register user: ", error);
    registerStatus.value = "error";
    return false;
  }
};
