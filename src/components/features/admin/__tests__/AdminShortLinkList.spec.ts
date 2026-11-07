import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, type VueWrapper } from "@vue/test-utils";
import AdminShortLinkList from "@/components/features/admin/AdminShortLinkList.vue";
import { SEARCH_DELAY_MS } from "@/composables/usePagedList";
import { jsonResponse, mockFetch } from "@/__tests__/helpers/fetch";
import { mountWithRouter } from "@/__tests__/helpers/mount";
import type { AdminShortUrl } from "@/types/api/admin";

const link = (
  code: string,
  originalUrl = `https://example.com/${code}`,
  owner: AdminShortUrl["owner"] = { id: "u1", username: "anna" }
): AdminShortUrl => ({
  shortenedUrl: code,
  originalUrl,
  addedOn: "2026-10-10T12:00:00.000Z",
  owner
});

const listing = (links: AdminShortUrl[], { page = 1, pages = 1, total = links.length } = {}) =>
  jsonResponse(200, {
    shortUrls: links,
    pagination: { limit: 20, page, total, pages, sortBy: "addedOn", sortOrder: "desc" }
  });

const buttonNamed = (wrapper: VueWrapper, name: string) =>
  wrapper.findAll("button").find((button) => button.text().startsWith(name))!;

const codes = (wrapper: VueWrapper) => wrapper.findAll(".row__code").map((code) => code.text());

const lastUrl = (fetchMock: ReturnType<typeof mockFetch>) => fetchMock.mock.lastCall![0];

