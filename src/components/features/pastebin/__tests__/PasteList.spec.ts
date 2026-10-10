import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, type VueWrapper } from "@vue/test-utils";
import PasteList from "@/components/features/pastebin/PasteList.vue";
import { username } from "@/scripts/authentication/authState";
import { jsonResponse, mockFetch } from "@/__tests__/helpers/fetch";
import { mountWithRouter } from "@/__tests__/helpers/mount";

const paste = (id: string, content = `paste ${id}\nmore`) => ({
  _id: id,
  content,
  addedBy: { _id: "u1", username: "me" },
  addedOn: "2026-10-10T12:00:00.000Z"
});

const listing = (
  pastes: ReturnType<typeof paste>[],
  { page = 1, pages = 1, total = pastes.length } = {}
) =>
  jsonResponse(200, {
    pastes,
    pagination: { limit: 10, page, total, pages, sortBy: "addedOn", sortOrder: "desc" }
  });

const buttonNamed = (wrapper: VueWrapper, name: string) =>
  wrapper.findAll("button").find((button) => button.text().includes(name))!;

describe("PasteList", () => {
  let fetchMock: ReturnType<typeof mockFetch>;

  beforeEach(() => {
    fetchMock = mockFetch();
    vi.spyOn(console, "error").mockImplementation(() => {});
    username.value = "me";
  });

  afterEach(() => {
    username.value = "";
  });

  it("loads the user's pastes on mount", async () => {
    let respond!: (response: Response) => void;
    fetchMock.mockReturnValueOnce(new Promise((resolve) => (respond = resolve)));
    const { wrapper } = await mountWithRouter(PasteList);

    expect(wrapper.find("h2").text()).toBe("Your pastes");
    expect(wrapper.find(".note").text()).toBe("Loading your pastes…");
    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://api.test/pastes/me?limit=10&page=1&sortBy=addedOn&sortOrder=desc"
    );

    respond(listing([paste("p1"), paste("p2", "\n  indented first line")]));
    await flushPromises();

    expect(wrapper.find(".toolbar__count").text()).toBe("2 pastes");
    const links = wrapper.findAll(".paste__preview");
    expect(links.map((link) => link.text())).toEqual(["paste p1", "indented first line"]);
    expect(links[0].attributes("href")).toBe("/pastebin/p1");
    expect(wrapper.find(".paste__date").attributes("datetime")).toBe("2026-10-10T12:00:00.000Z");
    expect(wrapper.find(".pager").exists()).toBe(false);
  });

  it("says when there are no pastes yet", async () => {
    fetchMock.mockResolvedValueOnce(listing([]));
    const { wrapper } = await mountWithRouter(PasteList);
    await flushPromises();

    expect(wrapper.find(".toolbar__count").text()).toBe("0 pastes");
    expect(wrapper.find(".note").text()).toContain("No pastes yet.");
    expect(wrapper.find(".pastes").exists()).toBe(false);
  });

  it("uses the singular for one paste and hides the sort toggle", async () => {
    fetchMock.mockResolvedValueOnce(listing([paste("p1")]));
    const { wrapper } = await mountWithRouter(PasteList);
    await flushPromises();

    expect(wrapper.find(".toolbar__count").text()).toBe("1 paste");
    expect(wrapper.find(".toolbar button").exists()).toBe(false);
  });

  it("shows the API's error", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(404, { error: "There is no such user with that username." })
    );
    const { wrapper } = await mountWithRouter(PasteList);
    await flushPromises();

    expect(wrapper.find('[role="alert"]').text()).toBe("There is no such user with that username.");
    expect(wrapper.find(".toolbar").exists()).toBe(false);
  });

  it("toggles between newest and oldest first", async () => {
    fetchMock
      .mockResolvedValueOnce(listing([paste("p2"), paste("p1")]))
      .mockResolvedValueOnce(listing([paste("p1"), paste("p2")]))
      .mockResolvedValueOnce(listing([paste("p2"), paste("p1")]));
    const { wrapper } = await mountWithRouter(PasteList);
    await flushPromises();
    const toggle = () => wrapper.find(".toolbar button");
    expect(toggle().text()).toBe("Sort: Newest first");

    await toggle().trigger("click");
    await flushPromises();

    expect(fetchMock.mock.calls[1][0]).toContain("sortOrder=asc");
    expect(toggle().text()).toBe("Sort: Oldest first");

    await toggle().trigger("click");
    await flushPromises();

    expect(fetchMock.mock.calls[2][0]).toContain("sortOrder=desc");
  });

  it("pages through the pastes", async () => {
    fetchMock
      .mockResolvedValueOnce(listing([paste("p1")], { pages: 2, total: 11 }))
      .mockResolvedValueOnce(listing([paste("p11")], { page: 2, pages: 2, total: 11 }))
      .mockResolvedValueOnce(listing([paste("p1")], { pages: 2, total: 11 }));
    const { wrapper } = await mountWithRouter(PasteList);
    await flushPromises();
    const previous = () => buttonNamed(wrapper, "Previous");
    const next = () => buttonNamed(wrapper, "Next");

    expect(wrapper.find(".pager__label").text()).toBe("Page 1 of 2");
    expect(previous().attributes("disabled")).toBeDefined();
    expect(next().attributes("disabled")).toBeUndefined();

    await next().trigger("click");
    await flushPromises();

    expect(fetchMock.mock.calls[1][0]).toContain("page=2");
    expect(wrapper.find(".pager__label").text()).toBe("Page 2 of 2");
    expect(next().attributes("disabled")).toBeDefined();

    await previous().trigger("click");
    await flushPromises();

    expect(fetchMock.mock.calls[2][0]).toContain("page=1");
  });

  it("copies a paste's link", async () => {
    fetchMock.mockResolvedValueOnce(listing([paste("p1"), paste("p2")]));
    const { wrapper } = await mountWithRouter(PasteList);
    await flushPromises();
    const copyButtons = () =>
      wrapper.findAll(".paste__actions button").filter((_, i) => i % 2 === 0);

    await copyButtons()[1].trigger("click");
    await flushPromises();

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      `${window.location.origin}/pastebin/p2`
    );
    expect(copyButtons().map((button) => button.text())).toEqual(["Copy link", "Copied"]);
    expect(wrapper.find('[role="status"]').text()).toBe("Link copied to clipboard");
  });

  it("says so when copying a link fails", async () => {
    vi.mocked(navigator.clipboard.writeText).mockRejectedValueOnce(new Error("denied"));
    fetchMock.mockResolvedValueOnce(listing([paste("p1")]));
    const { wrapper } = await mountWithRouter(PasteList);
    await flushPromises();

    await buttonNamed(wrapper, "Copy link").trigger("click");
    await flushPromises();

    expect(wrapper.find(".paste__actions button").text()).toBe("Copy failed");
  });

  it("deletes a paste after a second, confirming click", async () => {
    let respond!: (response: Response) => void;
    fetchMock
      .mockResolvedValueOnce(listing([paste("p1"), paste("p2")]))
      .mockReturnValueOnce(new Promise((resolve) => (respond = resolve)))
      .mockResolvedValueOnce(listing([paste("p2")]));
    const { wrapper } = await mountWithRouter(PasteList);
    await flushPromises();
    const deleteButton = () => wrapper.findAll(".paste__actions button")[1];

    await deleteButton().trigger("click");
    expect(deleteButton().text()).toBe("Confirm delete");
    expect(deleteButton().classes()).toContain("btn--error");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await deleteButton().trigger("click");
    expect(deleteButton().text()).toBe("Deleting");
    expect(fetchMock).toHaveBeenNthCalledWith(2, "https://api.test/paste/p1", {
      method: "DELETE",
      credentials: "include"
    });

    respond(jsonResponse(200, {}));
    await flushPromises();

    expect(wrapper.findAll(".paste__preview").map((link) => link.text())).toEqual(["paste p2"]);
  });

  it("arms only one delete at a time and disarms after a while", async () => {
    vi.useFakeTimers();
    fetchMock.mockResolvedValueOnce(listing([paste("p1"), paste("p2")]));
    const { wrapper } = await mountWithRouter(PasteList);
    await flushPromises();
    const deleteButtons = () =>
      wrapper.findAll(".paste__actions button").filter((_, i) => i % 2 === 1);
    const labels = () => deleteButtons().map((button) => button.text());

    await deleteButtons()[0].trigger("click");
    await deleteButtons()[1].trigger("click");
    expect(labels()).toEqual(["Delete", "Confirm delete"]);

    await vi.advanceTimersByTimeAsync(4000);

    expect(labels()).toEqual(["Delete", "Delete"]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("shows why a delete failed", async () => {
    fetchMock
      .mockResolvedValueOnce(listing([paste("p1")]))
      .mockResolvedValueOnce(jsonResponse(404, { error: "There is no such paste with that ID." }));
    const { wrapper } = await mountWithRouter(PasteList);
    await flushPromises();

    await buttonNamed(wrapper, "Delete").trigger("click");
    await buttonNamed(wrapper, "Confirm delete").trigger("click");
    await flushPromises();

    expect(wrapper.find('[role="alert"]').text()).toBe("There is no such paste with that ID.");
    expect(wrapper.findAll(".paste__preview")).toHaveLength(1);
  });

  it("refresh reloads the first page", async () => {
    fetchMock
      .mockResolvedValueOnce(listing([paste("p11")], { page: 2, pages: 2, total: 11 }))
      .mockResolvedValueOnce(listing([paste("p0"), paste("p1")], { pages: 2, total: 12 }));
    const { wrapper } = await mountWithRouter(PasteList);
    await flushPromises();

    await (wrapper.vm as unknown as { refresh: () => Promise<void> }).refresh();
    await flushPromises();

    expect(fetchMock.mock.calls[1][0]).toContain("page=1");
    expect(wrapper.find(".toolbar__count").text()).toBe("12 pastes");
  });

  it("stops the disarm timer when it unmounts", async () => {
    vi.useFakeTimers();
    fetchMock.mockResolvedValueOnce(listing([paste("p1")]));
    const { wrapper } = await mountWithRouter(PasteList);
    await flushPromises();

    await buttonNamed(wrapper, "Delete").trigger("click");
    wrapper.unmount();

    expect(vi.getTimerCount()).toBe(0);
  });
});
