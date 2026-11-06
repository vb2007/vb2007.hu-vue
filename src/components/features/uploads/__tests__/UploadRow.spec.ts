import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import UploadRow from "@/components/features/uploads/UploadRow.vue";
import UploadLink from "@/components/features/uploads/UploadLink.vue";
import AppIcon from "@/components/ui/AppIcon.vue";
import StatusMessage from "@/components/ui/StatusMessage.vue";
import type { Upload } from "@/types/api/uploads";
import { anUpload } from "@/__tests__/helpers/uploads";
import { formatTime } from "@/scripts/utility/dateUtil";

/** A private link as the API signs it. */
const EXPIRES = 1_793_995_200;
const SIGNED = `https://cdn.test/useruploads/user1/u1.png?expires=${EXPIRES}&sig=x`;

const buttonNamed = (wrapper: VueWrapper, name: string) =>
  wrapper.findAll("button").find((button) => button.text().includes(name));

describe("UploadRow", () => {
  let rename: ReturnType<typeof vi.fn>;
  let setVisibility: ReturnType<typeof vi.fn>;
  let remove: ReturnType<typeof vi.fn>;

  const mountRow = (upload: Upload = anUpload("u1"), props: object = {}) =>
    mount(UploadRow, {
      props: { upload, busy: "", error: "", rename, setVisibility, remove, ...props },
      attachTo: document.body
    });

  beforeEach(() => {
    rename = vi.fn(() => Promise.resolve(true));
    setVisibility = vi.fn(() => Promise.resolve(true));
    remove = vi.fn(() => Promise.resolve(true));
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("sums up the upload: thumbnail, name, size, type, date and visibility", () => {
    const wrapper = mountRow(anUpload("u1", { fileSize: 2048 }));

    expect(wrapper.find(".thumb__img").attributes()).toMatchObject({
      src: anUpload("u1").url,
      loading: "lazy"
    });
    expect(wrapper.find(".row__name").text()).toBe("file-u1.png");
    expect(wrapper.find(".row__name").attributes("aria-expanded")).toBe("false");
    expect(wrapper.find(".row__meta").text()).toMatch(/^2 kB · PNG · /);
    expect(wrapper.find(".badge").text()).toBe("Private");
    expect(wrapper.find(".badge").classes()).toContain("badge--private");
    expect(wrapper.find("a").attributes()).toMatchObject({
      href: anUpload("u1").url,
      target: "_blank",
      rel: "noopener"
    });
    expect(wrapper.find(".details").exists()).toBe(false);
    expect(wrapper.findComponent(StatusMessage).exists()).toBe(false);
  });

  it("falls back to the category icon when a thumbnail can't load, and for other types", async () => {
    const wrapper = mountRow();
    await wrapper.find(".thumb__img").trigger("error");
    expect(wrapper.find(".thumb__img").exists()).toBe(false);
    expect(wrapper.find(".thumb").findComponent(AppIcon).props("name")).toBe("image");

    const pdf = mountRow(anUpload("u2", { mimeType: "application/pdf", extension: ".pdf" }));
    expect(pdf.find(".thumb").findComponent(AppIcon).props("name")).toBe("document");
  });

  it("opens its own details with a preview and the facts", async () => {
    const wrapper = mountRow(
      anUpload("u1", { visibility: "public", updatedOn: "2026-10-11T08:00:00.000Z" })
    );
    await wrapper.find(".row__name").trigger("click");

    const details = wrapper.find(".details");
    expect(wrapper.find(".row__name").attributes("aria-controls")).toBe(details.attributes("id"));
    expect(wrapper.find(".row__name").attributes("aria-expanded")).toBe("true");
    expect(details.find("img").attributes("alt")).toBe("Preview of file-u1.png");
    const facts = Object.fromEntries(
      details.findAll(".facts__row").map((row) => [row.find("dt").text(), row.find("dd").text()])
    );
    expect(facts).toMatchObject({
      Type: "PNG · image/png",
      Size: `2 kB (${(2048).toLocaleString()} bytes)`,
      "Who can open it": "Anyone with the link; it never expires"
    });
    expect(facts.Changed).toBeTruthy();
    expect(details.findComponent(UploadLink).props("url")).toBe(anUpload("u1").url);
    expect(wrapper.find(".badge").text()).toBe("Public");

    await wrapper.find(".row__name").trigger("click");
    expect(wrapper.find(".details").exists()).toBe(false);
  });

  it.each([
    ["video/mp4", ".mp4", "video"],
    ["audio/mpeg", ".mp3", "audio"]
  ])("plays %s in the details", async (mimeType, extension, tag) => {
    const wrapper = mountRow(anUpload("u1", { mimeType, extension }));
    await wrapper.find(".row__name").trigger("click");

    expect(wrapper.find(`.details__preview ${tag}`).attributes("src")).toBe(anUpload("u1").url);
  });

  it("shows a big icon in place of a preview it can't show", async () => {
    const wrapper = mountRow(anUpload("u1", { mimeType: "application/zip", extension: ".zip" }));
    await wrapper.find(".row__name").trigger("click");

    expect(wrapper.find(".details__icon").findComponent(AppIcon).props("name")).toBe("archive");
    const facts = wrapper.findAll(".facts__row").map((row) => row.find("dt").text());
    expect(facts).not.toContain("Changed");
    expect(wrapper.find(".facts").text()).toContain(
      "You and the admin, plus anyone you share the link with until it expires"
    );
  });

  it("copies a signed link and shows when the copy expires", async () => {
    const wrapper = mountRow(anUpload("u1", { url: SIGNED }));
    await buttonNamed(wrapper, "Copy link")!.trigger("click");
    await flushPromises();

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(SIGNED);
    expect(buttonNamed(wrapper, "Copied")).toBeTruthy();
    const note = wrapper.find("[role=status]");
    expect(note.text()).toBe(`The copied link expires at ${formatTime(EXPIRES * 1000)}.`);
    expect(note.classes()).not.toContain("visually-hidden");
  });

  it("only reads out copying a plain link", async () => {
    const wrapper = mountRow(anUpload("u2", { visibility: "public" }));
    expect(wrapper.find("[role=status]").text()).toBe("");

    await buttonNamed(wrapper, "Copy link")!.trigger("click");
    await flushPromises();
    const status = wrapper.find("[role=status]");
    expect(status.text()).toBe("Link copied to clipboard");
    expect(status.classes()).toContain("visually-hidden");
  });

  it("names the owner and the admin on someone else's private upload", async () => {
    const wrapper = mountRow(anUpload("u1"), { ownerName: "anna" });
    await wrapper.find(".row__name").trigger("click");
    expect(wrapper.find(".facts").text()).toContain(
      "anna and the admin, plus anyone they share the link with until it expires"
    );
  });

  it("says when copying failed, and drops the note of an earlier copy", async () => {
    const wrapper = mountRow(anUpload("u1", { url: SIGNED }));
    await buttonNamed(wrapper, "Copy link")!.trigger("click");
    await flushPromises();
    expect(wrapper.find("[role=status]").text()).not.toBe("");

    navigator.clipboard.writeText = vi.fn(() => Promise.reject(new Error("denied")));
    vi.spyOn(console, "error").mockImplementation(() => {});
    await buttonNamed(wrapper, "Copied")!.trigger("click");
    await flushPromises();

    expect(buttonNamed(wrapper, "Copy failed")).toBeTruthy();
    expect(wrapper.find("[role=status]").text()).toBe("");
  });

  it("tries the thumbnail again with a new link", async () => {
    const wrapper = mountRow(anUpload("u1", { url: SIGNED }));
    await wrapper.find(".thumb__img").trigger("error");
    expect(wrapper.find(".thumb__img").exists()).toBe(false);

    await wrapper.setProps({ upload: anUpload("u1", { url: `${SIGNED}2` }) });
    expect(wrapper.find(".thumb__img").attributes("src")).toBe(`${SIGNED}2`);
  });

  it("keeps a playing video where it was when its link is renewed", async () => {
    const video = anUpload("u1", { mimeType: "video/mp4", extension: ".mp4", url: SIGNED });
    const wrapper = mountRow(video);
    await wrapper.find(".row__name").trigger("click");
    const player = wrapper.find<HTMLVideoElement>("video").element;
    player.currentTime = 42;
    Object.defineProperty(player, "paused", { value: false, configurable: true });
    player.play = vi.fn(() => Promise.resolve());

    await wrapper.setProps({ upload: { ...video, url: `${SIGNED}2` } });
    expect(player.getAttribute("src")).toBe(`${SIGNED}2`);
    player.currentTime = 0;
    player.dispatchEvent(new Event("loadedmetadata"));

    expect(player.currentTime).toBe(42);
    expect(player.play).toHaveBeenCalledTimes(1);
  });

  it("leaves a paused song paused when its link is renewed", async () => {
    const song = anUpload("u1", { mimeType: "audio/mpeg", extension: ".mp3", url: SIGNED });
    const wrapper = mountRow(song);
    await wrapper.find(".row__name").trigger("click");
    const player = wrapper.find<HTMLAudioElement>("audio").element;
    player.play = vi.fn(() => Promise.resolve());

    await wrapper.setProps({ upload: { ...song, url: `${SIGNED}2` } });
    player.dispatchEvent(new Event("loadedmetadata"));

    expect(player.play).not.toHaveBeenCalled();
  });

  it("renames in place: checks the name, saves it and closes the field", async () => {
    const wrapper = mountRow();
    await wrapper.find(".row__name").trigger("click");
    await buttonNamed(wrapper, "Rename")!.trigger("click");
    await flushPromises();

    const input = wrapper.find<HTMLInputElement>(".rename input");
    expect(input.element.value).toBe("file-u1.png");
    expect(document.activeElement).toBe(input.element);
    expect(buttonNamed(wrapper, "Rename")).toBeUndefined();

    await input.setValue("bad/name");
    await wrapper.find(".rename").trigger("submit");
    expect(wrapper.find(".rename").text()).toContain("without slashes");
    expect(rename).not.toHaveBeenCalled();

    await input.setValue("holiday.png");
    await wrapper.find(".rename").trigger("submit");
    await flushPromises();
    expect(rename).toHaveBeenCalledWith("u1", "holiday.png");
    expect(wrapper.find(".rename").exists()).toBe(false);
  });

  it("says what's wrong with a name while it's typed, and an empty one once it's left", async () => {
    const wrapper = mountRow();
    await wrapper.find(".row__name").trigger("click");
    await buttonNamed(wrapper, "Rename")!.trigger("click");
    await flushPromises();
    const input = wrapper.find(".rename input");
    const saveKey = () => wrapper.find('.rename button[type="submit"]');

    await input.setValue("bad/");
    expect(wrapper.find(".rename .field__error").text()).toContain("without slashes");
    expect(saveKey().attributes("aria-disabled")).toBe("true");

    await input.setValue("");
    expect(wrapper.find(".rename .field__error").exists()).toBe(false);
    await input.trigger("blur");
    expect(wrapper.find(".rename .field__error").text()).toContain("1–255 characters");

    await input.setValue("ok.png");
    expect(wrapper.find(".rename .field__error").exists()).toBe(false);
    expect(saveKey().attributes("aria-disabled")).toBeUndefined();
  });

  it("keeps the field open when renaming fails, and closes it on Escape or Cancel", async () => {
    rename.mockResolvedValueOnce(false);
    const wrapper = mountRow();
    await buttonNamed(wrapper, "Rename")?.trigger("click");
    // Rename lives in the details, so it opens them first.
    await wrapper.find(".row__name").trigger("click");
    await buttonNamed(wrapper, "Rename")!.trigger("click");
    await flushPromises();
    await wrapper.find(".rename input").setValue("other.png");
    await wrapper.find(".rename").trigger("submit");
    await flushPromises();
    expect(wrapper.find(".rename").exists()).toBe(true);

    await wrapper.find(".rename").trigger("keydown", { key: "Escape" });
    expect(wrapper.find(".rename").exists()).toBe(false);

    await buttonNamed(wrapper, "Rename")!.trigger("click");
    await flushPromises();
    await buttonNamed(wrapper, "Cancel")!.trigger("click");
    expect(wrapper.find(".rename").exists()).toBe(false);
  });

  it("closes the field without a request when the name didn't change", async () => {
    const wrapper = mountRow();
    await wrapper.find(".row__name").trigger("click");
    await buttonNamed(wrapper, "Rename")!.trigger("click");
    await flushPromises();
    await wrapper.find(".rename input").setValue("  file-u1.png ");
    await wrapper.find(".rename").trigger("submit");

    expect(rename).not.toHaveBeenCalled();
    expect(wrapper.find(".rename").exists()).toBe(false);
  });

  it("shows the edit in progress on its key", async () => {
    const wrapper = mountRow(anUpload("u1"), { busy: "rename", error: "It broke." });
    await wrapper.find(".row__name").trigger("click");
    await buttonNamed(wrapper, "Rename")!.trigger("click");
    await flushPromises();

    expect(buttonNamed(wrapper, "Saving")).toBeTruthy();
    expect(wrapper.findComponent(StatusMessage).text()).toBe("It broke.");
    await wrapper.setProps({ busy: "delete" });
    expect(buttonNamed(wrapper, "Deleting")).toBeTruthy();
    expect(buttonNamed(wrapper, "Save name")).toBeTruthy();
  });

  it("switches visibility both ways", async () => {
    const wrapper = mountRow();
    await wrapper.find(".row__name").trigger("click");
    await buttonNamed(wrapper, "Make public")!.trigger("click");
    expect(setVisibility).toHaveBeenCalledWith("u1", "public");

    await wrapper.setProps({ upload: anUpload("u1", { visibility: "public" }) });
    await buttonNamed(wrapper, "Make private")!.trigger("click");
    expect(setVisibility).toHaveBeenLastCalledWith("u1", "private");
  });

  it("deletes on the second click, and the first wears off after a while", async () => {
    vi.useFakeTimers();
    const wrapper = mountRow();
    await wrapper.find(".row__name").trigger("click");

    await buttonNamed(wrapper, "Delete")!.trigger("click");
    expect(buttonNamed(wrapper, "Confirm delete")).toBeTruthy();
    vi.advanceTimersByTime(4000);
    await wrapper.vm.$nextTick();
    expect(buttonNamed(wrapper, "Confirm delete")).toBeUndefined();
    expect(remove).not.toHaveBeenCalled();

    await buttonNamed(wrapper, "Delete")!.trigger("click");
    await buttonNamed(wrapper, "Confirm delete")!.trigger("click");
    expect(remove).toHaveBeenCalledWith("u1");
    expect(buttonNamed(wrapper, "Confirm delete")).toBeUndefined();

    await buttonNamed(wrapper, "Delete")!.trigger("click");
    wrapper.unmount();
    vi.runAllTimers();
  });
});
