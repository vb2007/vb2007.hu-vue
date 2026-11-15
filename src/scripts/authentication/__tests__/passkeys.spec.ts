import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises } from "@vue/test-utils";
import { Messages } from "@/constants/messages";
import { jsonResponse, mockFetch } from "@/__tests__/helpers/fetch";
import { isLoggedIn, NO_MFA } from "@/scripts/authentication/authState";
import type { ApiResult } from "@/scripts/api/client";
import {
  optionsAhead,
  passkeyLogin,
  passkeyNameEarlyError,
  passkeyNameError,
  prefetchPasskeyLogin
} from "@/scripts/authentication/passkeys";
import { clearSession, forgetLogin, loginStatus } from "@/scripts/authentication/user";
import { getPasskey } from "@/scripts/authentication/webauthn";

vi.mock("@/scripts/authentication/webauthn", () => ({ getPasskey: vi.fn() }));

const INVALID = "The passkey couldn't be verified: try again or log in another way.";
const RESPONSE = { id: "cred-1" };
const OPTIONS = { challenge: "abc", rpId: "vb2007.hu", timeout: 300_000 };
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
    ["a".repeat(65), Messages.Passkeys.nameTooLong(64)],
    // The API's character rule, before the length, with usernames' emoji exceptions.
    ["Lap​top", Messages.Passkeys.nameInvalidCharacters],
    ["Lap\ttop", Messages.Passkeys.nameInvalidCharacters],
    ["Lap\ntop", Messages.Passkeys.nameInvalidCharacters],
    ["Laptop‮", Messages.Passkeys.nameInvalidCharacters],
    ["Lap top", Messages.Passkeys.nameInvalidCharacters],
    ["Lap top", Messages.Passkeys.nameInvalidCharacters],
    [`${"a".repeat(65)}​`, Messages.Passkeys.nameInvalidCharacters],
    ["a‍\u{1F600}", Messages.Passkeys.nameInvalidCharacters],
    ["Family \u{1F468}‍\u{1F469}‍\u{1F467}", ""],
    ["Rainbow \u{1F3F3}️‍\u{1F308}", ""],
    ["England \u{1F3F4}\u{E0067}\u{E0062}\u{E0065}\u{E006E}\u{E0067}\u{E007F}", ""],
    ["Stray tag \u{E0067}", Messages.Passkeys.nameInvalidCharacters],
    // Only the trimmed name is sent, so whitespace around it is no problem.
    ["\tLaptop\n", ""]
  ])("checks %j", (name, error) => {
    expect(passkeyNameError(name)).toBe(error);
  });

  it("only names a length while typing, not an empty field", () => {
    expect(passkeyNameEarlyError("")).toBe("");
    expect(passkeyNameEarlyError("a".repeat(65))).toBe(Messages.Passkeys.nameTooLong(64));
  });
});

