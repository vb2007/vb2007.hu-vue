import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { jsonResponse, mockFetch } from "@/__tests__/helpers/fetch";
import { isLoggedIn, userEmail, userId } from "@/scripts/authentication/authState";
import {
  confirmPasswordReset,
  confirmPasswordResetLink,
  isResetLinkToken,
  passwordResetNotice,
  requestPasswordReset,
  resetLinkTokenFrom,
  resetLinkUserId
} from "@/scripts/authentication/passwordReset";
import { clearSession } from "@/scripts/authentication/user";

vi.mock("@/scripts/authentication/user", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/scripts/authentication/user")>()),
  clearSession: vi.fn()
}));

const SENT = "If an account uses this address, a password reset code was sent to it.";
const RESET = "Password reset successfully: log in with the new password.";
const USER_ID = "0123456789abcdef01234567";
const TOKEN = `${USER_ID}.${"a".repeat(40)}-_9`;
const BAD_LINK = "The reset link is wrong, expired or already used: request a new one.";

let fetchMock: ReturnType<typeof mockFetch>;

beforeEach(() => {
  fetchMock = mockFetch();
  vi.mocked(clearSession).mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  passwordResetNotice.value = "";
  isLoggedIn.value = false;
  userEmail.value = "";
  userId.value = "";
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
    fetchMock.mockResolvedValueOnce(jsonResponse(200, {}));

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

  it("returns the mail limit's error with its wait", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(429, { error: "Too many e-mails requested: try again later.", retryAfter: 3412 })
    );

    await expect(requestPasswordReset("me@example.com")).resolves.toEqual({
      error: "Too many e-mails requested: try again later.",
      retryAfter: 3412
    });
  });

  it("waits a minute after a 429 without a retryAfter", async () => {
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
    fetchMock.mockResolvedValueOnce(jsonResponse(200, {}));

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

  it("returns the code checks' 429 with its wait, which even the right code gets at the cap", async () => {
    const error = "Too many failed attempts: try again later.";
    fetchMock.mockResolvedValueOnce(jsonResponse(429, { error, retryAfter: 86_400 }));

    await expect(confirmPasswordReset("me@example.com", "123456", "new password")).resolves.toEqual(
      { error, retryAfter: 86_400 }
    );
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

describe("the mailed reset link", () => {
  it("reads the token from the fragment, with or without the #", () => {
    expect(resetLinkTokenFrom(`#token=${TOKEN}`)).toBe(TOKEN);
    expect(resetLinkTokenFrom(`token=${TOKEN}`)).toBe(TOKEN);
    expect(resetLinkTokenFrom("#token=")).toBe("");
  });

  it("finds no token in a fragment without one", () => {
    expect(resetLinkTokenFrom("")).toBeNull();
    expect(resetLinkTokenFrom("#top")).toBeNull();
  });

  it("knows a token's shape: 24 hex digits, a dot and 43 base64url characters", () => {
    expect(isResetLinkToken(TOKEN)).toBe(true);
    expect(isResetLinkToken(TOKEN.slice(0, -1))).toBe(false);
    expect(isResetLinkToken(`${TOKEN}a`)).toBe(false);
    expect(isResetLinkToken(TOKEN.toUpperCase())).toBe(false);
    expect(isResetLinkToken(TOKEN.replace(".", "-"))).toBe(false);
    expect(isResetLinkToken(`${USER_ID}.${"a".repeat(42)}=`)).toBe(false);
    expect(isResetLinkToken("")).toBe(false);
  });

  it("names the account a token belongs to", () => {
    expect(resetLinkUserId(TOKEN)).toBe(USER_ID);
  });
});

describe("confirmPasswordResetLink", () => {
  it("sets the new password with the token and keeps the message for the login page", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { message: RESET }));

    await expect(confirmPasswordResetLink(TOKEN, "new password")).resolves.toEqual({
      message: RESET
    });

    expect(fetchMock).toHaveBeenCalledWith("https://api.test/auth/password-reset/confirm-link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: TOKEN, newPassword: "new password" })
    });
    expect(passwordResetNotice.value).toBe(RESET);
    expect(clearSession).not.toHaveBeenCalled();
  });

  it("logs out a user who was logged in as the link's account, since the API ended its sessions", async () => {
    isLoggedIn.value = true;
    userId.value = USER_ID;
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { message: RESET }));

    await confirmPasswordResetLink(TOKEN, "new password");

    expect(clearSession).toHaveBeenCalledOnce();
    expect(passwordResetNotice.value).toBe(RESET);
  });

  it("keeps a user logged in as another account", async () => {
    isLoggedIn.value = true;
    userId.value = "76543210fedcba9876543210";
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { message: RESET }));

    await confirmPasswordResetLink(TOKEN, "new password");

    expect(clearSession).not.toHaveBeenCalled();
  });

  it("keeps an empty notice when the API sent no message", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, {}));

    await expect(confirmPasswordResetLink(TOKEN, "new password")).resolves.toEqual({
      message: ""
    });
    expect(passwordResetNotice.value).toBe("");
  });

  it("returns the API's error for a link that doesn't work and leaves the session alone", async () => {
    isLoggedIn.value = true;
    userId.value = USER_ID;
    fetchMock.mockResolvedValueOnce(jsonResponse(400, { error: BAD_LINK }));

    await expect(confirmPasswordResetLink(TOKEN, "new password")).resolves.toEqual({
      error: BAD_LINK,
      linkRefused: true
    });
    expect(clearSession).not.toHaveBeenCalled();
    expect(passwordResetNotice.value).toBe("");
  });

  it("returns the limit's error after too many rejected links", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(429, { error: "Too many failed attempts: try again later.", retryAfter: 900 })
    );

    await expect(confirmPasswordResetLink(TOKEN, "new password")).resolves.toEqual({
      error: "Too many failed attempts: try again later.",
      retryAfter: 900
    });
  });

  it.each([
    "The password's too short: it must be between 8 and 128 characters.",
    "The password's too long: it must be between 8 and 128 characters."
  ])("tells a refused password from a refused link: %s", async (error) => {
    fetchMock.mockResolvedValueOnce(jsonResponse(400, { error }));

    await expect(confirmPasswordResetLink(TOKEN, "new password")).resolves.toEqual({
      error,
      passwordRefused: true
    });
  });

  it("keeps the link for a 400 it doesn't know, e.g. a password rule the API changed", async () => {
    const error = "The password's too short: it must be between 10 and 128 characters.";
    fetchMock.mockResolvedValueOnce(jsonResponse(400, { error }));

    await expect(confirmPasswordResetLink(TOKEN, "new password")).resolves.toEqual({ error });
  });

  it("names the status of any other error, which says nothing about the link", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(500));

    await expect(confirmPasswordResetLink(TOKEN, "new password")).resolves.toEqual({
      error: "Failed to reset the password: 500"
    });
  });

  it("refuses a malformed token without asking the API", async () => {
    await expect(confirmPasswordResetLink("not-a-token", "new password")).resolves.toEqual({
      error: "This reset link isn't complete or was changed: request a new one."
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports an unreachable server", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));

    await expect(confirmPasswordResetLink(TOKEN, "new password")).resolves.toEqual({
      error: "Error connecting to server"
    });
  });
});
