import { nextTick } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { jsonResponse, mockFetch } from "@/__tests__/helpers/fetch";
import { mountComposable } from "@/__tests__/helpers/host";
import { useChangePassword } from "@/composables/useChangePassword";
import { isLoggedIn, pendingEmail, userEmail } from "@/scripts/authentication/authState";

/** `GET /user` after a password change: the API dropped any waiting e-mail change. */
const USER = { email: "vb@example.com", username: "vb", hasPassword: true, pendingEmail: null };
/** The success when a change to new@example.com waited. */
const CANCELLED =
  "Password changed successfully. The change to new@example.com was cancelled, so its code no longer works: get a new one with Change e-mail.";

describe("useChangePassword", () => {
  let fetchMock: ReturnType<typeof mockFetch>;

  beforeEach(() => {
    fetchMock = mockFetch();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("changes the password, keeps the API's message and refreshes the user", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, { message: "Password changed successfully." }))
      .mockResolvedValueOnce(jsonResponse(200, USER));
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
    expect(fetchMock).toHaveBeenNthCalledWith(2, "https://api.test/user", {
      method: "GET",
      credentials: "include"
    });
    expect(password.changed.value).toBe("Password changed successfully.");
    expect(password.changeError.value).toBe("");
    expect(password.isChanging.value).toBe(false);
  });

  it("says a waiting e-mail change was cancelled, as the refresh no longer has it", async () => {
    isLoggedIn.value = true;
    pendingEmail.value = "new@example.com";
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, { message: "Password changed successfully." }))
      .mockResolvedValueOnce(jsonResponse(200, USER));
    const password = mountComposable(useChangePassword).api;

    expect(await password.change("old-password", "new-password")).toBe(true);

    expect(pendingEmail.value).toBe("");
    expect(password.changed.value).toBe(CANCELLED);
  });

  it("drops the waiting e-mail change itself when the refresh fails", async () => {
    isLoggedIn.value = true;
    pendingEmail.value = "new@example.com";
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, { message: "Password changed successfully." }))
      .mockResolvedValueOnce(jsonResponse(500));
    const password = mountComposable(useChangePassword).api;

    expect(await password.change("old-password", "new-password")).toBe(true);

    expect(isLoggedIn.value).toBe(true);
    expect(pendingEmail.value).toBe("");
    expect(password.changed.value).toBe(CANCELLED);
  });

  it("says nothing was cancelled when the change was confirmed elsewhere first", async () => {
    isLoggedIn.value = true;
    userEmail.value = "vb@example.com";
    pendingEmail.value = "new@example.com";
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, { message: "Password changed successfully." }))
      .mockResolvedValueOnce(
        jsonResponse(200, { ...USER, email: "new@example.com", emailVerified: true })
      );
    const password = mountComposable(useChangePassword).api;

    expect(await password.change("old-password", "new-password")).toBe(true);

    expect(userEmail.value).toBe("new@example.com");
    expect(password.changed.value).toBe("Password changed successfully.");
  });

  it("says nothing was cancelled when a change waits again by the refresh", async () => {
    // E.g. another tab asked for a new code between the change and the refresh.
    isLoggedIn.value = true;
    pendingEmail.value = "new@example.com";
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, { message: "Password changed successfully." }))
      .mockResolvedValueOnce(jsonResponse(200, { ...USER, pendingEmail: "newer@example.com" }));
    const password = mountComposable(useChangePassword).api;

    expect(await password.change("old-password", "new-password")).toBe(true);

    expect(pendingEmail.value).toBe("newer@example.com");
    expect(password.changed.value).toBe("Password changed successfully.");
  });

  it("shows the API's refusal, which keeps a waiting e-mail change", async () => {
    isLoggedIn.value = true;
    pendingEmail.value = "new@example.com";
    fetchMock.mockResolvedValueOnce(
      jsonResponse(403, { error: "The provided password is incorrect." })
    );
    const password = mountComposable(useChangePassword).api;

    expect(await password.change("wrong-password", "new-password")).toBe(false);

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(pendingEmail.value).toBe("new@example.com");
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
      .mockResolvedValueOnce(jsonResponse(200, USER))
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