describe("optionsAhead", () => {
  type Options = { challenge: string; timeout?: number };
  /** The API's challenge lifetime, which its options name as their `timeout`. */
  const TIMEOUT = 300_000;
  const ok = (challenge: string, timeout: number | null = TIMEOUT): ApiResult<Options> => ({
    ok: true,
    status: 200,
    data: { challenge, timeout: timeout ?? undefined }
  });
  const failure: ApiResult<Options> = { ok: false, kind: "network", status: 0, error: "Down" };
  const fetchOf = (...results: ApiResult<Options>[]) => {
    const fetch = vi.fn<() => Promise<ApiResult<Options>>>();
    for (const result of results) fetch.mockResolvedValueOnce(result);
    return fetch;
  };

  afterEach(() => vi.useRealTimers());

  it("asks now, and waits, without options got ready ahead", async () => {
    expect(await optionsAhead(fetchOf(ok("a"))).take()).toEqual({
      result: ok("a"),
      fetched: true
    });
  });

  it("hands on a usable set ready ahead without asking again, once", async () => {
    const fetch = fetchOf(ok("a"), ok("b"));
    const ahead = optionsAhead(fetch);
    ahead.prefetch();
    ahead.prefetch();
    await flushPromises();

    expect(await ahead.take()).toEqual({ result: ok("a"), fetched: false });
    expect(fetch).toHaveBeenCalledOnce();
    expect(await ahead.take()).toEqual({ result: ok("b"), fetched: true });
  });

  it("waits for a set still on its way, failure or not, as a wait", async () => {
    const ahead = optionsAhead(fetchOf(ok("a"), failure));
    ahead.prefetch();
    expect(await ahead.take()).toEqual({ result: ok("a"), fetched: true });

    ahead.prefetch();
    expect(await ahead.take()).toEqual({ result: failure, fetched: true });
  });

  it("reuses a set only while a minute of its timeout is left", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const start = Date.now();
    const fetch = fetchOf(ok("a"), ok("b"), ok("c"));
    const ahead = optionsAhead(fetch);
    ahead.prefetch();
    await flushPromises();
    vi.setSystemTime(start + TIMEOUT - 60_001);
    expect(await ahead.take()).toEqual({ result: ok("a"), fetched: false });

    ahead.prefetch();
    await flushPromises();
    vi.setSystemTime(start + 2 * TIMEOUT - 60_000);
    expect(await ahead.take()).toEqual({ result: ok("c"), fetched: true });
  });

  it("never reuses a set that names no timeout", async () => {
    const fetch = fetchOf(ok("a", null), ok("b"));
    const ahead = optionsAhead(fetch);
    ahead.prefetch();
    await flushPromises();

    expect(await ahead.take()).toEqual({ result: ok("b"), fetched: true });
  });

  it("replaces a set got ahead once it's past its margin", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const fetch = fetchOf(ok("a"), ok("b"));
    const ahead = optionsAhead(fetch);
    ahead.prefetch();
    await flushPromises();
    vi.setSystemTime(Date.now() + TIMEOUT);

    ahead.prefetch();
    await flushPromises();

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(await ahead.take()).toEqual({ result: ok("b"), fetched: false });
  });

  it("replaces a failure got ahead, and asks again rather than hand it on", async () => {
    const fetch = fetchOf(failure, ok("a"), failure, ok("b"));
    const ahead = optionsAhead(fetch);
    ahead.prefetch();
    await flushPromises();
    ahead.prefetch();
    await flushPromises();
    expect(await ahead.take()).toEqual({ result: ok("a"), fetched: false });

    ahead.prefetch();
    await flushPromises();
    expect(await ahead.take()).toEqual({ result: ok("b"), fetched: true });
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
    vi.mocked(getPasskey).mockResolvedValueOnce({
      ok: false,
      error: Messages.Passkeys.browserFailed
    });

    expect(await passkeyLogin()).toEqual({ error: Messages.Passkeys.browserFailed });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("suggests another try for a refused prompt that waited for its options", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, OPTIONS));
    vi.mocked(getPasskey).mockResolvedValueOnce({ ok: false, error: "" });

    expect(await passkeyLogin()).toEqual({ error: Messages.Passkeys.noPrompt });
  });

  it("uses the options got ready ahead, at once, and says nothing for a cancel", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, OPTIONS));
    prefetchPasskeyLogin();
    prefetchPasskeyLogin();
    await flushPromises();
    vi.mocked(getPasskey).mockResolvedValueOnce({ ok: false, error: "" });

    expect(await passkeyLogin()).toEqual({ error: "" });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(getPasskey).toHaveBeenCalledWith(OPTIONS);
  });

  it("says so when the browser didn't keep the session", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, OPTIONS))
      .mockResolvedValueOnce(jsonResponse(200, { message: "Login successful with user vb." }))
      .mockResolvedValueOnce(jsonResponse(403, { error: "You must be logged in." }));

    expect(await passkeyLogin()).toEqual({ error: Messages.Auth.sessionNotKept });
    // Said by the passkey's key alone, not as the password form's outcome too.
    expect(loginStatus.value).toBe("");
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
