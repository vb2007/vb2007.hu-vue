import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises } from "@vue/test-utils";
import { nextTick } from "vue";
import { SIGNED_LINK_REFRESH_LEAD_MS } from "@/composables/useSignedLinkRefresh";
import { SEARCH_DELAY_MS, useUploads, type UploadListing } from "@/composables/useUploads";
import { Endpoints } from "@/constants/endpoints";
import { deferResponse, jsonResponse, mockFetch } from "@/__tests__/helpers/fetch";
import { mountComposable } from "@/__tests__/helpers/host";
import { anUpload } from "@/__tests__/helpers/uploads";
import type { Upload } from "@/types/api/uploads";

const listing = (uploads: Upload[], { page = 1, pages = 1, total = uploads.length } = {}) =>
  jsonResponse(200, {
    uploads,
    pagination: { limit: 10, page, total, pages, sortBy: "uploadedOn", sortOrder: "desc" }
  });

/** One user's uploads for the admin, as the admin's page builds it. */
const usersUploads = (ownerHint?: string): UploadListing => ({
  endpoint: Endpoints.Admin.userUploads,
  params: { id: "u9" },
  ownerHint
});

const annasListing = () =>
  jsonResponse(200, {
    user: { id: "u9", username: "anna" },
    uploads: [anUpload("a")],
    pagination: { limit: 10, page: 1, total: 1, pages: 1, sortBy: "uploadedOn", sortOrder: "desc" }
  });

const lastUrl = (fetchMock: ReturnType<typeof mockFetch>) =>
  String(fetchMock.mock.calls.at(-1)![0]);

