import { beforeEach, describe, expect, it, vi } from "vitest";
import { jsonResponse, mockFetch } from "@/__tests__/helpers/fetch";
import { SEARCH_DELAY_MS } from "@/composables/usePagedList";
import { SHORT_LINKS_PER_PAGE, useShortLinks } from "@/composables/useShortLinks";

const link = (code: string) => ({
  shortenedUrl: code,
  originalUrl: `https://example.com/${code}`,
  addedOn: "2026-10-10T12:00:00.000Z"
});

const listing = (links: ReturnType<typeof link>[], page = 1, pages = 1) =>
  jsonResponse(200, {
    shortUrls: links,
    pagination: {
      limit: SHORT_LINKS_PER_PAGE,
      page,
      total: links.length,
      pages,
      sortBy: "addedOn",
      sortOrder: "desc"
    }
  });

describe("useShortLinks", () => {
  let fetchMock: ReturnType<typeof mockFetch>;

  beforeEach(() => {
    fetchMock = mockFetch();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("loads the user's newest links first", async () => {
    fetchMock.mockResolvedValueOnce(listing([link("abc123")]));
    const list = useShortLinks();

    await list.load();

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.test/shortenUrls?limit=10&page=1&sortBy=addedOn&sortOrder=desc",
      { method: "GET", credentials: "include", signal: expect.any(AbortSignal) }
    );
    expect(list.links.value).toEqual([link("abc123")]);
    expect(list.pagination.value).toMatchObject({ page: 1, pages: 1, total: 1 });
  });

  it("falls back to its own text when the list fails", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(500));
    const list = useShortLinks(5);

    await list.load();

    expect(fetchMock.mock.calls[0][0]).toContain("limit=5");
    expect(list.errorMessage.value).toBe("Failed to load your short links: 500");
  });

  it("refresh drops the search and loads page 1 once", async () => {
    vi.useFakeTimers();
    fetchMock
      .mockResolvedValueOnce(listing([link("abc123")], 2, 2))
      .mockResolvedValueOnce(listing([link("new1"), link("abc123")]));
    const list = useShortLinks();
    list.query.value = "abc";
    await list.goToPage(2);

    await list.refresh();
    await vi.advanceTimersByTimeAsync(SEARCH_DELAY_MS);

    expect(list.query.value).toBe("");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][0]).toBe(
      "https://api.test/shortenUrls?limit=10&page=1&sortBy=addedOn&sortOrder=desc"
    );
  });

  it("forgets a failed delete at the next load", async () => {
    fetchMock
      .mockResolvedValueOnce(listing([link("abc123")]))
      .mockResolvedValueOnce(
        jsonResponse(403, { error: "You can only delete URLs created with your account." })
      )
      .mockResolvedValueOnce(listing([link("abc123")]));
    const list = useShortLinks();
    await list.load();

    await list.remove("abc123");
    expect(list.deleteError.value.code).toBe("abc123");

    await list.load();
    expect(list.deleteError.value).toEqual({ code: "", message: "" });
  });

  it("steps back a page when deleting its last link", async () => {
    fetchMock
      .mockResolvedValueOnce(listing([link("old1")], 2, 2))
      .mockResolvedValueOnce(jsonResponse(200, { message: "Shortened URL deleted successfully." }))
      .mockResolvedValueOnce(listing([link("new1")], 1, 1));
    const list = useShortLinks();
    await list.goToPage(2);

    expect(await list.remove("old1")).toBe(true);

    expect(fetchMock.mock.calls[1][0]).toBe("https://api.test/shortenUrl/old1");
    expect(fetchMock.mock.calls[2][0]).toContain("page=1");
    expect(list.page.value).toBe(1);
    expect(list.links.value).toEqual([link("new1")]);
  });
});
