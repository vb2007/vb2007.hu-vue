import { ref } from "vue";
import { UserManagement } from "@/constants/api";
import { login } from "@/scripts/authentication/user";

export const registerStatus = ref("");

export const normalizeEmail = (email: string) => email.trim().toLowerCase();

const hasEmailFormat = (email: string) =>
  /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/.test(normalizeEmail(email));

export const isValidEmail = (email: string) =>
  hasEmailFormat(email) && normalizeEmail(email).length <= 254;

export const usernameLengthError = (username: string) => {
  const { length } = username.trim();

  if (length < 2) {
    return "The username's too short: it must be between 2 and 16 characters.";
  }

  if (length > 16) {
    return "The username's too long: it must be between 2 and 16 characters.";
  }

  return;
};

export const passwordLengthError = (password: string) => {
  const length = [...password].length;

  if (length < 8) {
    return "The password's too short: it must be between 8 and 128 characters.";
  }

  if (length > 128) {
    return "The password's too long: it must be between 8 and 128 characters.";
  }

  return;
};

export const validateRegisterData = (
  username: string,
  email: string,
  password: string,
  confirmPassword: string
) => {
  if (!isValidEmail(email)) {
    return hasEmailFormat(email) ? "email-too-long" : "invalid-email";
  }

  const usernameError = usernameLengthError(username);
  if (usernameError) {
    return usernameError;
  }

  const passwordError = passwordLengthError(password);
  if (passwordError) {
    return passwordError;
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
