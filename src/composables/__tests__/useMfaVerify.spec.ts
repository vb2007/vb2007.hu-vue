import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { jsonResponse, mockFetch } from "@/__tests__/helpers/fetch";
import { mountComposable } from "@/__tests__/helpers/host";
import { useMfaVerify } from "@/composables/useMfaVerify";
import { forgetLogin, startMfa } from "@/scripts/authentication/user";

const WRONG_CODE = "The code is wrong, expired or already used: check it or request a new one.";
const TOO_MANY = "Too many failed attempts: try again later.";
const body = { method: "email", code: "123456" } as const;

describe("useMfaVerify", () => {
  let fetchMock: ReturnType<typeof mockFetch>;

  beforeEach(() => {
    fetchMock = mockFetch();
    vi.spyOn(console, "error").mockImplementation(() => {});
    forgetLogin();
    startMfa(["email"]);
  });
  afterEach(() => vi.useRealTimers());

  it("passes a right answer", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, { message: "Login successful with user me." }))
      .mockResolvedValueOnce(jsonResponse(200, { email: "me@example.com" }));
    const { verify, isVerifying, refusal, error } = mountComposable(useMfaVerify).api;

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
    const { verify, refusal, error } = mountComposable(useMfaVerify).api;

    expect(await verify(body)).toBe(false);
    expect(refusal.value).toBe(WRONG_CODE);
    expect(error.value).toBe("");

    expect(await verify(body)).toBe(false);
    expect(refusal.value).toBe("");
    expect(error.value).toBe("Error connecting to server");
  });

  it("holds every answer for the daily limit's wait, without asking the API", async () => {
    vi.useFakeTimers();
    fetchMock.mockResolvedValueOnce(jsonResponse(429, { error: TOO_MANY, retryAfter: 3600 }));
    const { verify, hold, error } = mountComposable(useMfaVerify).api;

    expect(await verify(body)).toBe(false);
    expect(error.value).toBe(TOO_MANY);
    expect(hold.isHeld()).toBe(true);
    expect(hold.remaining.value).toBe(3600);

    expect(await verify(body)).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("sends one answer at a time", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(400, { error: WRONG_CODE }));
    const { verify } = mountComposable(useMfaVerify).api;

    const first = verify(body);
    expect(await verify(body)).toBe(false);
    await first;

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
