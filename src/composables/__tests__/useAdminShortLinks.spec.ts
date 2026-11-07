import { beforeEach, describe, expect, it, vi } from "vitest";
import { jsonResponse, mockFetch } from "@/__tests__/helpers/fetch";
import { ADMIN_SHORT_LINKS_PER_PAGE, useAdminShortLinks } from "@/composables/useAdminShortLinks";

const link = (code: string) => ({
  shortenedUrl: code,
  originalUrl: `https://example.com/${code}`,
  addedOn: "2026-10-10T12:00:00.000Z",
  owner: { id: "u1", username: "anna" }
});

const listing = (links: ReturnType<typeof link>[], page = 1, pages = 1) =>
  jsonResponse(200, {
    shortUrls: links,
    pagination: {
      limit: ADMIN_SHORT_LINKS_PER_PAGE,
      page,
      total: links.length,
      pages,
      sortBy: "addedOn",
      sortOrder: "desc"
    }
  });

describe("useAdminShortLinks", () => {
  let fetchMock: ReturnType<typeof mockFetch>;

  beforeEach(() => {
    fetchMock = mockFetch();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("loads every account's links, newest first", async () => {
    fetchMock.mockResolvedValueOnce(listing([link("abc123")]));
    const list = useAdminShortLinks();

    await list.load();

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.test/admin/short-urls?limit=20&page=1&sortBy=addedOn&sortOrder=desc",
      { method: "GET", credentials: "include", signal: expect.any(AbortSignal) }
    );
    expect(list.links.value).toEqual([link("abc123")]);
    expect(list.sortBy.value).toBe("addedOn");
    expect(list.sortOrder.value).toBe("desc");
  });

  it("falls back to its own text when the list fails", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(500));
    const list = useAdminShortLinks(5);

    await list.load();

    expect(fetchMock.mock.calls[0][0]).toContain("limit=5");
    expect(list.errorMessage.value).toBe("Failed to load the short links: 500");
  });

  it("deletes with the owner's route and steps back a page when its last link goes", async () => {
    fetchMock
      .mockResolvedValueOnce(listing([link("old1")], 2, 2))
      .mockResolvedValueOnce(jsonResponse(200, { message: "Shortened URL deleted successfully." }))
      .mockResolvedValueOnce(listing([link("new1")], 1, 1));
    const list = useAdminShortLinks();
    await list.goToPage(2);

    expect(await list.remove("old1")).toBe(true);

    expect(fetchMock.mock.calls[1]).toEqual([
      "https://api.test/shortenUrl/old1",
      { method: "DELETE", credentials: "include" }
    ]);
    expect(fetchMock.mock.calls[2][0]).toContain("/admin/short-urls?limit=20&page=1");
    expect(list.page.value).toBe(1);
    expect(list.links.value).toEqual([link("new1")]);
    expect(list.isDeleting("old1")).toBe(false);
    expect(list.deleteError.value).toEqual({ code: "", message: "" });
  });

  it("keeps a refused delete with its code until the next load, or until it's cleared", async () => {
    fetchMock
      .mockResolvedValueOnce(listing([link("abc123")]))
      .mockResolvedValueOnce(jsonResponse(500, { error: "Something went wrong." }))
      .mockResolvedValueOnce(listing([link("abc123")]))
      .mockResolvedValueOnce(jsonResponse(500, { error: "Something went wrong." }));
    const list = useAdminShortLinks();
    await list.load();

    expect(await list.remove("abc123")).toBe(false);
    expect(list.deleteError.value).toEqual({ code: "abc123", message: "Something went wrong." });

    await list.load();
    expect(list.deleteError.value).toEqual({ code: "", message: "" });

    await list.remove("abc123");
    list.clearError();
    expect(list.deleteError.value).toEqual({ code: "", message: "" });
  });
});
