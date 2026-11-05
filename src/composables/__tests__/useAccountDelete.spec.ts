import { nextTick } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { jsonResponse, mockFetch } from "@/__tests__/helpers/fetch";
import { mountComposable } from "@/__tests__/helpers/host";
import { useAccountDelete } from "@/composables/useAccountDelete";
import { hasPassword, isLoggedIn, username } from "@/scripts/authentication/authState";

describe("useAccountDelete", () => {
  let fetchMock: ReturnType<typeof mockFetch>;

  beforeEach(() => {
    fetchMock = mockFetch();
    vi.spyOn(console, "error").mockImplementation(() => {});
    isLoggedIn.value = true;
    username.value = "me";
    hasPassword.value = true;
  });

  const sentBody = () => JSON.parse(fetchMock.mock.calls[0][1]!.body as string);

  it("deletes an account with its password", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { message: "User deleted successfully." }));
    const account = mountComposable(useAccountDelete).api;

    const pending = account.deleteAccount("hunter22");
    expect(account.isDeleting.value).toBe(true);

    expect(await pending).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith("https://api.test/user", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: "hunter22" }),
      credentials: "include"
    });
    expect(account.deleteError.value).toBe("");
    expect(account.isDeleting.value).toBe(false);
  });

  it("confirms an account made with GitHub with its username", async () => {
    hasPassword.value = false;
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { message: "User deleted successfully." }));

    expect(await mountComposable(useAccountDelete).api.deleteAccount("me")).toBe(true);

    expect(sentBody()).toEqual({ username: "me" });
  });

  it.each([
    [400, "You must provide your password to delete this account."],
    [403, "The provided password is incorrect."],
    [429, "Too many failed attempts: try again later."]
  ])("shows the API's %i and keeps the user logged in", async (status, error) => {
    fetchMock.mockResolvedValueOnce(jsonResponse(status, { error }));
    const account = mountComposable(useAccountDelete).api;

    expect(await account.deleteAccount("nope")).toBe(false);

    expect(account.deleteError.value).toBe(error);
    expect(isLoggedIn.value).toBe(true);
    expect(account.isDeleting.value).toBe(false);
  });

  it("holds deleting after the password checks' 429 until its wait ends, then drops its message", async () => {
    vi.useFakeTimers();
    const error = "Too many failed attempts: try again later.";
    fetchMock.mockResolvedValueOnce(jsonResponse(429, { error, retryAfter: 900 }));
    const account = mountComposable(useAccountDelete).api;

    await account.deleteAccount("nope");

    expect(account.hold.isHeld()).toBe(true);
    expect(account.hold.remaining.value).toBe(900);
    vi.advanceTimersByTime(900_000);
    await nextTick();
    expect(account.hold.isHeld()).toBe(false);
    expect(account.deleteError.value).toBe("");
  });

  it("doesn't hold deleting after any other refusal", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(403, { error: "Wrong." }));
    const account = mountComposable(useAccountDelete).api;

    await account.deleteAccount("nope");

    expect(account.hold.isHeld()).toBe(false);
  });

  const REAUTH =
    "Confirm it's you first: log in with GitHub again (or relink it), then delete the account within 10 minutes.";

  it("asks an account made with GitHub to confirm it with GitHub first", async () => {
    hasPassword.value = false;
    fetchMock.mockResolvedValueOnce(jsonResponse(403, { error: REAUTH }));
    const account = mountComposable(useAccountDelete).api;

    expect(await account.deleteAccount("me")).toBe(false);

    expect(sentBody()).toEqual({ username: "me" });
    expect(account.needsGithub.value).toBe(true);
    expect(account.deleteError.value).toBe(REAUTH);
    expect(isLoggedIn.value).toBe(true);
  });

  it.each([
    ["a wrong username", false, "The provided username doesn't match this account."],
    ["an ended session", false, "You must be logged in to perform this action."],
    ["an account with a password", true, REAUTH]
  ])("keeps any other 403 an error: %s", async (_name, withPassword, error) => {
    hasPassword.value = withPassword;
    fetchMock.mockResolvedValueOnce(jsonResponse(403, { error }));
    const account = mountComposable(useAccountDelete).api;

    expect(await account.deleteAccount("me")).toBe(false);

    expect(account.needsGithub.value).toBe(false);
    expect(account.deleteError.value).toBe(error);
  });

  it("doesn't take the confirmation's text from another status for one", async () => {
    hasPassword.value = false;
    fetchMock.mockResolvedValueOnce(jsonResponse(400, { error: REAUTH }));
    const account = mountComposable(useAccountDelete).api;

    await account.deleteAccount("me");

    expect(account.needsGithub.value).toBe(false);
  });

  it("asks again with each try", async () => {
    hasPassword.value = false;
    fetchMock
      .mockResolvedValueOnce(jsonResponse(403, { error: REAUTH }))
      .mockResolvedValueOnce(jsonResponse(200, { message: "User deleted successfully." }));
    const account = mountComposable(useAccountDelete).api;
    await account.deleteAccount("me");

    const pending = account.deleteAccount("me");
    expect(account.needsGithub.value).toBe(false);

    expect(await pending).toBe(true);
    expect(account.deleteError.value).toBe("");
  });

  it("falls back to the status for a bare server error", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(500, undefined, "Internal Server Error"));
    const account = mountComposable(useAccountDelete).api;

    expect(await account.deleteAccount("hunter22")).toBe(false);

    expect(account.deleteError.value).toBe("Failed to delete the account: Internal Server Error");
    expect(isLoggedIn.value).toBe(true);
  });

  it("reports an unreachable server", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const account = mountComposable(useAccountDelete).api;

    expect(await account.deleteAccount("hunter22")).toBe(false);

    expect(account.deleteError.value).toBe("Error connecting to server");
    expect(isLoggedIn.value).toBe(true);
    expect(account.isDeleting.value).toBe(false);
  });
});