describe("useUploads", () => {
  let fetchMock: ReturnType<typeof mockFetch>;

  beforeEach(() => {
    fetchMock = mockFetch();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("loads the first page, newest first", async () => {
    fetchMock.mockResolvedValueOnce(listing([anUpload("a")]));
    const { api } = mountComposable(() => useUploads());

    const loading = api.load();
    expect(api.isLoading.value).toBe(true);
    await loading;

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.test/uploads?limit=10&page=1&sortBy=uploadedOn&sortOrder=desc",
      { method: "GET", credentials: "include", signal: expect.any(AbortSignal) }
    );
    expect(api.uploads.value).toEqual([anUpload("a")]);
    expect(api.pagination.value?.total).toBe(1);
    expect(api.isLoading.value).toBe(false);
  });

  it("reads another listing, and who its uploads belong to, when given one", async () => {
    fetchMock.mockResolvedValueOnce(annasListing());
    const { api } = mountComposable(() => useUploads(10, usersUploads()));
    expect(api.owner.value).toBeNull();
    expect(api.ownerName.value).toBeUndefined();

    await api.load();

    expect(lastUrl(fetchMock)).toBe(
      "https://api.test/admin/users/u9/uploads?limit=10&page=1&sortBy=uploadedOn&sortOrder=desc"
    );
    expect(api.owner.value).toEqual({ id: "u9", username: "anna" });
    expect(api.ownerName.value).toBe("anna");
  });

  it("names the owner by its hint until the listing names them", async () => {
    fetchMock.mockResolvedValueOnce(annasListing());
    const { api } = mountComposable(() => useUploads(10, usersUploads("ann")));
    expect(api.ownerName.value).toBe("ann");

    await api.load();

    expect(api.ownerName.value).toBe("anna");
  });

  it("says whose uploads failed to load, as best it knows", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(500, undefined, "Server Error"));
    const unnamed = mountComposable(() => useUploads(10, usersUploads())).api;
    await unnamed.load();
    expect(unnamed.errorMessage.value).toBe("Failed to load this user's uploads: Server Error");

    fetchMock
      .mockResolvedValueOnce(jsonResponse(500, undefined, "Server Error"))
      .mockResolvedValueOnce(annasListing())
      .mockResolvedValueOnce(jsonResponse(500, undefined, "Server Error"));
    const hinted = mountComposable(() => useUploads(10, usersUploads("ann"))).api;
    await hinted.load();
    expect(hinted.errorMessage.value).toBe("Failed to load ann's uploads: Server Error");

    // Once the listing has named its owner, that name wins over the hint.
    await hinted.load();
    await hinted.goToPage(2);
    expect(hinted.errorMessage.value).toBe("Failed to load anna's uploads: Server Error");
  });

  it("knows no owner for the user's own uploads", () => {
    const { api } = mountComposable(() => useUploads());

    expect(api.ownerName.value).toBeUndefined();
  });

  it("sends the filter, the trimmed search and the sort, and goes back to page 1", async () => {
    fetchMock.mockResolvedValue(listing([]));
    const { api } = mountComposable(() => useUploads(5));
    await api.goToPage(3);
    expect(lastUrl(fetchMock)).toContain("limit=5&page=3");

    await api.setSort("fileSize", "asc");
    expect(lastUrl(fetchMock)).toBe(
      "https://api.test/uploads?limit=5&page=1&sortBy=fileSize&sortOrder=asc"
    );

    await api.setVisibilityFilter("public");
    expect(lastUrl(fetchMock)).toContain("&visibility=public");

    vi.useFakeTimers();
    api.query.value = "  holiday ";
    await nextTick();
    api.query.value = "  holiday 2 ";
    await nextTick();
    vi.advanceTimersByTime(SEARCH_DELAY_MS - 1);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    vi.advanceTimersByTime(1);
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(lastUrl(fetchMock)).toContain("&visibility=public&q=holiday+2");
  });

  it("doesn't reload for a search the list already shows", async () => {
    fetchMock.mockResolvedValue(listing([]));
    vi.useFakeTimers();
    const { api } = mountComposable(() => useUploads());
    await api.load();

    // Only spaces: the same search as before.
    api.query.value = "  ";
    await nextTick();
    vi.advanceTimersByTime(SEARCH_DELAY_MS);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // A search, then cleared together with a filter change that already reloads without it.
    api.query.value = "x";
    await nextTick();
    vi.advanceTimersByTime(SEARCH_DELAY_MS);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    api.query.value = "";
    await api.setVisibilityFilter("");
    await nextTick();
    vi.advanceTimersByTime(SEARCH_DELAY_MS);

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(lastUrl(fetchMock)).not.toContain("q=");
  });

  it("stops a pending search when unmounted", async () => {
    vi.useFakeTimers();
    const { api, wrapper } = mountComposable(() => useUploads());
    api.query.value = "x";
    await nextTick();
    wrapper.unmount();
    vi.runAllTimers();

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("aborts a load when a newer one starts, and leaves the list to the newer one", async () => {
    deferResponse(fetchMock);
    const newer = deferResponse(fetchMock);
    const { api } = mountComposable(() =>
      useUploads(10, { endpoint: Endpoints.Admin.userUploads, params: { id: "u9" } })
    );

    const older = api.load();
    const pending = api.setVisibilityFilter("private");
    expect(fetchMock.mock.calls[0][1]!.signal!.aborted).toBe(true);
    expect(fetchMock.mock.calls[1][1]!.signal!.aborted).toBe(false);

    await older;
    expect(api.uploads.value).toEqual([]);
    expect(api.owner.value).toBeNull();
    expect(api.errorMessage.value).toBe("");
    expect(api.isLoading.value).toBe(true);

    newer.respond(
      jsonResponse(200, {
        user: { id: "u9", username: "anna" },
        uploads: [anUpload("b")],
        pagination: {
          limit: 10,
          page: 1,
          total: 1,
          pages: 1,
          sortBy: "uploadedOn",
          sortOrder: "desc"
        }
      })
    );
    await pending;
    expect(api.uploads.value).toEqual([anUpload("b")]);
    expect(api.owner.value).toEqual({ id: "u9", username: "anna" });
    expect(api.isLoading.value).toBe(false);
    expect(console.error).not.toHaveBeenCalled();
  });

  it("ignores an older search's answer that arrives after the newer one", async () => {
    const older = deferResponse(fetchMock, { ignoreAbort: true });
    const newer = deferResponse(fetchMock);
    vi.useFakeTimers();
    const { api } = mountComposable(() => useUploads());

    api.query.value = "hol";
    await nextTick();
    vi.advanceTimersByTime(SEARCH_DELAY_MS);
    api.query.value = "holiday";
    await nextTick();
    vi.advanceTimersByTime(SEARCH_DELAY_MS);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(lastUrl(fetchMock)).toContain("&q=holiday");
    vi.useRealTimers();

    newer.respond(listing([anUpload("holiday")]));
    await flushPromises();
    older.respond(listing([anUpload("hol"), anUpload("holly")], { pages: 2, total: 12 }));
    await flushPromises();

    expect(api.uploads.value).toEqual([anUpload("holiday")]);
    expect(api.pagination.value?.total).toBe(1);
    expect(api.errorMessage.value).toBe("");
    expect(api.isLoading.value).toBe(false);
  });

  it("aborts the load in flight when unmounted", async () => {
    deferResponse(fetchMock);
    const { api, wrapper } = mountComposable(() => useUploads());

    const pending = api.load();
    wrapper.unmount();
    await pending;

    expect(fetchMock.mock.calls[0][1]!.signal!.aborted).toBe(true);
    expect(api.errorMessage.value).toBe("");
    expect(console.error).not.toHaveBeenCalled();
  });

  it("shows the API's error when loading fails", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(500, undefined, "Server Error"));
    const { api } = mountComposable(() => useUploads());
    await api.load();

    expect(api.errorMessage.value).toBe("Failed to load your uploads: Server Error");
  });

  it("says when the server can't be reached", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("offline"));
    const { api } = mountComposable(() => useUploads());
    await api.load();

    expect(api.errorMessage.value).toBe("Error connecting to server");
  });

  it("renames an upload and swaps it in place", async () => {
    fetchMock.mockResolvedValueOnce(listing([anUpload("a"), anUpload("b")]));
    const { api } = mountComposable(() => useUploads());
    await api.load();

    let respond!: (response: Response) => void;
    fetchMock.mockReturnValueOnce(new Promise((resolve) => (respond = resolve)));
    const renaming = api.rename("b", "  new name.png ");
    expect(api.busyId.value).toBe("b");
    expect(api.busyAction.value).toBe("rename");
    expect(fetchMock).toHaveBeenLastCalledWith("https://api.test/upload/b", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ originalFileName: "new name.png" }),
      credentials: "include"
    });

    const renamed = anUpload("b", { originalFileName: "new name.png" });
    respond(jsonResponse(200, { message: "Upload updated successfully.", upload: renamed }));
    await expect(renaming).resolves.toBe(true);

    expect(api.uploads.value).toEqual([anUpload("a"), renamed]);
    expect(api.busyId.value).toBe("");
    expect(api.busyAction.value).toBe("");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("changes visibility in place, or reloads when the filter would now hide it", async () => {
    fetchMock.mockResolvedValueOnce(listing([anUpload("a")]));
    const { api } = mountComposable(() => useUploads());
    await api.load();

    const made = anUpload("a", { visibility: "public" });
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { upload: made }));
    await api.setVisibility("a", "public");
    expect(fetchMock.mock.calls[1][1]!.body).toBe(JSON.stringify({ visibility: "public" }));
    expect(api.uploads.value).toEqual([made]);

    // Filtering to public, then making it private again: it no longer belongs, so ask again.
    fetchMock.mockResolvedValueOnce(listing([made]));
    await api.setVisibilityFilter("public");
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, { upload: anUpload("a") }))
      .mockResolvedValueOnce(listing([]));
    await api.setVisibility("a", "private");

    expect(lastUrl(fetchMock)).toContain("visibility=public");
    expect(api.uploads.value).toEqual([]);
  });

  it("keeps a failed edit's message on its row", async () => {
    const { api } = mountComposable(() => useUploads());
    fetchMock.mockResolvedValueOnce(jsonResponse(400, { error: "Invalid name." }));
    await expect(api.rename("a", "x")).resolves.toBe(false);
    expect(api.rowError.value).toEqual({ id: "a", message: "Invalid name." });

    fetchMock.mockResolvedValueOnce(jsonResponse(500, undefined, "Server Error"));
    await api.setVisibility("a", "public");
    expect(api.rowError.value.message).toBe("Failed to change visibility: Server Error");

    fetchMock.mockRejectedValueOnce(new TypeError("offline"));
    await expect(api.remove("b")).resolves.toBe(false);
    expect(api.rowError.value).toEqual({ id: "b", message: "Error connecting to server" });
    expect(api.busyId.value).toBe("");

    fetchMock.mockResolvedValueOnce(jsonResponse(403, undefined, "Forbidden"));
    await api.remove("b");
    expect(api.rowError.value.message).toBe("Failed to delete upload: Forbidden");
  });

  it("deletes an upload and reloads the page", async () => {
    fetchMock.mockResolvedValueOnce(listing([anUpload("a"), anUpload("b")]));
    const { api } = mountComposable(() => useUploads());
    await api.load();

    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, {}))
      .mockResolvedValueOnce(listing([anUpload("b")]));
    await expect(api.remove("a")).resolves.toBe(true);

    expect(fetchMock.mock.calls[1]).toEqual([
      "https://api.test/upload/a",
      { method: "DELETE", credentials: "include" }
    ]);
    expect(api.uploads.value).toEqual([anUpload("b")]);
  });

  describe("signed links", () => {
    const NOW = Date.UTC(2026, 10, 6, 12);
    /** When a list of links signed at `NOW` for an hour is due for new ones. */
    const DUE = 60 * 60_000 - SIGNED_LINK_REFRESH_LEAD_MS;
    const signedFor = (id: string, minutes = 60) =>
      anUpload(id, {
        url: `https://cdn.test/${id}.png?expires=${NOW / 1000 + minutes * 60}&sig=x`
      });

    beforeEach(() => {
      vi.useFakeTimers({ now: NOW });
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("are loaded again before they expire, unless a load is running", async () => {
      fetchMock.mockResolvedValueOnce(
        listing([signedFor("a"), anUpload("b", { visibility: "public" })])
      );
      const { api } = mountComposable(() => useUploads());
      await api.load();

      // The user's own page change is still loading when they're due: it brings new links anyway.
      const pageTwo = deferResponse(fetchMock);
      const paging = api.goToPage(2);
      vi.advanceTimersByTime(DUE);
      expect(fetchMock).toHaveBeenCalledTimes(2);

      pageTwo.respond(listing([signedFor("a")]));
      await paging;
      fetchMock.mockResolvedValueOnce(listing([anUpload("a")]));
      window.dispatchEvent(new Event("focus"));
      await flushPromises();

      expect(fetchMock).toHaveBeenCalledTimes(3);
      expect(lastUrl(fetchMock)).toContain("page=2");
      expect(api.uploads.value).toEqual([anUpload("a")]);
    });

    it("are asked for again on the next focus after a reload that failed", async () => {
      fetchMock.mockResolvedValueOnce(listing([signedFor("a")]));
      const { api } = mountComposable(() => useUploads());
      await api.load();

      // Woken before the network is back: the reload fails and the old links stay.
      fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
      vi.advanceTimersByTime(DUE);
      await flushPromises();
      expect(api.errorMessage.value).not.toBe("");
      expect(api.uploads.value).toEqual([signedFor("a")]);

      fetchMock.mockResolvedValueOnce(listing([signedFor("a", 120)]));
      window.dispatchEvent(new Event("focus"));
      await flushPromises();

      expect(fetchMock).toHaveBeenCalledTimes(3);
      expect(api.errorMessage.value).toBe("");
      expect(api.uploads.value).toEqual([signedFor("a", 120)]);
    });

    it("wait while an edit runs, then catch up", async () => {
      fetchMock.mockResolvedValueOnce(listing([signedFor("a"), signedFor("b", 90)]));
      const { api } = mountComposable(() => useUploads());
      await api.load();

      const renaming = deferResponse(fetchMock);
      const renamed = api.rename("b", "new.png");
      vi.advanceTimersByTime(DUE);
      expect(fetchMock).toHaveBeenCalledTimes(2);

      fetchMock.mockResolvedValueOnce(listing([signedFor("a", 120), signedFor("b", 120)]));
      renaming.respond(jsonResponse(200, { upload: signedFor("b", 120) }));
      await renamed;
      await flushPromises();

      expect(fetchMock).toHaveBeenCalledTimes(3);
      expect(lastUrl(fetchMock)).toContain("/uploads?");
    });
  });

  it("steps back a page after deleting the last upload on it", async () => {
    fetchMock.mockResolvedValueOnce(listing([anUpload("k")], { page: 2, pages: 2, total: 11 }));
    const { api } = mountComposable(() => useUploads());
    await api.goToPage(2);

    fetchMock.mockResolvedValueOnce(jsonResponse(200, {})).mockResolvedValueOnce(listing([]));
    await api.remove("k");

    expect(api.page.value).toBe(1);
    expect(lastUrl(fetchMock)).toContain("page=1");
  });
});
