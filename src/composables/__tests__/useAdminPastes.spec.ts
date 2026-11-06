import { beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";
import { useAdminPastes } from "@/composables/useAdminPastes";
import { SEARCH_DELAY_MS } from "@/composables/usePagedList";
import type { AdminPaste } from "@/types/api/admin";
import { jsonResponse, mockFetch } from "@/__tests__/helpers/fetch";
import { mountComposable } from "@/__tests__/helpers/host";

const aPaste = (id: string): AdminPaste => ({
  id,
  language: "typescript",
  preview: "const answer = 42;",
  addedOn: "2026-10-10T12:00:00.000Z",
  owner: { id: "u1", username: "anna" }
});

const listing = (pastes: AdminPaste[], { page = 1, pages = 1, total = pastes.length } = {}) =>
  jsonResponse(200, {
    pastes,
    pagination: { limit: 20, page, total, pages, sortBy: "addedOn", sortOrder: "desc" }
  });

const listUrl = (query: string) => `https://api.test/admin/pastes?${query}`;

const lastUrl = (fetchMock: ReturnType<typeof mockFetch>) =>
  String(fetchMock.mock.calls.at(-1)![0]);

describe("useAdminPastes", () => {
  let fetchMock: ReturnType<typeof mockFetch>;

  beforeEach(() => {
    fetchMock = mockFetch();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("loads the first page, newest first", async () => {
    fetchMock.mockResolvedValueOnce(listing([aPaste("p1")]));
    const { api } = mountComposable(() => useAdminPastes());

    await api.load();

    expect(fetchMock).toHaveBeenCalledWith(
      listUrl("limit=20&page=1&sortBy=addedOn&sortOrder=desc"),
      { method: "GET", credentials: "include", signal: expect.any(AbortSignal) }
    );
    expect(api.pastes.value).toEqual([aPaste("p1")]);
    expect(api.pagination.value?.total).toBe(1);
  });

  it("sends the order and the trimmed search, from page 1", async () => {
    fetchMock.mockResolvedValue(listing([]));
    const { api } = mountComposable(() => useAdminPastes(5));
    await api.goToPage(2);

    await api.setSort("addedOn", "asc");
    expect(lastUrl(fetchMock)).toBe(listUrl("limit=5&page=1&sortBy=addedOn&sortOrder=asc"));

    vi.useFakeTimers();
    api.query.value = " python ";
    await nextTick();
    vi.advanceTimersByTime(SEARCH_DELAY_MS);
    expect(lastUrl(fetchMock)).toBe(
      listUrl("limit=5&page=1&sortBy=addedOn&sortOrder=asc&q=python")
    );
  });

  it("says when the list fails to load", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const { api } = mountComposable(() => useAdminPastes());

    await api.load();

    expect(api.errorMessage.value).toBe("Error connecting to server");
  });

  it("deletes a paste with the paste's own route and reloads the page", async () => {
    let respond!: (response: Response) => void;
    fetchMock
      .mockReturnValueOnce(new Promise((resolve) => (respond = resolve)))
      .mockResolvedValueOnce(listing([aPaste("p2")]));
    const { api } = mountComposable(() => useAdminPastes());
    api.pastes.value = [aPaste("p1"), aPaste("p2")];

    const pending = api.remove("p1");
    expect(api.deletingId.value).toBe("p1");
    respond(jsonResponse(200, { message: "Paste deleted successfully.", paste: { id: "p1" } }));
    await pending;

    expect(fetchMock).toHaveBeenNthCalledWith(1, "https://api.test/paste/p1", {
      method: "DELETE",
      credentials: "include"
    });
    expect(fetchMock.mock.calls[1][0]).toBe(
      listUrl("limit=20&page=1&sortBy=addedOn&sortOrder=desc")
    );
    expect(api.pastes.value).toEqual([aPaste("p2")]);
    expect(api.deletingId.value).toBe("");
  });

  it("steps back a page after deleting the last paste on it", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, { message: "Paste deleted successfully." }))
      .mockResolvedValueOnce(listing([aPaste("p1")], { pages: 1 }));
    const { api } = mountComposable(() => useAdminPastes());
    api.page.value = 3;
    api.pastes.value = [aPaste("p41")];

    await api.remove("p41");

    expect(api.page.value).toBe(2);
    expect(lastUrl(fetchMock)).toBe(listUrl("limit=20&page=2&sortBy=addedOn&sortOrder=desc"));
  });

  it("drops a paste that was already gone by reloading, without an error", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(404, { error: "There is no such paste with that ID." }))
      .mockResolvedValueOnce(listing([aPaste("p2")]));
    const { api } = mountComposable(() => useAdminPastes());
    api.pastes.value = [aPaste("p1"), aPaste("p2")];

    await api.remove("p1");

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(api.pastes.value).toEqual([aPaste("p2")]);
    expect(api.rowError.value).toEqual({ id: "", message: "" });
    expect(console.error).not.toHaveBeenCalled();
  });

  it("keeps a failed delete's message on its row until the next delete", async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse(403, { error: "You do not have permission to perform this action." })
      )
      .mockResolvedValueOnce(jsonResponse(200, { message: "Paste deleted successfully." }))
      .mockResolvedValueOnce(listing([]));
    const { api } = mountComposable(() => useAdminPastes());

    await api.remove("p1");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(api.rowError.value).toEqual({
      id: "p1",
      message: "You do not have permission to perform this action."
    });
    expect(api.deletingId.value).toBe("");

    await api.remove("p1");
    expect(api.rowError.value).toEqual({ id: "", message: "" });
  });
});
