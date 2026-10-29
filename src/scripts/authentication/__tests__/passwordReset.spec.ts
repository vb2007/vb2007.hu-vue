import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { jsonResponse, mockFetch } from "@/__tests__/helpers/fetch";
import { isLoggedIn, userEmail } from "@/scripts/authentication/authState";
import {
  confirmPasswordReset,
  passwordResetNotice,
  requestPasswordReset
} from "@/scripts/authentication/passwordReset";
import { clearSession } from "@/scripts/authentication/user";

vi.mock("@/scripts/authentication/user", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/scripts/authentication/user")>()),
  clearSession: vi.fn()
}));

const SENT = "If an account uses this address, a password reset code was sent to it.";
const RESET = "Password reset successfully: log in with the new password.";

let fetchMock: ReturnType<typeof mockFetch>;

beforeEach(() => {
  fetchMock = mockFetch();
  vi.mocked(clearSession).mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  passwordResetNotice.value = "";
});

describe("requestPasswordReset", () => {
  it("asks for a code and returns the API's message", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { message: SENT }));

    await expect(requestPasswordReset("me@example.com")).resolves.toEqual({ message: SENT });

    expect(fetchMock).toHaveBeenCalledWith("https://api.test/auth/password-reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "me@example.com" })
    });
  });

  it("returns an empty message when the API sent none", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200));

    await expect(requestPasswordReset("me@example.com")).resolves.toEqual({ message: "" });
  });

  it("returns the API's error", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(400, { error: "You must provide an E-mail address." })
    );

    await expect(requestPasswordReset("")).resolves.toEqual({
      error: "You must provide an E-mail address."
    });
  });

  it("returns the mail limit's error with the wait", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(429, { error: "Too many e-mails requested: try again later." })
    );

    await expect(requestPasswordReset("me@example.com")).resolves.toEqual({
      error: "Too many e-mails requested: try again later.",
      retryAfter: 60
    });
  });

  it("names the status when the error has no body", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(500));

    await expect(requestPasswordReset("me@example.com")).resolves.toEqual({
      error: "Failed to send the code: 500"
    });
  });

  it("reports an unreachable server", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));

    await expect(requestPasswordReset("me@example.com")).resolves.toEqual({
      error: "Error connecting to server"
    });
  });
});

describe("confirmPasswordReset", () => {
  it("sets the new password and keeps the message for the login page", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { message: RESET }));

    await expect(confirmPasswordReset("me@example.com", "123456", "new password")).resolves.toEqual(
      { message: RESET }
    );

    expect(fetchMock).toHaveBeenCalledWith("https://api.test/auth/password-reset/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "me@example.com", code: "123456", newPassword: "new password" })
    });
    expect(passwordResetNotice.value).toBe(RESET);
    expect(clearSession).not.toHaveBeenCalled();
  });

  it("logs out a user who was logged in as that account, since the API ended its sessions", async () => {
    isLoggedIn.value = true;
    userEmail.value = "me@example.com";
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { message: RESET }));

    await confirmPasswordReset(" Me@Example.com ", "123456", "new password");

    expect(clearSession).toHaveBeenCalledOnce();
    expect(passwordResetNotice.value).toBe(RESET);
  });

  it("keeps a user logged in as another account", async () => {
    isLoggedIn.value = true;
    userEmail.value = "someone@example.com";
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { message: RESET }));

    await confirmPasswordReset("me@example.com", "123456", "new password");

    expect(clearSession).not.toHaveBeenCalled();
    expect(passwordResetNotice.value).toBe(RESET);
  });

  it("keeps an empty notice when the API sent no message", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200));

    await expect(confirmPasswordReset("me@example.com", "123456", "new password")).resolves.toEqual(
      { message: "" }
    );
    expect(passwordResetNotice.value).toBe("");
  });

  it("returns the API's error and leaves the session alone", async () => {
    isLoggedIn.value = true;
    fetchMock.mockResolvedValueOnce(
      jsonResponse(400, {
        error: "The code is wrong, expired or already used: check it or request a new one."
      })
    );

    await expect(confirmPasswordReset("me@example.com", "000000", "new password")).resolves.toEqual(
      { error: "The code is wrong, expired or already used: check it or request a new one." }
    );
    expect(clearSession).not.toHaveBeenCalled();
    expect(passwordResetNotice.value).toBe("");
  });

  it("names the status when the error has no body", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(500));

    await expect(confirmPasswordReset("me@example.com", "123456", "new password")).resolves.toEqual(
      { error: "Failed to reset the password: 500" }
    );
  });

  it("reports an unreachable server", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));

    await expect(confirmPasswordReset("me@example.com", "123456", "new password")).resolves.toEqual(
      { error: "Error connecting to server" }
    );
  });
});
