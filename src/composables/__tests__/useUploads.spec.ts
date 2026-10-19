import { beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";
import { SEARCH_DELAY_MS, useUploads } from "@/composables/useUploads";
import { jsonResponse, mockFetch } from "@/__tests__/helpers/fetch";
import { mountComposable } from "@/__tests__/helpers/host";
import { anUpload } from "@/__tests__/helpers/uploads";
import type { Upload } from "@/scripts/uploads/upload";

const listing = (uploads: Upload[], { page = 1, pages = 1, total = uploads.length } = {}) =>
  jsonResponse(200, {
    uploads,
    pagination: { limit: 10, page, total, pages, sortBy: "uploadedOn", sortOrder: "desc" }
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
      { method: "GET", credentials: "include" }
    );
    expect(api.uploads.value).toEqual([anUpload("a")]);
    expect(api.pagination.value?.total).toBe(1);
    expect(api.isLoading.value).toBe(false);
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

  it("stops a pending search when unmounted", async () => {
    vi.useFakeTimers();
    const { api, wrapper } = mountComposable(() => useUploads());
    api.query.value = "x";
    await nextTick();
    wrapper.unmount();
    vi.runAllTimers();

    expect(fetchMock).not.toHaveBeenCalled();
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
