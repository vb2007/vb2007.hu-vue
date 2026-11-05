import { ref } from "vue";
import { Endpoints } from "@/constants/endpoints";
import { HttpStatus } from "@/constants/http";
import { Limits } from "@/constants/limits";
import { Messages } from "@/constants/messages";
import { retryAfterFrom } from "@/composables/useCountdown";
import { apiRequest, type ApiResult } from "@/scripts/api/client";
import { isLoggedIn, userEmail, userId } from "@/scripts/authentication/authState";
import { normalizeEmail } from "@/scripts/authentication/register";
import { clearSession } from "@/scripts/authentication/user";
import type { MessageResponse } from "@/types/api/common";

/** The API's message after a reset, shown once on /login (see LoginForm). */
export const passwordResetNotice = ref("");

export interface PasswordResetAnswer {
  /** The API's message when it worked. */
  message?: string;
  /** What went wrong otherwise. */
  error?: string;
  /** Seconds before the same link can be tried again, after the API's 429 for too many links. */
  retryAfter?: number;
  /** The API refused the link itself: it's wrong, expired or used, so trying it again can't work. */
  linkRefused?: boolean;
  /** The API refused the new password, which leaves the link usable with another one. */
  passwordRefused?: boolean;
}

/** The API's 400s for a new password's length, by the rules `Limits` mirrors. */
const passwordLengthErrors = () => [
  Messages.Auth.passwordTooShort(Limits.Password.minLength, Limits.Password.maxLength),
  Messages.Auth.passwordTooLong(Limits.Password.minLength, Limits.Password.maxLength)
];

/**
 * Asks for a code (vb2007/vb2007.hu-api#163). The API answers the same 200 whether or not an
 * account uses the address, so the message is all there is to show. It also answers it within the
 * minute, sending nothing: its only 429 is the mail limit's, which sent no code either.
 */
export const requestPasswordReset = async (email: string): Promise<PasswordResetAnswer> => {
  const result = await apiRequest(Endpoints.Auth.passwordReset, {
    body: { email },
    failure: Messages.Auth.resetCodeFailed
  });

  if (result.ok) {
    return { message: result.data.message ?? "" };
  }

  return { error: result.error };
};

/**
 * After a reset the API ends every session of the account, so a user logged in here as that
 * account (`isThatAccount`) is logged out too; only locally, as the API already ended the session.
 */
const finishReset = (
  result: ApiResult<MessageResponse>,
  isThatAccount: () => boolean
): PasswordResetAnswer => {
  if (!result.ok) {
    return { error: result.error };
  }

  const message = result.data.message ?? "";
  if (isLoggedIn.value && isThatAccount()) {
    clearSession();
  }
  passwordResetNotice.value = message;
  return { message };
};

/** Sets the new password with the code. */
export const confirmPasswordReset = async (
  email: string,
  code: string,
  newPassword: string
): Promise<PasswordResetAnswer> =>
  finishReset(
    await apiRequest(Endpoints.Auth.passwordResetConfirm, {
      body: { email, code, newPassword },
      failure: Messages.Auth.passwordResetFailed
    }),
    () => normalizeEmail(email) === normalizeEmail(userEmail.value)
  );

/**
 * The token of a mailed reset link, `/reset-password#token=<token>` (vb2007/vb2007.hu-api#256), or
 * null when the fragment has none.
 */
export const resetLinkTokenFrom = (hash: string) =>
  new URLSearchParams(hash.replace(/^#/, "")).get("token");

/** Whether `token` has the shape of one the API mails; any other is refused without asking it. */
export const isResetLinkToken = (token: string) => Limits.Code.resetLinkToken.test(token);

/** The id of the account a well-formed token belongs to: the part before the dot. */
export const resetLinkUserId = (token: string) => token.slice(0, token.indexOf("."));

/** Sets the new password with the mailed link's token, which stands in for the address and code. */
export const confirmPasswordResetLink = async (
  token: string,
  newPassword: string
): Promise<PasswordResetAnswer> => {
  if (!isResetLinkToken(token)) {
    return { error: Messages.Auth.resetLinkMalformed };
  }

  const result = await apiRequest(Endpoints.Auth.passwordResetConfirmLink, {
    body: { token, newPassword },
    failure: Messages.Auth.passwordResetFailed
  });

  if (!result.ok) {
    // Too many rejected links from this address: this one isn't used up and works again later.
    if (result.status === HttpStatus.TooManyRequests) {
      return { error: result.error, retryAfter: retryAfterFrom(result.body) };
    }
    if (result.status === HttpStatus.BadRequest) {
      if (passwordLengthErrors().includes(result.error)) {
        return { error: result.error, passwordRefused: true };
      }
      // Only the API's own word for a used-up link gives the link up: any other 400 (e.g. a
      // password rule that changed on the API) leaves it to try again.
      if (result.error === Messages.Auth.resetLinkRefused) {
        return { error: result.error, linkRefused: true };
      }
    }
  }

  return finishReset(result, () => resetLinkUserId(token) === userId.value);
};
