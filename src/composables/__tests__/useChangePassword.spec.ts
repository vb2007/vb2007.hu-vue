import { nextTick } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { jsonResponse, mockFetch } from "@/__tests__/helpers/fetch";
import { mountComposable } from "@/__tests__/helpers/host";
import { useChangePassword } from "@/composables/useChangePassword";

describe("useChangePassword", () => {
  let fetchMock: ReturnType<typeof mockFetch>;

  beforeEach(() => {
    fetchMock = mockFetch();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("changes the password and keeps the API's message", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { message: "Password changed successfully." })
    );
    const password = mountComposable(useChangePassword).api;

    const pending = password.change("old-password", "new-password");
    expect(password.isChanging.value).toBe(true);

    expect(await pending).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith("https://api.test/user/password", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ currentPassword: "old-password", newPassword: "new-password" })
    });
    expect(password.changed.value).toBe("Password changed successfully.");
    expect(password.changeError.value).toBe("");
    expect(password.isChanging.value).toBe(false);
  });

  it("shows the API's refusal", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(403, { error: "The provided password is incorrect." })
    );
    const password = mountComposable(useChangePassword).api;

    expect(await password.change("wrong-password", "new-password")).toBe(false);

    expect(password.changeError.value).toBe("The provided password is incorrect.");
    expect(password.changed.value).toBe("");
    expect(password.isChanging.value).toBe(false);
  });

  it("falls back to the status when the refusal has no message", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(500, undefined, "Internal Server Error"));
    const password = mountComposable(useChangePassword).api;

    expect(await password.change("old-password", "new-password")).toBe(false);

    expect(password.changeError.value).toBe("Failed to change password: Internal Server Error");
  });

  it("reports an unreachable server and forgets an earlier success", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, { message: "Password changed successfully." }))
      .mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const password = mountComposable(useChangePassword).api;
    await password.change("old-password", "new-password");

    expect(await password.change("new-password", "newer-password")).toBe(false);

    expect(password.changeError.value).toBe("Error connecting to server");
    expect(password.changed.value).toBe("");
    expect(password.isChanging.value).toBe(false);
    expect(password.hold.isHeld()).toBe(false);
  });

  it("holds saving after the password checks' 429 until its wait ends, then drops its message", async () => {
    vi.useFakeTimers();
    const error = "Too many failed attempts: try again later.";
    fetchMock.mockResolvedValueOnce(jsonResponse(429, { error, retryAfter: 900 }));
    const password = mountComposable(useChangePassword).api;

    expect(await password.change("wrong-password", "new-password")).toBe(false);

    expect(password.changeError.value).toBe(error);
    expect(password.hold.isHeld()).toBe(true);
    expect(password.hold.remaining.value).toBe(900);

    vi.advanceTimersByTime(900_000);
    await nextTick();
    expect(password.hold.isHeld()).toBe(false);
    expect(password.changeError.value).toBe("");
  });
});
