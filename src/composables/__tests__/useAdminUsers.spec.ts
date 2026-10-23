import { beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";
import { SEARCH_DELAY_MS, useAdminUsers } from "@/composables/useAdminUsers";
import type { AdminUser } from "@/scripts/admin/adminUser";
import { anAdminUser } from "@/__tests__/helpers/admin";
import { jsonResponse, mockFetch } from "@/__tests__/helpers/fetch";
import { mountComposable } from "@/__tests__/helpers/host";

const listing = (users: AdminUser[], { page = 1, pages = 1, total = users.length } = {}) =>
  jsonResponse(200, {
    users,
    pagination: { limit: 20, page, total, pages, sortBy: "usedBytes", sortOrder: "desc" }
  });

const lastUrl = (fetchMock: ReturnType<typeof mockFetch>) =>
  String(fetchMock.mock.calls.at(-1)![0]);

describe("useAdminUsers", () => {
  let fetchMock: ReturnType<typeof mockFetch>;

  beforeEach(() => {
    fetchMock = mockFetch();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("loads the first page, most storage used first", async () => {
    fetchMock.mockResolvedValueOnce(listing([anAdminUser("a")]));
    const { api } = mountComposable(() => useAdminUsers());

    const loading = api.load();
    expect(api.isLoading.value).toBe(true);
    await loading;

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.test/admin/users?limit=20&page=1&sortBy=usedBytes&sortOrder=desc",
      { method: "GET", credentials: "include" }
    );
    expect(api.users.value).toEqual([anAdminUser("a")]);
    expect(api.pagination.value?.total).toBe(1);
    expect(api.isLoading.value).toBe(false);
  });

  it("sends the sort and the trimmed search, and goes back to page 1", async () => {
    fetchMock.mockResolvedValue(listing([]));
    const { api } = mountComposable(() => useAdminUsers(5));
    await api.goToPage(3);
    expect(lastUrl(fetchMock)).toContain("limit=5&page=3");

    await api.setSort("username", "asc");
    expect(lastUrl(fetchMock)).toBe(
      "https://api.test/admin/users?limit=5&page=1&sortBy=username&sortOrder=asc"
    );

    vi.useFakeTimers();
    api.query.value = " ann";
    await nextTick();
    api.query.value = " anna ";
    await nextTick();
    vi.advanceTimersByTime(SEARCH_DELAY_MS - 1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(1);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(lastUrl(fetchMock)).toContain("&q=anna");

    // Only spaces changed: the list already shows that search.
    api.query.value = "anna  ";
    await nextTick();
    vi.advanceTimersByTime(SEARCH_DELAY_MS);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("stops a pending search when it goes away", async () => {
    vi.useFakeTimers();
    const { api, wrapper } = mountComposable(() => useAdminUsers());
    api.query.value = "anna";
    await nextTick();
    wrapper.unmount();
    vi.advanceTimersByTime(SEARCH_DELAY_MS);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows the API's error, or a connection error", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(403, { error: "You do not have permission to perform this action." })
    );
    const { api } = mountComposable(() => useAdminUsers());
    await api.load();
    expect(api.errorMessage.value).toBe("You do not have permission to perform this action.");

    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await api.load();
    expect(api.errorMessage.value).toBe("Error connecting to server");
    expect(api.isLoading.value).toBe(false);
  });

  it("sets a quota and swaps the updated user in place", async () => {
    fetchMock.mockResolvedValueOnce(listing([anAdminUser("a"), anAdminUser("b")]));
    const { api } = mountComposable(() => useAdminUsers());
    await api.load();

    const updated = anAdminUser("b", { uploads: { quotaBytes: 5, hasCustomQuota: true } });
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { user: updated }));
    const saving = api.setQuota("b", 5);
    expect(api.savingId.value).toBe("b");

    expect(await saving).toBe(true);
    expect(fetchMock).toHaveBeenLastCalledWith("https://api.test/admin/users/b/upload-quota", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quotaBytes: 5 }),
      credentials: "include"
    });
    expect(api.users.value).toEqual([anAdminUser("a"), updated]);
    expect(api.savingId.value).toBe("");
  });

  it("resets a quota to the default with null", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { user: anAdminUser("a") }));
    const { api } = mountComposable(() => useAdminUsers());

    await api.setQuota("a", null);

    expect(fetchMock.mock.calls[0][1]!.body).toBe(JSON.stringify({ quotaBytes: null }));
  });

  it("keeps a failed save on its row", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(400, { error: "Invalid quota." }));
    const { api } = mountComposable(() => useAdminUsers());

    expect(await api.setQuota("a", -1)).toBe(false);
    expect(api.rowError.value).toEqual({ id: "a", message: "Invalid quota." });

    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    expect(await api.setQuota("b", 1)).toBe(false);
    expect(api.rowError.value).toEqual({ id: "b", message: "Error connecting to server" });
    expect(api.savingId.value).toBe("");
  });
});
