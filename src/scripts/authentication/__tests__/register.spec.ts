import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { jsonResponse, mockFetch } from "@/__tests__/helpers/fetch";
import { register, registerStatus, validateRegisterData } from "@/scripts/authentication/register";
import { login } from "@/scripts/authentication/user";

vi.mock("@/scripts/authentication/user", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/scripts/authentication/user")>()),
  login: vi.fn()
}));

afterEach(() => {
  registerStatus.value = "";
});

describe("validateRegisterData", () => {
  it("accepts valid data", () => {
    expect(validateRegisterData("vb", "me@example.com", "secret", "secret")).toBeUndefined();
  });

  it.each([
    ["an invalid email", ["vb", "not-an-email", "secret", "secret"], "invalid-email"],
    ["a too short username", ["v", "me@example.com", "secret", "secret"], "invalid-username"],
    [
      "a too long username",
      ["v".repeat(17), "me@example.com", "secret", "secret"],
      "invalid-username"
    ],
    ["a too short password", ["vb", "me@example.com", "12345", "12345"], "invalid-password"],
    [
      "a too long password",
      ["vb", "me@example.com", "p".repeat(31), "p".repeat(31)],
      "invalid-password"
    ],
    ["mismatched passwords", ["vb", "me@example.com", "secret", "secret2"], "unmatched-passwords"]
  ] as const)("rejects %s", (_case, [username, email, password, confirm], expected) => {
    expect(validateRegisterData(username, email, password, confirm)).toBe(expected);
  });
});

describe("register", () => {
  let fetchMock: ReturnType<typeof mockFetch>;

  beforeEach(() => {
    fetchMock = mockFetch();
    vi.mocked(login).mockReset();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("creates the account and logs in a second later when asked to", async () => {
    vi.useFakeTimers();
    fetchMock.mockResolvedValueOnce(jsonResponse(201));

    await expect(register("vb", "me@example.com", "secret", true)).resolves.toBe(true);

    expect(fetchMock).toHaveBeenCalledWith("https://api.test/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "vb", email: "me@example.com", password: "secret" })
    });
    expect(registerStatus.value).toBe("success");
    expect(login).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1000);
    expect(login).toHaveBeenCalledWith("me@example.com", "secret");
  });

  it("logs a failed auto-login instead of throwing", async () => {
    vi.useFakeTimers();
    fetchMock.mockResolvedValueOnce(jsonResponse(201));
    vi.mocked(login).mockRejectedValueOnce(new Error("boom"));

    await register("vb", "me@example.com", "secret", true);
    await vi.advanceTimersByTimeAsync(1000);

    expect(console.error).toHaveBeenCalledWith(
      "Error while trying to auto-login:",
      expect.any(Error)
    );
  });

  it("does not log in when autologin is off", async () => {
    vi.useFakeTimers();
    fetchMock.mockResolvedValueOnce(jsonResponse(201));

    await expect(register("vb", "me@example.com", "secret", false)).resolves.toBe(true);
    await vi.advanceTimersByTimeAsync(1000);

    expect(login).not.toHaveBeenCalled();
  });

  it.each([400, 403, 409])("shows the API's message for a %i response", async (status) => {
    fetchMock.mockResolvedValueOnce(jsonResponse(status, { error: "Email already taken." }));

    await expect(register("vb", "me@example.com", "secret", false)).resolves.toBe(false);
    expect(registerStatus.value).toBe("Email already taken.");
  });

  it("falls back to a generic error when the body has no message", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(400, {}));

    await expect(register("vb", "me@example.com", "secret", false)).resolves.toBe(false);
    expect(registerStatus.value).toBe("error");
  });

  it("falls back to a generic error when the body is not JSON", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(409));

    await expect(register("vb", "me@example.com", "secret", false)).resolves.toBe(false);
    expect(registerStatus.value).toBe("error");
  });

  it("treats an unexpected status as an error", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(500));

    await expect(register("vb", "me@example.com", "secret", false)).resolves.toBe(false);
    expect(registerStatus.value).toBe("error");
  });

  it("treats an unreachable API as an error", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));

    await expect(register("vb", "me@example.com", "secret", false)).resolves.toBe(false);
    expect(registerStatus.value).toBe("error");
  });
});
