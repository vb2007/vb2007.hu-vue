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
  const ok = (challenge: string, timeout?: number): ApiResult<Options> => ({
    ok: true,
    status: 200,
    data: { challenge, timeout }
  });

  afterEach(() => vi.useRealTimers());

  it("asks now, and waits, without options got ready ahead", async () => {
    const fetch = vi.fn(async () => ok("a", 1000));

    expect(await optionsAhead(fetch).take()).toEqual({ result: ok("a", 1000), fetched: true });
  });

  it("hands on live options ready ahead without asking again, once", async () => {
    const fetch = vi.fn(async () => ok("a", 1000));
    const ahead = optionsAhead(fetch);
    ahead.prefetch();
    ahead.prefetch();
    await flushPromises();

    expect(await ahead.take()).toEqual({ result: ok("a", 1000), fetched: false });
    expect(fetch).toHaveBeenCalledOnce();
    fetch.mockResolvedValueOnce(ok("b", 1000));
    expect((await ahead.take()).result).toEqual(ok("b", 1000));
  });

  it("counts options still on their way as a wait", async () => {
    const ahead = optionsAhead(async () => ok("a", 1000));
    ahead.prefetch();

    expect(await ahead.take()).toEqual({ result: ok("a", 1000), fetched: true });
  });

  it("asks again once the options outlived their timeout, or never said one", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const fetch = vi
      .fn<() => Promise<ApiResult<Options>>>()
      .mockResolvedValueOnce(ok("a", 1000))
      .mockResolvedValueOnce(ok("b", 1000))
      .mockResolvedValueOnce(ok("c"))
      .mockResolvedValueOnce(ok("d"));
    const ahead = optionsAhead(fetch);
    ahead.prefetch();
    await flushPromises();
    vi.setSystemTime(Date.now() + 1001);

    expect(await ahead.take()).toEqual({ result: ok("b", 1000), fetched: true });
    ahead.prefetch();
    await flushPromises();
    expect((await ahead.take()).result).toEqual(ok("d"));
  });

  it("hands on a failure got ahead as it is", async () => {
    const failure: ApiResult<Options> = { ok: false, kind: "network", status: 0, error: "Down" };
    const fetch = vi.fn(async () => failure);
    const ahead = optionsAhead(fetch);
    ahead.prefetch();
    await flushPromises();

    expect(await ahead.take()).toEqual({ result: failure, fetched: false });
    expect(fetch).toHaveBeenCalledOnce();
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
