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

/** The e-mail field's problem, or "" when the address is fine: the API's format and length rule. */
export const emailError = (email: string) => {
  if (isValidEmail(email)) return "";
  return hasEmailFormat(email)
    ? "Your e-mail address can't be longer than 254 characters."
    : "Enter a valid e-mail address.";
};

/**
 * Only the shape of an address (something@something), for logging in and resetting a password: an
 * account made before today's address rules still gets in.
 */
export const emailShapeError = (email: string) =>
  /^[^\s@]+@[^\s@]+$/.test(email.trim()) ? "" : "Enter a valid e-mail address.";

export const usernameError = (username: string) => usernameLengthError(username) ?? "";

/** Only a too long username: typing more can't fix that one, so it shows while typing. */
export const usernameEarlyError = (username: string) =>
  username.trim().length > 16 ? usernameError(username) : "";

export const passwordError = (password: string) => passwordLengthError(password) ?? "";

/** Only a too long password, which shows while typing. */
export const passwordEarlyError = (password: string) =>
  [...password].length > 128 ? passwordError(password) : "";

export const passwordMatchError = (password: string, confirmPassword: string) =>
  password === confirmPassword ? "" : "The two passwords don't match.";

/**
 * A confirmation that already differs from the password where it's as long: typing more can't
 * fix it, so it shows while typing.
 */
export const passwordMatchEarlyError = (password: string, confirmPassword: string) =>
  [...confirmPassword].length >= [...password].length
    ? passwordMatchError(password, confirmPassword)
    : "";

/** `message` for an empty field, "" otherwise. */
export const requiredError = (value: string, message: string) => (value ? "" : message);

const CODE_MESSAGE = "Enter the 6-digit code from the e-mail.";

/** The mailed codes are 6 digits; the API ignores spaces in them. */
export const confirmationCodeError = (code: string) =>
  /^\d{6}$/.test(code.replace(/\s/g, "")) ? "" : CODE_MESSAGE;

/** Anything but digits and spaces, or more than 6 digits, which shows while typing. */
export const confirmationCodeEarlyError = (code: string) =>
  /[^\d\s]/.test(code) || code.replace(/\s/g, "").length > 6 ? CODE_MESSAGE : "";

/** The register form's fields, for an error about one of them. */
export type RegisterField = "email" | "username" | "password" | "confirmPassword";

/**
 * The field an API refusal is about: its 400 and 409 messages (taken, disposable or undeliverable
 * address, the length rules). Undefined when it isn't about one field.
 */
export const registerFieldOf = (problem: string): RegisterField | undefined => {
  if (/username/i.test(problem)) return "username";
  if (/password/i.test(problem)) return "password";
  if (/e-?mail/i.test(problem)) return "email";
  return undefined;
};

/** How long typing has to pause before the register form checks the username with the API. */
export const USERNAME_CHECK_DELAY = 400;

/** Whether a username is free; "unknown" when the API couldn't say, which register's 409 covers. */
export type UsernameAvailability = "free" | "taken" | "unknown";

/**
 * Asks the API whether `username` is free (vb2007/vb2007.hu-api#233), sent as register sends it.
 * A failure, a 429 or an API without the endpoint yet is "unknown", never a problem to show.
 */
export const checkUsername = async (
  username: string,
  signal?: AbortSignal
): Promise<UsernameAvailability> => {
  try {
    const query = new URLSearchParams({ username });
    const response = await fetch(`${UserManagement.Authentication.usernameAvailable}?${query}`, {
      signal
    });
    if (!response.ok) return "unknown";
    const data = await response.json();
    if (typeof data?.available !== "boolean") return "unknown";
    return data.available ? "free" : "taken";
  } catch {
    return "unknown";
  }
};

/** What POST /auth/register led to. */
export interface RegisterAnswer {
  /** A code was mailed; the account waits for it. */
  sent: boolean;
  /** The field a 400 or 409 is about; a 429's or 503's message names no field's fault. */
  field?: RegisterField;
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
      if (response.status === 400 || response.status === 409) {
        answer.field = registerFieldOf(message);
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
