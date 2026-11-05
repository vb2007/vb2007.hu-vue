import { ref } from "vue";
import { Endpoints } from "@/constants/endpoints";
import { Messages } from "@/constants/messages";
import { apiRequest } from "@/scripts/api/client";
import { isLoggedIn, userEmail } from "@/scripts/authentication/authState";
import { normalizeEmail } from "@/scripts/authentication/register";
import { clearSession } from "@/scripts/authentication/user";

/** The API's message after a reset, shown once on /login (see LoginForm). */
export const passwordResetNotice = ref("");

export interface PasswordResetAnswer {
  /** The API's message when it worked. */
  message?: string;
  /** What went wrong otherwise. */
  error?: string;
}

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
 * Sets the new password with the code. The API ends every session of the account, so a user who
 * was logged in here as that account is logged out too; only locally, as the API already ended
 * the session.
 */
export const confirmPasswordReset = async (
  email: string,
  code: string,
  newPassword: string
): Promise<PasswordResetAnswer> => {
  const result = await apiRequest(Endpoints.Auth.passwordResetConfirm, {
    body: { email, code, newPassword },
    failure: Messages.Auth.passwordResetFailed
  });

  if (!result.ok) {
    return { error: result.error };
  }

  const message = result.data.message ?? "";
  if (isLoggedIn.value && normalizeEmail(email) === normalizeEmail(userEmail.value)) {
    clearSession();
  }
  passwordResetNotice.value = message;
  return { message };
};
