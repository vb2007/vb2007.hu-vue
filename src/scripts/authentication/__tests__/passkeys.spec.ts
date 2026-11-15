import { beforeEach, describe, expect, it, vi } from "vitest";
import { Messages } from "@/constants/messages";
import { jsonResponse, mockFetch } from "@/__tests__/helpers/fetch";
import { isLoggedIn, NO_MFA } from "@/scripts/authentication/authState";
import {
  passkeyLogin,
  passkeyNameEarlyError,
  passkeyNameError
} from "@/scripts/authentication/passkeys";
import { clearSession, forgetLogin, loginStatus } from "@/scripts/authentication/user";
import { getPasskey } from "@/scripts/authentication/webauthn";

vi.mock("@/scripts/authentication/webauthn", () => ({ getPasskey: vi.fn() }));

const INVALID = "The passkey couldn't be verified: try again or log in another way.";
const RESPONSE = { id: "cred-1" };
const OPTIONS = { challenge: "abc", rpId: "vb2007.hu" };
const USER = {
  _id: "0123456789abcdef01234567",
  username: "vb",
  email: "vb@example.com",
  hasPassword: true,
  emailVerified: true,
  mfa: NO_MFA
};

let fetchMock: ReturnType<typeof mockFetch>;

beforeEach(() => {
  fetchMock = mockFetch();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.mocked(getPasskey).mockReset();
  vi.mocked(getPasskey).mockResolvedValue({ ok: true, response: RESPONSE });
  forgetLogin();
  clearSession();
});

describe("passkeyNameError", () => {
  it.each([
    ["", Messages.Passkeys.nameMissing],
    ["   ", Messages.Passkeys.nameMissing],
    ["Laptop", ""],
    // Counted in characters after trimming, like the API: 64 emoji are 128 UTF-16 units.
    [` ${"🔑".repeat(64)} `, ""],
    ["a".repeat(65), Messages.Passkeys.nameTooLong(64)]
  ])("checks %j", (name, error) => {
    expect(passkeyNameError(name)).toBe(error);
  });

  it("only names a length while typing, not an empty field", () => {
    expect(passkeyNameEarlyError("")).toBe("");
    expect(passkeyNameEarlyError("a".repeat(65))).toBe(Messages.Passkeys.nameTooLong(64));
  });
});

describe("passkeyLogin", () => {
  it("asks for the options, runs the prompt and takes on the session", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, OPTIONS))
      .mockResolvedValueOnce(jsonResponse(200, { message: "Login successful with user vb." }))
      .mockResolvedValueOnce(jsonResponse(200, USER));

    expect(await passkeyLogin()).toBeUndefined();

    expect(fetchMock).toHaveBeenNthCalledWith(1, "https://api.test/auth/passkey/options", {
      method: "POST",
      credentials: "include"
    });
    expect(getPasskey).toHaveBeenCalledWith(OPTIONS);
    expect(fetchMock).toHaveBeenNthCalledWith(2, "https://api.test/auth/passkey", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ response: RESPONSE })
    });
    expect(isLoggedIn.value).toBe(true);
    expect(loginStatus.value).toBe("success");
  });

  it("returns the API's refusal, without logging it", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, OPTIONS))
      .mockResolvedValueOnce(jsonResponse(403, { error: INVALID }));

    expect(await passkeyLogin()).toEqual({ error: INVALID, wait: undefined });
    expect(console.error).not.toHaveBeenCalled();
  });

  it("returns the wait of the API's 429", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(429, { error: "Too many passkey requests: try again later.", retryAfter: 42 })
    );

    expect(await passkeyLogin()).toEqual({
      error: "Too many passkey requests: try again later.",
      wait: 42
    });
    expect(getPasskey).not.toHaveBeenCalled();
  });

  it("returns the prompt's outcome without answering the API", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, OPTIONS));
    vi.mocked(getPasskey).mockResolvedValueOnce({ ok: false, error: "" });

    expect(await passkeyLogin()).toEqual({ error: "" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("says so when the browser didn't keep the session", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, OPTIONS))
      .mockResolvedValueOnce(jsonResponse(200, { message: "Login successful with user vb." }))
      .mockResolvedValueOnce(jsonResponse(403, { error: "You must be logged in." }));

    expect(await passkeyLogin()).toEqual({ error: Messages.Auth.sessionNotKept });
  });

  it("reports nothing once a newer login came while the options loaded", async () => {
    fetchMock.mockImplementationOnce(async () => {
      forgetLogin();
      return jsonResponse(200, OPTIONS);
    });

    expect(await passkeyLogin()).toBeUndefined();
    expect(getPasskey).not.toHaveBeenCalled();
  });

  it("reports nothing once a newer login came during the prompt", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, OPTIONS));
    vi.mocked(getPasskey).mockImplementationOnce(async () => {
      forgetLogin();
      return { ok: true, response: RESPONSE };
    });

    expect(await passkeyLogin()).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("reports nothing once a newer login came while it was checked", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, OPTIONS)).mockImplementationOnce(async () => {
      forgetLogin();
      return jsonResponse(403, { error: INVALID });
    });

    expect(await passkeyLogin()).toBeUndefined();
  });

  it("logs the page in but reports nothing for a login no longer the newest", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, OPTIONS))
      .mockResolvedValueOnce(jsonResponse(200, { message: "Login successful with user vb." }))
      .mockImplementationOnce(async () => {
        forgetLogin();
        return jsonResponse(200, USER);
      });

    expect(await passkeyLogin()).toBeUndefined();
    expect(isLoggedIn.value).toBe(true);
    expect(loginStatus.value).toBe("");
  });
});
