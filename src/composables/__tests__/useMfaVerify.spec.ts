import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises } from "@vue/test-utils";
import { deferResponse, jsonResponse, mockFetch } from "@/__tests__/helpers/fetch";
import { mountComposable } from "@/__tests__/helpers/host";
import { useMfaVerify } from "@/composables/useMfaVerify";
import { isLoggedIn } from "@/scripts/authentication/authState";
import {
  clearSession,
  forgetLogin,
  loginStatus,
  mfaMethods,
  startMfa
} from "@/scripts/authentication/user";

const WRONG_CODE = "The code is wrong, expired or already used: check it or request a new one.";
const TOO_MANY = "Too many failed attempts: try again later.";
const body = { method: "email", code: "123456" } as const;

/** Each mount listens for the tab coming back, so every one is unmounted after its test. */
let mounted: { unmount: () => void }[] = [];
const mountVerify = () => {
  const host = mountComposable(useMfaVerify);
  mounted.push(host.wrapper);
  return host;
};

describe("useMfaVerify", () => {
  let fetchMock: ReturnType<typeof mockFetch>;

  beforeEach(() => {
    fetchMock = mockFetch();
    vi.spyOn(console, "error").mockImplementation(() => {});
    forgetLogin();
    clearSession();
    startMfa(["email"]);
  });
  afterEach(() => {
    vi.useRealTimers();
    mounted.forEach((wrapper) => wrapper.unmount());
    mounted = [];
  });

  it("passes a right answer", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, { message: "Login successful with user me." }))
      .mockResolvedValueOnce(jsonResponse(200, { email: "me@example.com" }));
    const { verify, isVerifying, refusal, error } = mountVerify().api;

    const pending = verify(body);
    expect(isVerifying.value).toBe(true);

    expect(await pending).toBe(true);
    expect(isVerifying.value).toBe(false);
    expect(refusal.value).toBe("");
    expect(error.value).toBe("");
  });

  it("keeps a wrong answer's refusal apart from other failures", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(400, { error: WRONG_CODE }))
      .mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const { verify, refusal, error } = mountVerify().api;

    expect(await verify(body)).toBe(false);
    expect(refusal.value).toBe(WRONG_CODE);
    expect(error.value).toBe("");

    expect(await verify(body)).toBe(false);
    expect(refusal.value).toBe("");
    expect(error.value).toBe("Error connecting to server");
  });

  it("keeps the step's tries left from the last wrong answer that named them", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(400, { error: WRONG_CODE, attemptsLeft: 3 }))
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(jsonResponse(400, { error: "You must provide the code." }))
      .mockResolvedValueOnce(jsonResponse(400, { error: WRONG_CODE, attemptsLeft: 2 }));
    const { verify, attemptsLeft } = mountVerify().api;
    expect(attemptsLeft.value).toBeUndefined();

    await verify(body);
    expect(attemptsLeft.value).toBe(3);
    await verify(body);
    await verify(body);
    expect(attemptsLeft.value).toBe(3);
    await verify(body);
    expect(attemptsLeft.value).toBe(2);
  });

  it("holds every answer for the daily limit's wait, without asking the API", async () => {
    vi.useFakeTimers();
    fetchMock.mockResolvedValueOnce(jsonResponse(429, { error: TOO_MANY, retryAfter: 3600 }));
    const { verify, hold, error } = mountVerify().api;

    expect(await verify(body)).toBe(false);
    expect(error.value).toBe(TOO_MANY);
    expect(hold.isHeld()).toBe(true);
    expect(hold.remaining.value).toBe(3600);

    expect(await verify(body)).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("sends one answer at a time", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(400, { error: WRONG_CODE }));
    const { verify } = mountVerify().api;

    const first = verify(body);
    expect(await verify(body)).toBe(false);
    await first;

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  describe("back in the tab", () => {
    const returnToTab = () => document.dispatchEvent(new Event("visibilitychange"));

    it("takes on a session another tab finished, e.g. with the mailed link", async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse(200, { email: "me@example.com" }));
      mountVerify();

      returnToTab();
      await flushPromises();

      expect(fetchMock).toHaveBeenCalledWith("https://api.test/user", {
        method: "GET",
        credentials: "include"
      });
      expect(isLoggedIn.value).toBe(true);
      expect(loginStatus.value).toBe("success");
      expect(mfaMethods.value).toEqual([]);
    });

    it("keeps the step while the login waits for it", async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse(403, { error: "You must be logged in to perform this action." })
      );
      mountVerify();

      returnToTab();
      await flushPromises();

      expect(isLoggedIn.value).toBe(false);
      expect(mfaMethods.value).toEqual(["email"]);
    });

    it("asks nothing while hidden, while an answer is out, or once the step is gone", async () => {
      const hidden = vi.spyOn(document, "hidden", "get").mockReturnValue(true);
      const { wrapper, api } = mountVerify();
      returnToTab();
      hidden.mockReturnValue(false);

      deferResponse(fetchMock);
      void api.verify(body);
      returnToTab();
      expect(fetchMock).toHaveBeenCalledTimes(1);

      wrapper.unmount();
      mounted = [];
      returnToTab();
      expect(fetchMock).toHaveBeenCalledTimes(1);
      hidden.mockRestore();
    });
  });
});
