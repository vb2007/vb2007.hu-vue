import { describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import UploadDropzone from "@/components/features/uploads/UploadDropzone.vue";
import { aFile } from "@/__tests__/helpers/uploads";

const mountDropzone = () =>
  mount(UploadDropzone, { props: { accept: ".png,image/png", hint: "Up to 10 MB each." } });

/** A FileList stand-in; jsdom can't build a real one. */
const fileList = (...files: File[]) =>
  Object.assign([...files], { item: (index: number) => files[index] }) as unknown as FileList;

describe("UploadDropzone", () => {
  it("defaults to private and explains each choice", async () => {
    const wrapper = mountDropzone();

    expect(wrapper.find(".visibility-hint").text()).toBe(
      "Only you can open private files, once you're logged in."
    );
    await wrapper.find("input[value=public]").setValue();
    expect(wrapper.find(".visibility-hint").text()).toBe(
      "Anyone with the link can open public files."
    );
    expect(wrapper.find(".dropzone__hint").text()).toBe("Up to 10 MB each.");
  });

  it("sends picked files with the chosen visibility, then clears the picker", async () => {
    const wrapper = mountDropzone();
    const picker = wrapper.find<HTMLInputElement>("input[type=file]");
    expect(picker.attributes("accept")).toBe(".png,image/png");
    const click = vi.spyOn(picker.element, "click").mockImplementation(() => {});

    await wrapper.find("button").trigger("click");
    expect(click).toHaveBeenCalled();

    const file = aFile("a.png");
    Object.defineProperty(picker.element, "files", { value: fileList(file), configurable: true });
    await wrapper.find("input[value=public]").setValue();
    await picker.trigger("change");

    expect(wrapper.emitted("files")).toEqual([[[file], "public"]]);
    expect(picker.element.value).toBe("");
  });

  it("ignores a picker change with no files", async () => {
    const wrapper = mountDropzone();
    const picker = wrapper.find<HTMLInputElement>("input[type=file]");
    Object.defineProperty(picker.element, "files", { value: fileList(), configurable: true });
    await picker.trigger("change");

    expect(wrapper.emitted("files")).toBeUndefined();
  });

  it("lights up while a drag is over it, through child enter/leave events", async () => {
    const wrapper = mountDropzone();
    const zone = wrapper.find("[data-testid=dropzone]");

    await zone.trigger("dragenter");
    await zone.trigger("dragenter");
    await zone.trigger("dragover");
    expect(zone.classes()).toContain("dropzone--over");
    expect(wrapper.find(".dropzone__title").text()).toBe("Let go to upload");

    await zone.trigger("dragleave");
    expect(zone.classes()).toContain("dropzone--over");
    await zone.trigger("dragleave");
    await zone.trigger("dragleave");
    expect(zone.classes()).not.toContain("dropzone--over");
    expect(wrapper.find(".dropzone__title").text()).toBe("Drop files here");
  });

  it("sends dropped files, and nothing for a drop without files", async () => {
    const wrapper = mountDropzone();
    const zone = wrapper.find("[data-testid=dropzone]");
    const file = aFile("a.png");

    await zone.trigger("dragenter");
    await zone.trigger("drop", { dataTransfer: { files: fileList(file) } });
    expect(zone.classes()).not.toContain("dropzone--over");
    await zone.trigger("drop");

    expect(wrapper.emitted("files")).toEqual([[[file], "private"]]);
  });
});
