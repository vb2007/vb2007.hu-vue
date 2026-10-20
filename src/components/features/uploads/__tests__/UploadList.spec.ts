import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { enableAutoUnmount, flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { nextTick } from "vue";
import UploadList from "@/components/features/uploads/UploadList.vue";
import UploadRow from "@/components/features/uploads/UploadRow.vue";
import { SEARCH_DELAY_MS } from "@/composables/useUploads";
import type { Upload } from "@/scripts/uploads/upload";
import { jsonResponse, mockFetch } from "@/__tests__/helpers/fetch";
import { anUpload } from "@/__tests__/helpers/uploads";

const listing = (uploads: Upload[], { page = 1, pages = 1, total = uploads.length } = {}) =>
  jsonResponse(200, {
    uploads,
    pagination: { limit: 10, page, total, pages, sortBy: "uploadedOn", sortOrder: "desc" }
  });

const buttonNamed = (wrapper: VueWrapper, name: string) =>
  wrapper.findAll("button").find((button) => button.text().includes(name))!;

const lastUrl = (fetchMock: ReturnType<typeof mockFetch>) =>
  String(fetchMock.mock.calls.at(-1)![0]);

// A list left mounted could still fire a pending search into the next test's fetch mock.
enableAutoUnmount(afterEach);

describe("UploadList", () => {
  let fetchMock: ReturnType<typeof mockFetch>;

  beforeEach(() => {
    fetchMock = mockFetch();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("loads the user's uploads on mount and lists them", async () => {
    let respond!: (response: Response) => void;
    fetchMock.mockReturnValueOnce(new Promise((resolve) => (respond = resolve)));
    const wrapper = mount(UploadList);
    await flushPromises();

    expect(wrapper.find("h2").text()).toBe("Your uploads");
    expect(wrapper.find(".note").text()).toBe("Loading your uploads…");

    respond(listing([anUpload("a"), anUpload("b")]));
    await flushPromises();

    expect(wrapper.find(".count").text()).toBe("2 uploads");
    expect(wrapper.findAllComponents(UploadRow).map((row) => row.props("upload").id)).toEqual([
      "a",
      "b"
    ]);
    expect(wrapper.find(".rows").attributes("aria-busy")).toBeUndefined();
    expect(wrapper.find(".pager").exists()).toBe(false);
  });

  it("teaches what to do when there are no uploads yet", async () => {
    fetchMock.mockResolvedValueOnce(listing([]));
    const wrapper = mount(UploadList);
    await flushPromises();

    expect(wrapper.find(".count").text()).toBe("0 uploads");
    expect(wrapper.find(".empty").text()).toContain("No uploads yet.");
    expect(wrapper.find(".rows").exists()).toBe(false);
  });

  it("shows a load error", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(500, { error: "Database down." }));
    const wrapper = mount(UploadList);
    await flushPromises();

    expect(wrapper.text()).toContain("Database down.");
    expect(wrapper.find(".count").exists()).toBe(false);
  });

  it("searches, filters and sorts, and offers a way back when nothing matches", async () => {
    fetchMock.mockResolvedValue(listing([anUpload("a")]));
    const wrapper = mount(UploadList);
    await flushPromises();

    await wrapper.find("select").setValue("fileSize:desc");
    await flushPromises();
    expect(lastUrl(fetchMock)).toContain("sortBy=fileSize&sortOrder=desc");
    expect(wrapper.find<HTMLSelectElement>("select").element.value).toBe("fileSize:desc");

    await wrapper.find("input[value=private]").setValue();
    await flushPromises();
    expect(lastUrl(fetchMock)).toContain("visibility=private");
    expect(wrapper.find(".count").text()).toBe("1 upload found");

    fetchMock.mockResolvedValue(listing([]));
    vi.useFakeTimers();
    await wrapper.find("input[type=search]").setValue("nothing");
    await nextTick();
    vi.advanceTimersByTime(SEARCH_DELAY_MS);
    vi.useRealTimers();
    await flushPromises();
    expect(lastUrl(fetchMock)).toContain("q=nothing");
    expect(wrapper.find(".empty").text()).toContain("No uploads match.");

    const before = fetchMock.mock.calls.length;
    vi.useFakeTimers();
    await buttonNamed(wrapper, "Show all uploads").trigger("click");
    await nextTick();
    vi.advanceTimersByTime(SEARCH_DELAY_MS);
    vi.useRealTimers();
    await flushPromises();
    // One reload for clearing both, not a second one for the emptied search box.
    expect(fetchMock.mock.calls.length - before).toBe(1);
    expect(lastUrl(fetchMock)).not.toContain("visibility=");
    expect(wrapper.find<HTMLInputElement>("input[type=search]").element.value).toBe("");
    expect(wrapper.find<HTMLInputElement>("input[value=all]").element.checked).toBe(true);
  });

  it("filters back to all", async () => {
    fetchMock.mockResolvedValue(listing([anUpload("a")]));
    const wrapper = mount(UploadList);
    await flushPromises();
    await wrapper.find("input[value=public]").setValue();
    await flushPromises();
    await wrapper.find("input[value=all]").setValue();
    await flushPromises();

    expect(lastUrl(fetchMock)).not.toContain("visibility=");
  });

  it("pages through uploads", async () => {
    fetchMock.mockResolvedValueOnce(listing([anUpload("a")], { pages: 2, total: 11 }));
    const wrapper = mount(UploadList);
    await flushPromises();

    expect(wrapper.find(".pager__label").text()).toBe("Page 1 of 2");
    expect(buttonNamed(wrapper, "Previous").attributes("disabled")).toBeDefined();

    fetchMock.mockResolvedValueOnce(listing([anUpload("k")], { page: 2, pages: 2, total: 11 }));
    await buttonNamed(wrapper, "Next").trigger("click");
    await flushPromises();
    expect(lastUrl(fetchMock)).toContain("page=2");
    expect(buttonNamed(wrapper, "Next").attributes("disabled")).toBeDefined();

    fetchMock.mockResolvedValueOnce(listing([anUpload("a")], { pages: 2, total: 11 }));
    await buttonNamed(wrapper, "Previous").trigger("click");
    await flushPromises();
    expect(lastUrl(fetchMock)).toContain("page=1");
  });

  it("hands each row its edits and busy state, and tells the page after a delete", async () => {
    fetchMock.mockResolvedValueOnce(listing([anUpload("a"), anUpload("b")]));
    const wrapper = mount(UploadList);
    await flushPromises();
    const [first, second] = wrapper.findAllComponents(UploadRow);

    let respond!: (response: Response) => void;
    fetchMock.mockReturnValueOnce(new Promise((resolve) => (respond = resolve)));
    const renaming = second.props("rename")("b", "x.png");
    await nextTick();
    expect(second.props("busy")).toBe("rename");
    expect(first.props("busy")).toBe("");
    respond(jsonResponse(400, { error: "Invalid name." }));
    await renaming;
    await nextTick();
    expect(second.props("error")).toBe("Invalid name.");
    expect(first.props("error")).toBe("");

    fetchMock.mockResolvedValueOnce(jsonResponse(500, {}, "Oops"));
    await first.props("remove")("a");
    expect(wrapper.emitted("changed")).toBeUndefined();

    fetchMock.mockResolvedValueOnce(jsonResponse(200, {})).mockResolvedValueOnce(listing([]));
    await first.props("remove")("a");
    expect(wrapper.emitted("changed")).toHaveLength(1);

    fetchMock.mockResolvedValueOnce(jsonResponse(200, { upload: anUpload("b") }));
    await expect(second.props("setVisibility")("b", "public")).resolves.toBe(true);
  });

  it("goes back to the first page when refreshed after an upload", async () => {
    fetchMock.mockResolvedValue(listing([]));
    const wrapper = mount(UploadList);
    await flushPromises();

    await (wrapper.vm as unknown as { refresh: () => Promise<void> }).refresh();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(lastUrl(fetchMock)).toContain("page=1");
  });
});
