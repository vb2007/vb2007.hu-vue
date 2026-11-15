import { beforeEach, describe, expect, it, vi } from "vitest";
import { deferResponse, jsonResponse, mockFetch } from "@/__tests__/helpers/fetch";
import { loadMfaMethods, verifyMfa, verifyMfaLink } from "@/scripts/authentication/mfa";
import { forgetLogin, loginStatus, mfaMethods, startMfa } from "@/scripts/authentication/user";
import { isLoggedIn } from "@/scripts/authentication/authState";
import { clearSession } from "@/scripts/authentication/user";

const EXPIRED =
  "The login's second step expired, used up its tries or was never started: log in again.";
/** `GET /user` without a session: the 403 the lookup after an expired step gets. */
const LOGGED_OUT = () =>
  jsonResponse(403, { error: "You must be logged in to perform this action." });
const WRONG_CODE = "The code is wrong, expired or already used: check it or request a new one.";

let fetchMock: ReturnType<typeof mockFetch>;

beforeEach(() => {
  fetchMock = mockFetch();
  vi.spyOn(console, "error").mockImplementation(() => {});
  forgetLogin();
  clearSession();
});

describe("loadMfaMethods", () => {
  it("opens the second step with the API's methods", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { methods: ["email", "recovery"] }));

    await loadMfaMethods();

    expect(fetchMock).toHaveBeenCalledWith("https://api.test/auth/mfa", {
      method: "GET",
      credentials: "include"
    });
    expect(mfaMethods.value).toEqual(["email", "recovery"]);
    expect(loginStatus.value).toBe("mfa-required");
  });

  it("says why when the step expired, without logging it", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(403, { error: EXPIRED }));

    await loadMfaMethods();

    expect(mfaMethods.value).toEqual([]);
    expect(loginStatus.value).toBe(EXPIRED);
    expect(console.error).not.toHaveBeenCalled();
  });

  it("reports an unknown error when the API is unreachable", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));

    await loadMfaMethods();

    expect(loginStatus.value).toBe("unknown-error");
  });

  it("reports nothing once the login form forgot it", async () => {
    const response = deferResponse(fetchMock);
    const pending = loadMfaMethods();
    forgetLogin();
    response.respond(jsonResponse(200, { methods: ["email"] }));
    await pending;

    expect(mfaMethods.value).toEqual([]);
    expect(loginStatus.value).toBe("");
  });
});

describe("verifyMfa", () => {
  it("finishes the login once the code passes", async () => {
    startMfa(["email"]);
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, { message: "Login successful with user me." }))
      .mockResolvedValueOnce(jsonResponse(200, { email: "me@example.com" }));

    await expect(verifyMfa({ method: "email", code: "123456" })).resolves.toBeUndefined();

    expect(fetchMock).toHaveBeenNthCalledWith(1, "https://api.test/auth/mfa/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ method: "email", code: "123456" }),
      credentials: "include"
    });
    expect(isLoggedIn.value).toBe(true);
    expect(loginStatus.value).toBe("success");
    expect(mfaMethods.value).toEqual([]);
  });

  it("returns a wrong code's refusal, without logging it, and stays in the step", async () => {
    startMfa(["email"]);
    fetchMock.mockResolvedValueOnce(jsonResponse(400, { error: WRONG_CODE }));

    const failure = await verifyMfa({ method: "email", code: "000000" });

    expect(failure?.error).toBe(WRONG_CODE);
    expect(mfaMethods.value).toEqual(["email"]);
    expect(console.error).not.toHaveBeenCalled();
  });

  it("goes back to the password with the API's message once the step expired", async () => {
    startMfa(["email"]);
    fetchMock
      .mockResolvedValueOnce(jsonResponse(403, { error: EXPIRED }))
      .mockResolvedValueOnce(LOGGED_OUT());

    const failure = await verifyMfa({ method: "email", code: "123456" });

    expect(fetchMock).toHaveBeenLastCalledWith("https://api.test/user", {
      method: "GET",
      credentials: "include"
    });
    expect(failure?.status).toBe(403);
    expect(mfaMethods.value).toEqual([]);
    expect(loginStatus.value).toBe(EXPIRED);
    expect(console.error).not.toHaveBeenCalled();
  });

  it("finishes as logged in when another tab passed the step, e.g. with its link", async () => {
    startMfa(["email"]);
    fetchMock
      .mockResolvedValueOnce(jsonResponse(403, { error: EXPIRED }))
      .mockResolvedValueOnce(jsonResponse(200, { email: "me@example.com" }));

    await expect(verifyMfa({ method: "email", code: "123456" })).resolves.toBeUndefined();

    expect(isLoggedIn.value).toBe(true);
    expect(loginStatus.value).toBe("success");
    expect(mfaMethods.value).toEqual([]);
  });

  it("leaves a login started meanwhile alone when an old step's 403 lands", async () => {
    startMfa(["email"]);
    const response = deferResponse(fetchMock);
    const pending = verifyMfa({ method: "email", code: "123456" });
    forgetLogin();
    fetchMock.mockResolvedValueOnce(LOGGED_OUT());
    response.respond(jsonResponse(403, { error: EXPIRED }));
    await pending;

    expect(loginStatus.value).toBe("");
  });

  it("logs in, but reports nothing, when another tab passed a step left meanwhile", async () => {
    startMfa(["email"]);
    const response = deferResponse(fetchMock);
    const pending = verifyMfa({ method: "email", code: "123456" });
    forgetLogin();
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { email: "me@example.com" }));
    response.respond(jsonResponse(403, { error: EXPIRED }));
    await pending;

    expect(isLoggedIn.value).toBe(true);
    expect(loginStatus.value).toBe("");
  });
});

describe("verifyMfaLink", () => {
  it("sends the link's token, and finishes the login", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, { message: "Login successful with user me." }))
      .mockResolvedValueOnce(jsonResponse(200, { email: "me@example.com" }));

    await expect(verifyMfaLink("s3cret")).resolves.toBeUndefined();

    expect(fetchMock).toHaveBeenNthCalledWith(1, "https://api.test/auth/mfa/verify-link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: "s3cret" }),
      credentials: "include"
    });
    expect(loginStatus.value).toBe("success");
  });

  it.each([
    [400, "The login link is wrong, expired or already used, or was opened in another browser."],
    [403, EXPIRED]
  ])("returns the API's %i without logging it", async (status, error) => {
    fetchMock.mockResolvedValueOnce(jsonResponse(status, { error }));
    if (status === 403) fetchMock.mockResolvedValueOnce(LOGGED_OUT());

    const failure = await verifyMfaLink("s3cret");

    expect(failure?.error).toBe(error);
    expect(console.error).not.toHaveBeenCalled();
  });
});
