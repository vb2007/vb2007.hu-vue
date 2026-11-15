import { nextTick } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { deferResponse, jsonResponse, mockFetch } from "@/__tests__/helpers/fetch";
import { mountComposable } from "@/__tests__/helpers/host";
import { useMfaEmail } from "@/composables/useMfaEmail";
import { isLoggedIn } from "@/scripts/authentication/authState";
import {
  clearSession,
  forgetLogin,
  loginStatus,
  mfaMethods,
  startMfa
} from "@/scripts/authentication/user";

const SENT =
  "A code and a login link were sent to the account's e-mail address: send the code to POST /auth/mfa/verify, or open the link in this browser.";
const EXPIRED =
  "The login's second step expired, used up its tries or was never started: log in again.";
const DAY_LIMIT =
  "Too many login codes were mailed to this account today: try again later, or use another MFA method.";
const BUDGET = "No more e-mails can be sent today: please try again after the daily limit resets.";
const LOGGED_OUT = () =>
  jsonResponse(403, { error: "You must be logged in to perform this action." });
const MAIL_FAILED = "The e-mail couldn't be sent: please try again later.";

describe("useMfaEmail", () => {
  let fetchMock: ReturnType<typeof mockFetch>;

  beforeEach(() => {
    fetchMock = mockFetch();
    vi.spyOn(console, "error").mockImplementation(() => {});
    forgetLogin();
    clearSession();
    startMfa(["email"]);
  });
  afterEach(() => vi.useRealTimers());

  it("mails a code, then waits a minute before the next", async () => {
    vi.useFakeTimers();
    fetchMock.mockResolvedValueOnce(jsonResponse(202, { message: SENT }));
    const email = mountComposable(useMfaEmail).api;

    const pending = email.send();
    expect(email.isSending.value).toBe(true);
    expect(await pending).toBe(true);

    expect(fetchMock).toHaveBeenCalledWith("https://api.test/auth/mfa/email", {
      method: "POST",
      credentials: "include"
    });
    expect(email.sent.value).toBe(true);
    expect(email.isSending.value).toBe(false);
    expect(email.wait.remaining.value).toBe(60);
    expect(await email.send()).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("counts the cooldown down in its own words, offering no field for an earlier login's code", async () => {
    vi.useFakeTimers();
    fetchMock.mockResolvedValueOnce(
      jsonResponse(429, { error: "Wait 42 seconds.", reason: "resendCooldown", retryAfter: 42 })
    );
    const email = mountComposable(useMfaEmail).api;

    expect(await email.send()).toBe(false);

    // Nothing was sent for this login, and the earlier login's code doesn't work for it.
    expect(email.sent.value).toBe(false);
    expect(email.error.value).toMatch(
      /^A login code went out less than a minute ago for an earlier login/
    );
    expect(email.wait.remaining.value).toBe(42);
    expect(console.error).not.toHaveBeenCalled();
    vi.advanceTimersByTime(42_000);
    await nextTick();
    expect(email.error.value).toBe("");
  });

  it.each([
    [
      "the day's login codes",
      429,
      { error: DAY_LIMIT, reason: "mfaEmailLimit", retryAfter: 7200 },
      7200
    ],
    ["the hourly mail limit", 429, { error: "Too many e-mails requested.", retryAfter: 900 }, 900],
    ["the day's mail budget", 503, { error: BUDGET, reason: "mailBudget", retryAfter: 5000 }, 5000]
  ])("waits out %s with the API's message", async (_name, status, body, seconds) => {
    vi.useFakeTimers();
    fetchMock.mockResolvedValueOnce(jsonResponse(status, body));
    const email = mountComposable(useMfaEmail).api;

    expect(await email.send()).toBe(false);

    expect(email.sent.value).toBe(false);
    expect(email.error.value).toBe(body.error);
    expect(email.wait.remaining.value).toBe(seconds);
  });

  it("keeps the code sent before after a failed send, and can try again at once", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(202, { message: SENT }))
      .mockResolvedValueOnce(jsonResponse(503, { error: MAIL_FAILED }));
    const email = mountComposable(useMfaEmail).api;
    await email.send();
    email.wait.stop();

    expect(await email.send()).toBe(false);

    expect(email.sent.value).toBe(true);
    expect(email.error.value).toBe(MAIL_FAILED);
    expect(email.wait.active.value).toBe(false);
  });

  it("goes back to the password once the step expired", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(403, { error: EXPIRED }))
      .mockResolvedValueOnce(LOGGED_OUT());
    const email = mountComposable(useMfaEmail).api;

    expect(await email.send()).toBe(false);

    expect(mfaMethods.value).toEqual([]);
    expect(loginStatus.value).toBe(EXPIRED);
    expect(console.error).not.toHaveBeenCalled();
  });

  it("finishes as logged in when another tab passed the step", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(403, { error: EXPIRED }))
      .mockResolvedValueOnce(jsonResponse(200, { email: "me@example.com" }));
    const email = mountComposable(useMfaEmail).api;

    expect(await email.send()).toBe(false);

    expect(isLoggedIn.value).toBe(true);
    expect(loginStatus.value).toBe("success");
    expect(mfaMethods.value).toEqual([]);
  });

  it("leaves the login form alone when the step was left before the 403 landed", async () => {
    const response = deferResponse(fetchMock);
    const email = mountComposable(useMfaEmail).api;

    const pending = email.send();
    forgetLogin();
    fetchMock.mockResolvedValueOnce(LOGGED_OUT());
    response.respond(jsonResponse(403, { error: EXPIRED }));
    await pending;

    expect(loginStatus.value).toBe("");
  });
});
