import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, type VueWrapper } from "@vue/test-utils";
import ShortLinkList from "@/components/features/shorten/ShortLinkList.vue";
import { SEARCH_DELAY_MS } from "@/composables/usePagedList";
import { jsonResponse, mockFetch } from "@/__tests__/helpers/fetch";
import { mountWithRouter } from "@/__tests__/helpers/mount";

const link = (code: string, originalUrl = `https://example.com/${code}`) => ({
  shortenedUrl: code,
  originalUrl,
  addedOn: "2026-10-10T12:00:00.000Z"
});

const listing = (
  links: ReturnType<typeof link>[],
  { page = 1, pages = 1, total = links.length } = {}
) =>
  jsonResponse(200, {
    shortUrls: links,
    pagination: { limit: 10, page, total, pages, sortBy: "addedOn", sortOrder: "desc" }
  });

const buttonNamed = (wrapper: VueWrapper, name: string) =>
  wrapper.findAll("button").find((button) => button.text().startsWith(name))!;

const codes = (wrapper: VueWrapper) => wrapper.findAll(".link__code").map((code) => code.text());

describe("ShortLinkList", () => {
  let fetchMock: ReturnType<typeof mockFetch>;

  beforeEach(() => {
    fetchMock = mockFetch();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("loads the user's links on mount", async () => {
    let respond!: (response: Response) => void;
    fetchMock.mockReturnValueOnce(new Promise((resolve) => (respond = resolve)));
    const { wrapper } = await mountWithRouter(ShortLinkList);

    expect(wrapper.find("h2").text()).toBe("Your links");
    expect(wrapper.find(".note").text()).toBe("Loading your links…");
    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://api.test/shortenUrls?limit=10&page=1&sortBy=addedOn&sortOrder=desc"
    );

    respond(listing([link("abc123", "https://example.com/a/long/path"), link("def456")]));
    await flushPromises();

    expect(wrapper.find(".count").text()).toBe("2 links");
    expect(codes(wrapper)).toEqual(["abc123", "def456"]);
    expect(wrapper.find(".link__code").attributes("href")).toBe("/r/abc123/preview");
    const target = wrapper.find(".link__target");
    expect(target.attributes("title")).toBe("https://example.com/a/long/path");
    expect(target.find(".link__url").text()).toBe("example.com/a/long/path");
    expect(wrapper.find(".link__meta time").attributes("datetime")).toBe(
      "2026-10-10T12:00:00.000Z"
    );
    expect(wrapper.find(".pager").exists()).toBe(false);
  });

  it("says when there are no links yet", async () => {
    fetchMock.mockResolvedValueOnce(listing([]));
    const { wrapper } = await mountWithRouter(ShortLinkList);
    await flushPromises();

    expect(wrapper.find(".count").text()).toBe("0 links");
    expect(wrapper.find(".note").text()).toContain("No short links yet.");
    expect(wrapper.find(".links").exists()).toBe(false);
  });

  it("uses the singular for one link", async () => {
    fetchMock.mockResolvedValueOnce(listing([link("abc123")]));
    const { wrapper } = await mountWithRouter(ShortLinkList);
    await flushPromises();

    expect(wrapper.find(".count").text()).toBe("1 link");
  });

  it("shows the API's error", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(400, { error: "Invalid value for q." }));
    const { wrapper } = await mountWithRouter(ShortLinkList);
    await flushPromises();

    expect(wrapper.find('[role="alert"]').text()).toBe("Invalid value for q.");
    expect(wrapper.find(".count").exists()).toBe(false);
  });

  it("searches the codes and targets once typing pauses, and clears the search", async () => {
    vi.useFakeTimers();
    fetchMock
      .mockResolvedValueOnce(listing([link("abc123"), link("def456")]))
      .mockResolvedValueOnce(listing([]))
      .mockResolvedValueOnce(listing([link("abc123"), link("def456")]));
    const { wrapper } = await mountWithRouter(ShortLinkList);
    await flushPromises();
    const search = wrapper.find('input[type="search"]');
    expect(search.attributes("maxlength")).toBe("100");

    await search.setValue("nothing");
    await vi.advanceTimersByTimeAsync(SEARCH_DELAY_MS);
    await flushPromises();

    expect(fetchMock.mock.calls[1][0]).toContain("q=nothing");
    expect(wrapper.find(".count").text()).toBe("0 links found");
    expect(wrapper.find(".note").text()).toContain("No links match.");

    await buttonNamed(wrapper, "Show all links").trigger("click");
    await vi.advanceTimersByTimeAsync(SEARCH_DELAY_MS);
    await flushPromises();

    expect(fetchMock.mock.calls[2][0]).not.toContain("q=");
    expect(wrapper.find(".count").text()).toBe("2 links");
  });

  it("pages through the links", async () => {
    fetchMock
      .mockResolvedValueOnce(listing([link("abc123")], { pages: 2, total: 11 }))
      .mockResolvedValueOnce(listing([link("old1")], { page: 2, pages: 2, total: 11 }));
    const { wrapper } = await mountWithRouter(ShortLinkList);
    await flushPromises();

    expect(wrapper.find(".pager__label").text()).toBe("Page 1 of 2");
    await buttonNamed(wrapper, "Next").trigger("click");
    await flushPromises();

    expect(fetchMock.mock.calls[1][0]).toContain("page=2");
    expect(codes(wrapper)).toEqual(["old1"]);
  });

  it("copies a link's full address, and says when that fails", async () => {
    fetchMock.mockResolvedValueOnce(listing([link("abc123"), link("def456")]));
    const { wrapper } = await mountWithRouter(ShortLinkList);
    await flushPromises();
    const copyButtons = () =>
      wrapper.findAll(".link__actions button").filter((_, i) => i % 2 === 0);

    expect(copyButtons()[1].text()).toBe("Copy link def456");
    await copyButtons()[1].trigger("click");
    await flushPromises();

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      `${window.location.origin}/r/def456`
    );
    expect(copyButtons().map((button) => button.text())).toEqual([
      "Copy link abc123",
      "Copied def456"
    ]);
    expect(wrapper.find('[role="status"]').text()).toBe("Link copied to clipboard");

    vi.mocked(navigator.clipboard.writeText).mockRejectedValueOnce(new Error("denied"));
    await copyButtons()[0].trigger("click");
    await flushPromises();

    expect(copyButtons().map((button) => button.text())).toEqual([
      "Copy failed abc123",
      "Copy link def456"
    ]);
  });

  it("deletes a link after a second, confirming click", async () => {
    let respond!: (response: Response) => void;
    fetchMock
      .mockResolvedValueOnce(listing([link("abc123"), link("def456")]))
      .mockReturnValueOnce(new Promise((resolve) => (respond = resolve)))
      .mockResolvedValueOnce(listing([link("def456")]));
    const { wrapper } = await mountWithRouter(ShortLinkList);
    await flushPromises();
    const deleteButton = () => wrapper.findAll(".link__actions button")[1];

    expect(deleteButton().text()).toBe("Delete abc123");
    await deleteButton().trigger("click");
    expect(deleteButton().text()).toBe("Confirm delete abc123");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await deleteButton().trigger("click");
    expect(deleteButton().text()).toBe("Deleting abc123");
    expect(fetchMock).toHaveBeenNthCalledWith(2, "https://api.test/shortenUrl/abc123", {
      method: "DELETE",
      credentials: "include"
    });

    respond(jsonResponse(200, { message: "Shortened URL deleted successfully." }));
    await flushPromises();

    expect(codes(wrapper)).toEqual(["def456"]);
  });

  it("shows the API's text when a delete is refused", async () => {
    fetchMock
      .mockResolvedValueOnce(listing([link("abc123")]))
      .mockResolvedValueOnce(
        jsonResponse(403, { error: "You can only delete URLs created with your account." })
      );
    const { wrapper } = await mountWithRouter(ShortLinkList);
    await flushPromises();

    await buttonNamed(wrapper, "Delete").trigger("click");
    await buttonNamed(wrapper, "Confirm delete").trigger("click");
    await flushPromises();

    expect(wrapper.find('[role="alert"]').text()).toBe(
      "You can only delete URLs created with your account."
    );
    expect(codes(wrapper)).toEqual(["abc123"]);
  });

  it("drops a link that was gone already, and says so", async () => {
    fetchMock
      .mockResolvedValueOnce(listing([link("abc123"), link("def456")]))
      .mockResolvedValueOnce(jsonResponse(404, { error: "The shortened URL cannot be found." }))
      .mockResolvedValueOnce(listing([link("def456")]));
    const { wrapper } = await mountWithRouter(ShortLinkList);
    await flushPromises();

    await buttonNamed(wrapper, "Delete").trigger("click");
    await buttonNamed(wrapper, "Confirm delete").trigger("click");
    await flushPromises();

    expect(wrapper.find('[role="alert"]').text()).toBe("The shortened URL cannot be found.");
    expect(codes(wrapper)).toEqual(["def456"]);
  });

  it("refresh reloads the first page", async () => {
    fetchMock
      .mockResolvedValueOnce(listing([link("old1")], { page: 2, pages: 2, total: 11 }))
      .mockResolvedValueOnce(listing([link("new1"), link("abc123")], { pages: 2, total: 12 }));
    const { wrapper } = await mountWithRouter(ShortLinkList);
    await flushPromises();

    await (wrapper.vm as unknown as { refresh: () => Promise<void> }).refresh();
    await flushPromises();

    expect(fetchMock.mock.calls[1][0]).toContain("page=1");
    expect(wrapper.find(".count").text()).toBe("12 links");
  });
});
