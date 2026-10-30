import { ref } from "vue";
import { UserManagement } from "@/constants/api";
import { retryAfterFrom } from "@/composables/useCountdown";
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
  /** Seconds before another code can be asked for, after a 429. */
  retryAfter?: number;
}

/** The JSON body, or null when there's none (e.g. a bare 500). */
const bodyOf = async (response: Response): Promise<Record<string, unknown> | null> => {
  try {
    return await response.json();
  } catch {
    return null;
  }
};

const post = (url: string, body: object) =>
  fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

/**
 * Asks for a code (vb2007/vb2007.hu-api#163). The API answers the same 200 whether or not an
 * account uses the address, so the message is all there is to show.
 */
export const requestPasswordReset = async (email: string): Promise<PasswordResetAnswer> => {
  try {
    const response = await post(UserManagement.Authentication.passwordReset, { email });
    const data = await bodyOf(response);

    if (response.ok) {
      return { message: String(data?.message ?? "") };
    }

    const error = String(data?.error ?? `Failed to send the code: ${response.status}`);
    return response.status === 429 ? { error, retryAfter: retryAfterFrom(data) } : { error };
  } catch (error) {
    console.error("Error while requesting a password reset: ", error);
    return { error: "Error connecting to server" };
  }
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
  try {
    const response = await post(UserManagement.Authentication.passwordResetConfirm, {
      email,
      code,
      newPassword
    });
    const data = await bodyOf(response);

    if (!response.ok) {
      return { error: String(data?.error ?? `Failed to reset the password: ${response.status}`) };
    }

    const message = String(data?.message ?? "");
    if (isLoggedIn.value && normalizeEmail(email) === normalizeEmail(userEmail.value)) {
      clearSession();
    }
    passwordResetNotice.value = message;
    return { message };
  } catch (error) {
    console.error("Error while resetting the password: ", error);
    return { error: "Error connecting to server" };
  }
};
