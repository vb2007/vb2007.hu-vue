import { ref } from "vue";
import { UserManagement } from "@/constants/api";
import { retryAfterFrom } from "@/composables/useCountdown";

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

/** What POST /auth/register led to. */
export interface RegisterAnswer {
  /** A code was mailed; the account waits for it. */
  sent: boolean;
  /**
   * Set when a code went to this address less than a minute ago (the API's per-address
   * cooldown): that code still works, and another can be sent after this many seconds.
   */
  retryAfter?: number;
}

/**
 * Asks the API to mail a confirmation code (vb2007/vb2007.hu-api#28): the account is only
 * created once the code is confirmed, see useRegisterCode. `registerStatus` says what went wrong.
 */
export const register = async (
  username: string,
  email: string,
  password: string
): Promise<RegisterAnswer> => {
  try {
    const response = await fetch(UserManagement.Authentication.register, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ username, email, password })
    });

    if (response.status === 202) {
      registerStatus.value = "";
      return { sent: true };
    }

    // 400 (rules, disposable or undeliverable address), 409 (taken), 429 (too soon), 503 (mail failed)
    let message = "error";
    const answer: RegisterAnswer = { sent: false };
    try {
      const data = await response.json();
      if (data.error) {
        message = data.error;
      }
      // Only the per-address cooldown says how long; the rate limiters' 429s don't.
      if (response.status === 429 && typeof data.retryAfter === "number") {
        answer.retryAfter = retryAfterFrom(data);
      }
    } catch (jsonError) {
      console.error("Error parsing JSON response:", jsonError);
    }
    registerStatus.value = message;
    return answer;
  } catch (error) {
    console.error("Error while trying to register user: ", error);
    registerStatus.value = "error";
    return { sent: false };
  }
};
