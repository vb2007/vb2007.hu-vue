import { describe, expect, it, vi } from "vitest";
import { flushPromises, mount, type DOMWrapper } from "@vue/test-utils";
import UploadQueue from "@/components/features/uploads/UploadQueue.vue";
import UploadProgress from "@/components/features/uploads/UploadProgress.vue";
import type { QueueItem, QueueStatus } from "@/composables/useUploadQueue";
import { aFile, anUpload } from "@/__tests__/helpers/uploads";
import { formatTime } from "@/scripts/utility/dateUtil";

let nextId = 1;
const item = (status: QueueStatus, overrides: Partial<QueueItem> = {}): QueueItem => ({
  id: nextId++,
  file: aFile(`${status}.png`, 2048),
  visibility: "private",
  status,
  progress: 0,
  error: "",
  result: null,
  linkError: "",
  ...overrides
});

const button = (
  row: { findAll(selector: "button"): DOMWrapper<HTMLButtonElement>[] },
  name: string
) => row.findAll("button").find((b) => b.text().includes(name))!;

describe("UploadQueue", () => {
  it("renders nothing while the queue is empty", () => {
    const wrapper = mount(UploadQueue, { props: { items: [], hasFinished: false } });

    expect(wrapper.find(".queue").exists()).toBe(false);
  });

  it("shows each file's state, progress and the action that fits it", async () => {
    const items = [
      item("queued"),
      item("uploading", { progress: 0.42 }),
      item("done", { progress: 1, result: anUpload("u1", { visibility: "public" }) }),
      item("done", { progress: 1, result: anUpload("u2") }),
      item("failed", { error: "This upload would go over your storage quota." }),
      item("rejected", { error: "This file type isn't supported." }),
      item("cancelled")
    ];
    const wrapper = mount(UploadQueue, { props: { items, hasFinished: true } });
    const rows = wrapper.findAll(".job");

    expect(rows.map((row) => row.find(".job__status").text())).toEqual([
      "Waiting",
      "42%",
      "Uploaded · Public",
      "Uploaded · Private",
      "This upload would go over your storage quota.",
      "This file type isn't supported.",
      "Cancelled"
    ]);
    expect(rows[0].find(".job__name").text()).toBe("queued.png");
    expect(rows[0].find(".job__size").text()).toBe("2 kB");
    expect(rows[1].findComponent(UploadProgress).props()).toMatchObject({
      progress: 0.42,
      status: "uploading",
      label: "Uploading uploading.png"
    });
    expect(rows[5].findComponent(UploadProgress).exists()).toBe(false);
    expect(rows[2].find(".ticket a").attributes("href")).toBe(anUpload("u1").url);
    expect(wrapper.find("[role=status]").text()).toBe("2 uploading, 2 uploaded, 2 failed");

    await button(rows[0], "Cancel").trigger("click");
    await button(rows[4], "Retry").trigger("click");
    await button(rows[6], "Retry").trigger("click");
    await button(rows[5], "Remove").trigger("click");
    await button(wrapper.find(".queue__head"), "Clear finished").trigger("click");

    expect(wrapper.emitted("cancel")).toEqual([[items[0].id]]);
    expect(wrapper.emitted("retry")).toEqual([[items[4].id], [items[6].id]]);
    expect(wrapper.emitted("dismiss")).toEqual([[items[5].id]]);
    expect(wrapper.emitted("clear")).toHaveLength(1);
  });

  it("copies a finished upload's link and says so", async () => {
    const items = [
      item("done", { result: anUpload("u1") }),
      item("done", { result: anUpload("u2") })
    ];
    const wrapper = mount(UploadQueue, { props: { items, hasFinished: false } });
    const rows = wrapper.findAll(".job");

    expect(wrapper.find(".queue__head button").exists()).toBe(false);
    await button(rows[1], "Copy link").trigger("click");
    await flushPromises();

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(anUpload("u2").url);
    expect(button(rows[1], "Copied").exists()).toBe(true);
    expect(button(rows[0], "Copy link").exists()).toBe(true);
    expect(wrapper.find("[role=status]").text()).toBe("Link copied to clipboard");
  });

  it("shows when a copied signed link expires, under its ticket", async () => {
    const expires = Math.floor(Date.now() / 1000) + 3600;
    const url = `https://cdn.test/useruploads/user1/u2.png?expires=${expires}&sig=x`;
    const items = [
      item("done", { result: anUpload("u1") }),
      item("done", { result: anUpload("u2", { url }) })
    ];
    const wrapper = mount(UploadQueue, { props: { items, hasFinished: false } });
    const rows = wrapper.findAll(".job");

    await button(rows[1], "Copy link").trigger("click");
    await flushPromises();

    const note = `The copied link expires at ${formatTime(expires * 1000)}.`;
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(url);
    expect(rows[1].find(".ticket__note").text()).toBe(note);
    expect(rows[0].find(".ticket__note").exists()).toBe(false);
    expect(wrapper.find("[role=status]").text()).toBe(note);
  });

  it("keeps the ticket of a link that can't be renewed, with why instead of the key", () => {
    const linkError = "This file was deleted, so its link no longer works.";
    const items = [item("done", { result: anUpload("u1"), linkError })];
    const wrapper = mount(UploadQueue, { props: { items, hasFinished: true } });
    const ticket = wrapper.find(".ticket");

    expect(ticket.find("a").exists()).toBe(false);
    expect(ticket.find(".ticket__link--dead").text()).toContain("u1.png");
    expect(button(wrapper, "Copy link")).toBeUndefined();
    expect(ticket.find(".ticket__note[role=status]").text()).toBe(linkError);
    expect(wrapper.find("[role=alert]").exists()).toBe(false);
  });

  it("says when copying failed", async () => {
    navigator.clipboard.writeText = vi.fn(() => Promise.reject(new Error("denied")));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const items = [item("done", { result: anUpload("u1") })];
    const wrapper = mount(UploadQueue, { props: { items, hasFinished: false } });

    await button(wrapper, "Copy link").trigger("click");
    await flushPromises();

    expect(button(wrapper, "Copy failed").exists()).toBe(true);
    expect(wrapper.find("[role=status]").text()).toBe("1 uploaded");
  });
});
