import { beforeEach, describe, expect, it, vi } from "vitest";
import { jsonResponse, mockFetch } from "@/__tests__/helpers/fetch";
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
    const account = useAccountDelete();

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

    expect(await useAccountDelete().deleteAccount("me")).toBe(true);

    expect(sentBody()).toEqual({ username: "me" });
  });

  it.each([
    [400, "You must provide your password to delete this account."],
    [403, "The provided password is incorrect."],
    [429, "Too many failed attempts: try again later."]
  ])("shows the API's %i and keeps the user logged in", async (status, error) => {
    fetchMock.mockResolvedValueOnce(jsonResponse(status, { error }));
    const account = useAccountDelete();

    expect(await account.deleteAccount("nope")).toBe(false);

    expect(account.deleteError.value).toBe(error);
    expect(isLoggedIn.value).toBe(true);
    expect(account.isDeleting.value).toBe(false);
  });

  it("falls back to the status for a bare server error", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(500, undefined, "Internal Server Error"));
    const account = useAccountDelete();

    expect(await account.deleteAccount("hunter22")).toBe(false);

    expect(account.deleteError.value).toBe("Failed to delete the account: Internal Server Error");
    expect(isLoggedIn.value).toBe(true);
  });

  it("reports an unreachable server", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const account = useAccountDelete();

    expect(await account.deleteAccount("hunter22")).toBe(false);

    expect(account.deleteError.value).toBe("Error connecting to server");
    expect(isLoggedIn.value).toBe(true);
    expect(account.isDeleting.value).toBe(false);
  });
});