describe("AdminShortLinkList", () => {
  let fetchMock: ReturnType<typeof mockFetch>;

  beforeEach(() => {
    fetchMock = mockFetch();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("loads every link on mount, with its target, owner and date", async () => {
    let respond!: (response: Response) => void;
    fetchMock.mockReturnValueOnce(new Promise((resolve) => (respond = resolve)));
    const { wrapper } = await mountWithRouter(AdminShortLinkList);

    expect(wrapper.find("h2").text()).toBe("Short links");
    expect(wrapper.find(".note").text()).toBe("Loading the short links…");
    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://api.test/admin/short-urls?limit=20&page=1&sortBy=addedOn&sortOrder=desc"
    );

    respond(
      listing([
        link("abc123", "https://example.com/a/long/path"),
        link("def456", "ftp://files.example/pub", null)
      ])
    );
    await flushPromises();

    expect(wrapper.find(".count").text()).toBe("2 short links");
    expect(codes(wrapper)).toEqual(["abc123", "def456"]);
    expect(wrapper.find(".row__code").attributes("href")).toBe("/r/abc123/preview");
    const [first, second] = wrapper.findAll(".row");
    expect(first.find(".row__target").attributes("title")).toBe("https://example.com/a/long/path");
    expect(first.find(".row__host").text()).toBe("example.com");
    expect(first.find(".row__url").text()).toBe("example.com/a/long/path");
    expect(first.find(".meta-link").text()).toBe("anna");
    expect(first.find(".meta-link").attributes("href")).toBe("/admin/users/u1");
    expect(first.find(".row__meta time").attributes("datetime")).toBe("2026-10-10T12:00:00.000Z");
    expect(second.find(".row__url").text()).toBe("ftp://files.example/pub");
    expect(second.find(".row__host").text()).toBe("files.example");
    expect(second.find(".meta-link").exists()).toBe(false);
    expect(second.find(".row__gone").text()).toBe("Deleted account");
    expect(wrapper.find(".pager").exists()).toBe(false);
  });

  it("shows a target's hidden characters as escapes", async () => {
    fetchMock.mockResolvedValueOnce(listing([link("abc123", "https://exa‮elpm.com/x y")]));
    const { wrapper } = await mountWithRouter(AdminShortLinkList);
    await flushPromises();

    expect(wrapper.find(".row__host").text()).toBe("exa%E2%80%AEelpm.com");
    expect(wrapper.find(".row__url").text()).toBe("exa%E2%80%AEelpm.com/x%20y");
    // The tooltip too, so the override can't reorder it.
    expect(wrapper.find(".row__target").attributes("title")).toBe(
      "https://exa%E2%80%AEelpm.com/x%20y"
    );
  });

  it("names the host a backslash trick really goes to, after its userinfo", async () => {
    fetchMock.mockResolvedValueOnce(
      listing([
        link("trick", "https://evil.example\\@google.com/login"),
        link("creds", "https://google.com@evil.example/"),
        link("script", "javascript:alert(1)")
      ])
    );
    const { wrapper } = await mountWithRouter(AdminShortLinkList);
    await flushPromises();
    const [trick, creds, script] = wrapper.findAll(".row");

    expect(trick.find(".row__host").text()).toBe("evil.example");
    expect(trick.find(".row__url").text()).toBe("evil.example/@google.com/login");
    expect(creds.find(".row__host").text()).toBe("evil.example");
    expect(creds.find(".row__url").text()).toBe("google.com@evil.example/");
    // No host to stress: the whole address stays in the soft ink.
    expect(script.find(".row__host").exists()).toBe(false);
    expect(script.find(".row__url").text()).toBe("javascript:alert(1)");
  });

  it("says when there are no links yet, and uses the singular for one", async () => {
    fetchMock.mockResolvedValueOnce(listing([]));
    const { wrapper } = await mountWithRouter(AdminShortLinkList, { props: { as: "h1" } });
    await flushPromises();

    expect(wrapper.find("h1").text()).toBe("Short links");
    expect(wrapper.find(".count").text()).toBe("0 short links");
    expect(wrapper.find(".note").text()).toBe("No short links yet.");
    expect(wrapper.find(".rows").exists()).toBe(false);

    fetchMock.mockResolvedValueOnce(listing([link("abc123")]));
    const { wrapper: one } = await mountWithRouter(AdminShortLinkList);
    await flushPromises();
    expect(one.find(".count").text()).toBe("1 short link");
  });

  it("shows the API's error", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(400, { error: "Invalid value for q." }));
    const { wrapper } = await mountWithRouter(AdminShortLinkList);
    await flushPromises();

    expect(wrapper.find('[role="alert"]').text()).toBe("Invalid value for q.");
    expect(wrapper.find(".count").exists()).toBe(false);
  });

  it("searches once typing pauses, and clears the search", async () => {
    vi.useFakeTimers();
    fetchMock
      .mockResolvedValueOnce(listing([link("abc123"), link("def456")]))
      .mockResolvedValueOnce(listing([]))
      .mockResolvedValueOnce(listing([link("abc123"), link("def456")]));
    const { wrapper } = await mountWithRouter(AdminShortLinkList);
    await flushPromises();
    const search = wrapper.find('input[type="search"]');
    expect(search.attributes("maxlength")).toBe("100");

    await search.setValue("nobody");
    await vi.advanceTimersByTimeAsync(SEARCH_DELAY_MS);
    await flushPromises();

    expect(lastUrl(fetchMock)).toContain("q=nobody");
    expect(wrapper.find(".count").text()).toBe("0 short links found");
    expect(wrapper.find(".note").text()).toBe("No code, target or owner matches that search.");

    await buttonNamed(wrapper, "Show every link").trigger("click");
    await vi.advanceTimersByTimeAsync(SEARCH_DELAY_MS);
    await flushPromises();

    expect(lastUrl(fetchMock)).not.toContain("q=");
    expect(wrapper.find(".count").text()).toBe("2 short links");
    vi.useRealTimers();
  });

  it("sorts oldest first", async () => {
    fetchMock.mockResolvedValue(listing([link("abc123")]));
    const { wrapper } = await mountWithRouter(AdminShortLinkList);
    await flushPromises();
    const select = () => wrapper.find("select").element as HTMLSelectElement;
    expect(select().value).toBe("addedOn:desc");

    await wrapper.find("select").setValue("addedOn:asc");
    await flushPromises();

    expect(lastUrl(fetchMock)).toContain("page=1&sortBy=addedOn&sortOrder=asc");
    expect(select().value).toBe("addedOn:asc");
  });

  it("pages through the links", async () => {
    fetchMock
      .mockResolvedValueOnce(listing([link("abc123")], { pages: 2, total: 21 }))
      .mockResolvedValueOnce(listing([link("old1")], { page: 2, pages: 2, total: 21 }));
    const { wrapper } = await mountWithRouter(AdminShortLinkList);
    await flushPromises();

    expect(wrapper.find(".pager__label").text()).toBe("Page 1 of 2");
    await buttonNamed(wrapper, "Next").trigger("click");
    await flushPromises();

    expect(lastUrl(fetchMock)).toContain("page=2");
    expect(codes(wrapper)).toEqual(["old1"]);
  });

  it("deletes a link after a second, confirming click", async () => {
    let respond!: (response: Response) => void;
    fetchMock
      .mockResolvedValueOnce(listing([link("abc123"), link("def456")]))
      .mockReturnValueOnce(new Promise((resolve) => (respond = resolve)))
      .mockResolvedValueOnce(listing([link("def456")]));
    const { wrapper } = await mountWithRouter(AdminShortLinkList);
    await flushPromises();
    const deleteButton = () => wrapper.find("[data-delete]");

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
    expect(wrapper.find('[role="status"]').text()).toBe("Deleted abc123.");
  });

  it("shows a refused delete on its row until the next load", async () => {
    fetchMock
      .mockResolvedValueOnce(listing([link("abc123"), link("def456")], { pages: 2, total: 21 }))
      .mockResolvedValueOnce(jsonResponse(500, { error: "Something went wrong." }))
      .mockResolvedValueOnce(listing([link("old1")], { page: 2, pages: 2, total: 21 }));
    const { wrapper } = await mountWithRouter(AdminShortLinkList);
    await flushPromises();

    await buttonNamed(wrapper, "Delete abc123").trigger("click");
    await buttonNamed(wrapper, "Confirm delete abc123").trigger("click");
    await flushPromises();

    // Still listed, so the refusal shows on its row, next to the key.
    expect(wrapper.findAll('[role="alert"]')).toHaveLength(1);
    expect(wrapper.findAll(".row")[0].find(".row__error").text()).toBe("Something went wrong.");
    expect(codes(wrapper)).toEqual(["abc123", "def456"]);

    await buttonNamed(wrapper, "Next").trigger("click");
    await flushPromises();
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
  });

  it("drops a link that was gone already, and names it above the list", async () => {
    fetchMock
      .mockResolvedValueOnce(listing([link("abc123"), link("def456")]))
      .mockResolvedValueOnce(jsonResponse(404, { error: "The shortened URL cannot be found." }))
      .mockResolvedValueOnce(listing([link("def456")]));
    const { wrapper } = await mountWithRouter(AdminShortLinkList);
    await flushPromises();

    await buttonNamed(wrapper, "Delete abc123").trigger("click");
    await buttonNamed(wrapper, "Confirm delete abc123").trigger("click");
    await flushPromises();

    expect(wrapper.find('[role="alert"]').text()).toBe(
      "abc123: The shortened URL cannot be found."
    );
    expect(wrapper.find(".row__error").exists()).toBe(false);
    expect(codes(wrapper)).toEqual(["def456"]);
    expect(wrapper.find('[role="status"]').text()).toBe("");
  });

  it("deletes two links side by side", async () => {
    let respondFirst!: (response: Response) => void;
    fetchMock
      .mockResolvedValueOnce(listing([link("abc123"), link("def456"), link("ghi789")]))
      .mockReturnValueOnce(new Promise((resolve) => (respondFirst = resolve)))
      .mockResolvedValueOnce(jsonResponse(200, { message: "Shortened URL deleted successfully." }))
      .mockResolvedValueOnce(listing([link("abc123"), link("ghi789")]))
      .mockResolvedValueOnce(listing([link("ghi789")]));
    const { wrapper } = await mountWithRouter(AdminShortLinkList);
    await flushPromises();
    const deleteLabels = () =>
      wrapper.findAll("[data-delete]").map((button) => button.text().split(" ")[0]);

    await buttonNamed(wrapper, "Delete abc123").trigger("click");
    await buttonNamed(wrapper, "Confirm delete abc123").trigger("click");
    await buttonNamed(wrapper, "Delete def456").trigger("click");
    await buttonNamed(wrapper, "Confirm delete def456").trigger("click");
    await flushPromises();

    expect(codes(wrapper)).toEqual(["abc123", "ghi789"]);
    expect(deleteLabels()).toEqual(["Deleting", "Delete"]);

    respondFirst(jsonResponse(200, { message: "Shortened URL deleted successfully." }));
    await flushPromises();

    expect(codes(wrapper)).toEqual(["ghi789"]);
    expect(deleteLabels()).toEqual(["Delete"]);
  });

  describe("after a delete", () => {
    const deleteVia = async (wrapper: VueWrapper, code: string) => {
      await buttonNamed(wrapper, `Delete ${code}`).trigger("click");
      const confirm = buttonNamed(wrapper, `Confirm delete ${code}`);
      (confirm.element as HTMLElement).focus();
      await confirm.trigger("click");
      await flushPromises();
    };
    const ok = () => jsonResponse(200, { message: "Shortened URL deleted successfully." });

    it("focuses the delete key that took the row's place", async () => {
      fetchMock
        .mockResolvedValueOnce(listing([link("abc123"), link("def456")]))
        .mockResolvedValueOnce(ok())
        .mockResolvedValueOnce(listing([link("def456")]));
      const { wrapper } = await mountWithRouter(AdminShortLinkList, { attachTo: document.body });
      await flushPromises();

      await deleteVia(wrapper, "abc123");

      expect(document.activeElement?.textContent).toContain("Delete def456");
      wrapper.unmount();
    });

    it("focuses the row above when the last row went", async () => {
      fetchMock
        .mockResolvedValueOnce(listing([link("abc123"), link("def456")]))
        .mockResolvedValueOnce(ok())
        .mockResolvedValueOnce(listing([link("abc123")]));
      const { wrapper } = await mountWithRouter(AdminShortLinkList, { attachTo: document.body });
      await flushPromises();

      await deleteVia(wrapper, "def456");

      expect(document.activeElement?.textContent).toContain("Delete abc123");
      wrapper.unmount();
    });

    it("focuses the count when no row is left", async () => {
      fetchMock
        .mockResolvedValueOnce(listing([link("abc123")]))
        .mockResolvedValueOnce(ok())
        .mockResolvedValueOnce(listing([]));
      const { wrapper } = await mountWithRouter(AdminShortLinkList, { attachTo: document.body });
      await flushPromises();

      await deleteVia(wrapper, "abc123");

      expect(document.activeElement).toBe(wrapper.find(".count").element);
      expect(wrapper.find(".count").text()).toBe("0 short links");
      wrapper.unmount();
    });

    it("leaves focus alone when it moved on meanwhile", async () => {
      let respond!: (response: Response) => void;
      fetchMock
        .mockResolvedValueOnce(listing([link("abc123"), link("def456")]))
        .mockReturnValueOnce(new Promise((resolve) => (respond = resolve)))
        .mockResolvedValueOnce(listing([link("def456")]));
      const { wrapper } = await mountWithRouter(AdminShortLinkList, { attachTo: document.body });
      await flushPromises();
      const search = wrapper.find('input[type="search"]').element as HTMLInputElement;

      await buttonNamed(wrapper, "Delete abc123").trigger("click");
      await buttonNamed(wrapper, "Confirm delete abc123").trigger("click");
      search.focus();
      respond(ok());
      await flushPromises();

      expect(document.activeElement).toBe(search);
      wrapper.unmount();
    });
  });

  it("offers to try again when the first load fails", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(500))
      .mockResolvedValueOnce(listing([link("abc123")]));
    const { wrapper } = await mountWithRouter(AdminShortLinkList);
    await flushPromises();

    expect(wrapper.find('[role="alert"]').text()).toBe("Failed to load the short links: 500");
    await buttonNamed(wrapper, "Try again").trigger("click");
    await flushPromises();

    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
    expect(buttonNamed(wrapper, "Try again")).toBeUndefined();
    expect(codes(wrapper)).toEqual(["abc123"]);
  });
});
