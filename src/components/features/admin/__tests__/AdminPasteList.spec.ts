import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { enableAutoUnmount, flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { nextTick } from "vue";
import AdminPasteList from "@/components/features/admin/AdminPasteList.vue";
import { CONFIRM_DELETE_MS } from "@/composables/useConfirmDelete";
import { SEARCH_DELAY_MS } from "@/composables/usePagedList";
import { Limits } from "@/constants/limits";
import type { AdminPaste } from "@/types/api/admin";
import { jsonResponse, mockFetch } from "@/__tests__/helpers/fetch";
import { createTestRouter } from "@/__tests__/helpers/mount";

// Rows link to each paste and to its owner's account page.
const global = { plugins: [createTestRouter()] };

const aPaste = (id: string, overrides: Partial<AdminPaste> = {}): AdminPaste => ({
  id,
  language: "typescript",
  preview: "\n  const answer = 42;\nconsole.log(answer);",
  addedOn: "2026-10-10T12:00:00.000Z",
  owner: { id: `u-${id}`, username: `user-${id}` },
  ...overrides
});

const listing = (pastes: AdminPaste[], { page = 1, pages = 1, total = pastes.length } = {}) =>
  jsonResponse(200, {
    pastes,
    pagination: { limit: 20, page, total, pages, sortBy: "addedOn", sortOrder: "desc" }
  });

const buttonNamed = (wrapper: VueWrapper, name: string) =>
  wrapper.findAll("button").find((button) => button.text().includes(name))!;

const lastUrl = (fetchMock: ReturnType<typeof mockFetch>) =>
  String(fetchMock.mock.calls.at(-1)![0]);

// A list left mounted could still fire a pending search into the next test's fetch mock.
enableAutoUnmount(afterEach);

describe("AdminPasteList", () => {
  let fetchMock: ReturnType<typeof mockFetch>;

  beforeEach(() => {
    fetchMock = mockFetch();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("loads every paste on mount, with its owner, language, date and opening line", async () => {
    let respond!: (response: Response) => void;
    fetchMock.mockReturnValueOnce(new Promise((resolve) => (respond = resolve)));
    const wrapper = mount(AdminPasteList, { props: { as: "h1" }, global });
    await flushPromises();

    expect(wrapper.find("h1").text()).toBe("Pastes");
    expect(wrapper.find(".note").text()).toBe("Loading the pastes…");

    respond(
      listing([
        aPaste("a"),
        aPaste("b", { language: null, owner: null, preview: " \n\n " }),
        aPaste("c", { language: "made-up" })
      ])
    );
    await flushPromises();

    expect(wrapper.find(".count").text()).toBe("3 pastes");
    const rows = wrapper.findAll(".row");
    expect(rows.map((row) => row.find(".row__preview").text())).toEqual([
      "const answer = 42;",
      "Opens with blank lines",
      "const answer = 42;"
    ]);
    expect(rows[0].find(".row__preview").attributes("href")).toBe("/pastebin/a");
    // Blank space has no code to show, so it reads as a note.
    expect(rows[0].find(".row__preview--blank").exists()).toBe(false);
    expect(rows[1].find(".row__preview--blank").attributes("href")).toBe("/pastebin/b");
    expect(rows[0].find(".row__owner").text()).toBe("user-a");
    expect(rows[0].find(".row__owner").attributes("href")).toBe("/admin/users/u-a");
    expect(rows[0].find(".row__language").text()).toBe("TypeScript");
    expect(rows[0].find("time").attributes("datetime")).toBe("2026-10-10T12:00:00.000Z");
    expect(rows[0].find("button").text()).toBe("Delete user-a's paste");

    // No owner any more, no language: plain text.
    expect(rows[1].find(".row__owner").exists()).toBe(false);
    expect(rows[1].find(".row__gone").text()).toBe("Deleted account");
    expect(rows[1].find(".row__language").text()).toBe("Plain text");
    expect(rows[1].find("button").text()).toBe("Delete the paste of a deleted account");
    expect(rows[2].find(".row__language").text()).toBe("Plain text");

    expect(wrapper.find(".rows").attributes("aria-busy")).toBeUndefined();
    expect(wrapper.find(".pager").exists()).toBe(false);
  });

  it("marks a preview the API cut off in its first line", async () => {
    const full = "x".repeat(Limits.Paste.previewLength);
    const twoLines = `short\n${"y".repeat(Limits.Paste.previewLength - 6)}`;
    // The first line ends at the preview's end, so nothing was cut.
    const endsInNewline = `${"z".repeat(Limits.Paste.previewLength - 1)}\n`;
    fetchMock.mockResolvedValueOnce(
      listing([
        aPaste("a", { preview: full }),
        aPaste("b", { preview: twoLines }),
        aPaste("c", { preview: "brief" }),
        aPaste("d", { preview: `\n\n${full.slice(2)}` }),
        aPaste("e", { preview: endsInNewline })
      ])
    );
    const wrapper = mount(AdminPasteList, { global });
    await flushPromises();

    expect(wrapper.findAll(".row__preview").map((link) => link.text())).toEqual([
      `${full}…`,
      "short",
      "brief",
      `${full.slice(2)}…`,
      endsInNewline.trim()
    ]);
  });

  it("uses an h2 by default and says when there are no pastes", async () => {
    fetchMock.mockResolvedValueOnce(listing([]));
    const wrapper = mount(AdminPasteList, { global });
    await flushPromises();

    expect(wrapper.find("h2").text()).toBe("Pastes");
    expect(wrapper.find(".count").text()).toBe("0 pastes");
    expect(wrapper.find(".empty").text()).toBe("No pastes yet.");
    expect(wrapper.find(".rows").exists()).toBe(false);
  });

  it("says one paste, and offers every paste back when a search finds none", async () => {
    fetchMock.mockResolvedValueOnce(listing([aPaste("a")]));
    const wrapper = mount(AdminPasteList, { global });
    await flushPromises();
    expect(wrapper.find(".count").text()).toBe("1 paste");
    // The API refuses a longer q with a 400.
    expect(wrapper.find("input").attributes("maxlength")).toBe(String(Limits.Search.maxLength));

    vi.useFakeTimers();
    fetchMock.mockResolvedValueOnce(listing([]));
    await wrapper.find("input").setValue("cobol");
    vi.advanceTimersByTime(SEARCH_DELAY_MS);
    await flushPromises();
    expect(lastUrl(fetchMock)).toContain("q=cobol");
    expect(wrapper.find(".count").text()).toBe("0 pastes found");
    expect(wrapper.find(".empty .note").text()).toBe("No owner or language matches that search.");

    fetchMock.mockResolvedValueOnce(listing([aPaste("a")]));
    await buttonNamed(wrapper, "Show every paste").trigger("click");
    await nextTick();
    vi.advanceTimersByTime(SEARCH_DELAY_MS);
    await flushPromises();

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(lastUrl(fetchMock)).not.toContain("q=");
    expect((wrapper.find("input").element as HTMLInputElement).value).toBe("");
  });

  it("sorts oldest first when asked", async () => {
    fetchMock.mockResolvedValue(listing([aPaste("a")]));
    const wrapper = mount(AdminPasteList, { global });
    await flushPromises();
    expect((wrapper.find("select").element as HTMLSelectElement).value).toBe("addedOn:desc");

    await wrapper.find("select").setValue("addedOn:asc");
    await flushPromises();

    expect(lastUrl(fetchMock)).toContain("page=1&sortBy=addedOn&sortOrder=asc");
  });

  it("shows the API's error", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(400, { error: "Invalid value for q." }));
    const wrapper = mount(AdminPasteList, { global });
    await flushPromises();

    expect(wrapper.find(".status").text()).toBe("Invalid value for q.");
    expect(wrapper.find(".rows").exists()).toBe(false);
  });

  it("pages through the pastes", async () => {
    fetchMock.mockResolvedValueOnce(listing([aPaste("a")], { pages: 2, total: 21 }));
    const wrapper = mount(AdminPasteList, { global });
    await flushPromises();
    expect(wrapper.find(".pager__label").text()).toBe("Page 1 of 2");

    fetchMock.mockResolvedValueOnce(listing([aPaste("b")], { page: 2, pages: 2, total: 21 }));
    await buttonNamed(wrapper, "Next").trigger("click");
    await flushPromises();
    expect(lastUrl(fetchMock)).toContain("page=2");
    expect(wrapper.find(".pager__label").text()).toBe("Page 2 of 2");
  });

  it("deletes a paste on the second click and reloads", async () => {
    fetchMock.mockResolvedValueOnce(listing([aPaste("a"), aPaste("b")]));
    const wrapper = mount(AdminPasteList, { global });
    await flushPromises();
    const deleteKey = () => wrapper.findAll(".row")[1].find("button");

    await deleteKey().trigger("click");
    expect(deleteKey().text()).toBe("Confirm delete user-b's paste");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    let respond!: (response: Response) => void;
    fetchMock.mockReturnValueOnce(new Promise((resolve) => (respond = resolve)));
    fetchMock.mockResolvedValueOnce(listing([aPaste("a")]));
    await deleteKey().trigger("click");
    expect(deleteKey().text()).toBe("Deleting user-b's paste");
    expect(fetchMock.mock.calls[1][0]).toBe("https://api.test/paste/b");
    // The other keys wait, so a second delete can't start meanwhile.
    const otherKey = wrapper.findAll(".row")[0].find("button");
    expect(otherKey.attributes("disabled")).toBeDefined();

    respond(jsonResponse(200, { message: "Paste deleted successfully." }));
    await flushPromises();
    expect(wrapper.findAll(".row")).toHaveLength(1);
    expect(wrapper.find(".row button").attributes("disabled")).toBeUndefined();
    expect(wrapper.find(".count").text()).toBe("1 paste");
  });

  it("disarms the delete after a while", async () => {
    vi.useFakeTimers();
    fetchMock.mockResolvedValueOnce(listing([aPaste("a")]));
    const wrapper = mount(AdminPasteList, { global });
    await flushPromises();

    await wrapper.find(".row button").trigger("click");
    expect(wrapper.find(".row button").text()).toContain("Confirm delete");
    vi.advanceTimersByTime(CONFIRM_DELETE_MS);
    await nextTick();

    expect(wrapper.find(".row button").text()).toBe("Delete user-a's paste");
  });

  it("shows a failed delete on its row", async () => {
    fetchMock.mockResolvedValueOnce(listing([aPaste("a"), aPaste("b")]));
    const wrapper = mount(AdminPasteList, { global });
    await flushPromises();

    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const deleteKey = wrapper.findAll(".row")[0].find("button");
    await deleteKey.trigger("click");
    await deleteKey.trigger("click");
    await flushPromises();

    const rows = wrapper.findAll(".row");
    expect(rows[0].find(".status").text()).toBe("Error connecting to server");
    expect(rows[1].find(".status").exists()).toBe(false);
  });
});
