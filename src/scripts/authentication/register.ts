import { ref } from "vue";
import { RegisterStatus } from "@/constants/auth";
import { Endpoints } from "@/constants/endpoints";
import { HttpStatus } from "@/constants/http";
import { Limits } from "@/constants/limits";
import { Messages } from "@/constants/messages";
import { codeCooldownOf } from "@/composables/useCountdown";
import { apiErrorOf, apiRequest } from "@/scripts/api/client";

/** A `RegisterStatus`, or the API's message when registering failed. */
export const registerStatus = ref("");

export const normalizeEmail = (email: string) => email.trim().toLowerCase();

const hasEmailFormat = (email: string) =>
  /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/.test(normalizeEmail(email));

export const isValidEmail = (email: string) =>
  hasEmailFormat(email) && normalizeEmail(email).length <= Limits.Email.maxLength;

const { minLength: USERNAME_MIN, maxLength: USERNAME_MAX } = Limits.Username;
const { minLength: PASSWORD_MIN, maxLength: PASSWORD_MAX } = Limits.Password;

export const usernameLengthError = (username: string) => {
  const { length } = username.trim();

  if (length < USERNAME_MIN) {
    return Messages.Auth.usernameTooShort(USERNAME_MIN, USERNAME_MAX);
  }

  if (length > USERNAME_MAX) {
    return Messages.Auth.usernameTooLong(USERNAME_MIN, USERNAME_MAX);
  }

  return;
};

export const passwordLengthError = (password: string) => {
  const length = [...password].length;

  if (length < PASSWORD_MIN) {
    return Messages.Auth.passwordTooShort(PASSWORD_MIN, PASSWORD_MAX);
  }

  if (length > PASSWORD_MAX) {
    return Messages.Auth.passwordTooLong(PASSWORD_MIN, PASSWORD_MAX);
  }

  return;
};

/** The e-mail field's problem, or "" when the address is fine: the API's format and length rule. */
export const emailError = (email: string) => {
  if (isValidEmail(email)) return "";
  return hasEmailFormat(email)
    ? Messages.Auth.emailTooLong(Limits.Email.maxLength)
    : Messages.Auth.invalidEmail;
};

/**
 * Only the shape of an address (something@something), for logging in and resetting a password: an
 * account made before today's address rules still gets in.
 */
export const emailShapeError = (email: string) =>
  /^[^\s@]+@[^\s@]+$/.test(email.trim()) ? "" : Messages.Auth.invalidEmail;

export const usernameError = (username: string) => usernameLengthError(username) ?? "";

/** Only a too long username: typing more can't fix that one, so it shows while typing. */
export const usernameEarlyError = (username: string) =>
  username.trim().length > USERNAME_MAX ? usernameError(username) : "";

export const passwordError = (password: string) => passwordLengthError(password) ?? "";

/** Only a too long password, which shows while typing. */
export const passwordEarlyError = (password: string) =>
  [...password].length > PASSWORD_MAX ? passwordError(password) : "";

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

const CODE_MESSAGE = Messages.EmailCode.invalid(Limits.Code.digits);

/** The API ignores spaces in a code. */
const withoutSpaces = (code: string) => code.replace(/\s/g, "");

/** The mailed codes are `Limits.Code.digits` digits. */
export const confirmationCodeError = (code: string) => {
  const digits = withoutSpaces(code);
  return /^\d+$/.test(digits) && digits.length === Limits.Code.digits ? "" : CODE_MESSAGE;
};

/** Anything but digits and spaces, or too many digits, which shows while typing. */
export const confirmationCodeEarlyError = (code: string) =>
  /[^\d\s]/.test(code) || withoutSpaces(code).length > Limits.Code.digits ? CODE_MESSAGE : "";

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
 * A failure, a 429 or an API without the endpoint yet is "unknown", never a problem to show. An
 * aborted check (newer typing replaced it) is "unknown" too, and isn't logged.
 */
export const checkUsername = async (
  username: string,
  signal?: AbortSignal
): Promise<UsernameAvailability> => {
  const result = await apiRequest(Endpoints.Auth.usernameAvailable, {
    query: { username },
    signal,
    failure: Messages.Auth.usernameCheckFailed
  });

  if (!result.ok || typeof result.data.available !== "boolean") return "unknown";
  return result.data.available ? "free" : "taken";
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
  const result = await apiRequest(Endpoints.Auth.register, {
    body: { username, email, password },
    failure: Messages.Auth.registerFailed
  });

  // A 202: the code is on its way.
  if (result.ok) {
    registerStatus.value = "";
    return { sent: true };
  }

  // 400 (rules, disposable or undeliverable address), 409 (taken), 429 (too soon or rate limited),
  // 503 (mail failed)
  const message = apiErrorOf(result) ?? RegisterStatus.Error;
  const answer: RegisterAnswer = { sent: false };
  if (result.status === HttpStatus.BadRequest || result.status === HttpStatus.Conflict) {
    answer.field = registerFieldOf(message);
  }
  // Only the per-address cooldown's 429 means a code went out; a rate limiter's sent none.
  const codeWait = codeCooldownOf(result);
  if (codeWait !== undefined) {
    answer.retryAfter = codeWait;
  }
  registerStatus.value = message;
  return answer;
};
