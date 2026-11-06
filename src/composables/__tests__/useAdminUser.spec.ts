import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAdminUser } from "@/composables/useAdminUser";
import { Messages } from "@/constants/messages";
import { anAdminUser, anAdminUserDetails } from "@/__tests__/helpers/admin";
import { deferResponse, jsonResponse, mockFetch } from "@/__tests__/helpers/fetch";
import { mountComposable } from "@/__tests__/helpers/host";

describe("useAdminUser", () => {
  let fetchMock: ReturnType<typeof mockFetch>;
  let consoleError: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchMock = mockFetch();
    consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("loads the account by its ID", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { user: anAdminUserDetails("a b") }));
    const { api } = mountComposable(() => useAdminUser());

    const loading = api.load("a b");
    expect(api.isLoading.value).toBe(true);
    await loading;

    expect(fetchMock).toHaveBeenCalledWith("https://api.test/admin/users/a%20b", {
      method: "GET",
      credentials: "include",
      signal: expect.any(AbortSignal)
    });
    expect(api.user.value).toEqual(anAdminUserDetails("a b"));
    expect(api.errorMessage.value).toBe("");
    expect(api.isLoading.value).toBe(false);
  });

  it.each([
    [400, "Invalid ID format: must be a 24 character HEX string.", Messages.Admin.userInvalidId],
    [404, "There is no such user with that ID.", Messages.Admin.userNotFound]
  ])("says what a %i means, without logging it", async (status, error, message) => {
    fetchMock.mockResolvedValueOnce(jsonResponse(status, { error }));
    const { api } = mountComposable(() => useAdminUser());

    await api.load("a");

    expect(api.user.value).toBeNull();
    expect(api.errorMessage.value).toBe(message);
    expect(api.isLoading.value).toBe(false);
    expect(consoleError).not.toHaveBeenCalled();
  });

  it("shows other failures as the API or the client words them", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(500, undefined, "Server Error"));
    const { api } = mountComposable(() => useAdminUser());

    await api.load("a");

    expect(api.errorMessage.value).toBe(`${Messages.Admin.userFailed}: Server Error`);
    expect(consoleError).toHaveBeenCalled();
  });

  it("drops an earlier account's answer once another one is asked for", async () => {
    const first = deferResponse(fetchMock);
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { user: anAdminUserDetails("b") }));
    const { api } = mountComposable(() => useAdminUser());

    const loadingA = api.load("a");
    await api.load("b");
    first.respond(jsonResponse(200, { user: anAdminUserDetails("a") }));
    await loadingA;

    expect(api.user.value?.id).toBe("b");
    expect(api.isLoading.value).toBe(false);
  });

  it("sets a quota and keeps the details the answer doesn't carry", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { user: anAdminUserDetails("a", { githubLogin: "octo" }) })
    );
    const { api } = mountComposable(() => useAdminUser());
    await api.load("a");

    const updated = anAdminUser("a", { uploads: { quotaBytes: 5, hasCustomQuota: true } });
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { user: updated }));
    const saving = api.setQuota("a", 5);
    expect(api.isSavingQuota.value).toBe(true);

    expect(await saving).toBe(true);
    expect(fetchMock).toHaveBeenLastCalledWith("https://api.test/admin/users/a/upload-quota", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quotaBytes: 5 }),
      credentials: "include"
    });
    expect(api.user.value).toEqual({
      ...anAdminUserDetails("a", { githubLogin: "octo" }),
      uploads: updated.uploads
    });
    expect(api.isSavingQuota.value).toBe(false);
  });

  it("keeps a failed quota save to show it, until the next load", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(400, { error: "Invalid quota." }));
    const { api } = mountComposable(() => useAdminUser());

    expect(await api.setQuota("a", -1)).toBe(false);
    expect(api.quotaError.value).toBe("Invalid quota.");
    expect(api.isSavingQuota.value).toBe(false);

    fetchMock.mockResolvedValueOnce(jsonResponse(200, { user: anAdminUserDetails("a") }));
    await api.load("a");
    expect(api.quotaError.value).toBe("");
  });

  it("only takes an answer about the account on show", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { user: anAdminUserDetails("a") }));
    const { api } = mountComposable(() => useAdminUser());
    await api.load("a");

    api.applyUser(anAdminUser("b", { username: "someone-else" }));
    expect(api.user.value?.username).toBe("user-a");

    api.applyUser(anAdminUser("a", { username: "renamed" }));
    expect(api.user.value).toEqual({ ...anAdminUserDetails("a"), username: "renamed" });
  });
});
