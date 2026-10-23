import { beforeEach, describe, expect, it } from "vitest";
import { flushPromises, type VueWrapper } from "@vue/test-utils";
import UploadComposer from "@/components/features/uploads/UploadComposer.vue";
import UploadDropzone from "@/components/features/uploads/UploadDropzone.vue";
import UploadQueue from "@/components/features/uploads/UploadQueue.vue";
import { isLoggedIn, isSessionChecked } from "@/scripts/authentication/authState";
import { mountWithRouter } from "@/__tests__/helpers/mount";
import { aFile, anUpload, someUsage } from "@/__tests__/helpers/uploads";
import { mockXhr, type FakeXhr } from "@/__tests__/helpers/xhr";

const buttonNamed = (wrapper: VueWrapper, name: string) =>
  wrapper.findAll("button").find((button) => button.text().includes(name))!;

describe("UploadComposer", () => {
  let requests: FakeXhr[];

  beforeEach(() => {
    requests = mockXhr();
  });

  it("shows nothing but the board until the session is known", async () => {
    const { wrapper } = await mountWithRouter(UploadComposer, { props: { usage: null } });

    expect(wrapper.find("h2").text()).toBe("Upload");
    expect(wrapper.findComponent(UploadDropzone).exists()).toBe(false);
    expect(wrapper.find(".gate").exists()).toBe(false);
  });

  it("asks logged-out visitors to register or log in", async () => {
    isSessionChecked.value = true;
    const { wrapper } = await mountWithRouter(UploadComposer, {
      props: { usage: null, as: "h1" }
    });

    expect(wrapper.find("h1").text()).toBe("Upload");
    expect(wrapper.find(".gate").text()).toContain("Only logged-in users can upload files.");
    expect(wrapper.findAll(".gate a").map((link) => link.attributes("href"))).toEqual([
      "/register",
      "/login"
    ]);
  });

  it("describes the limits once usage is known", async () => {
    isLoggedIn.value = true;
    const { wrapper } = await mountWithRouter(UploadComposer, { props: { usage: null } });
    const dropzone = wrapper.findComponent(UploadDropzone);

    expect(dropzone.props("hint")).toBe("Images, video, audio, PDFs, text and archives.");
    expect(dropzone.props("accept")).toBeUndefined();

    await wrapper.setProps({ usage: someUsage() });
    expect(dropzone.props("hint")).toBe(
      "Up to 10 MB each. Images, video, audio, PDFs, text and archives."
    );
    expect(dropzone.props("accept")).toBe(".png,image/png,.jpg,image/jpeg,.txt,text/plain");
  });

  it("queues dropped files, uploads them and reports each one that lands", async () => {
    isLoggedIn.value = true;
    const { wrapper } = await mountWithRouter(UploadComposer, { props: { usage: someUsage() } });

    wrapper
      .findComponent(UploadDropzone)
      .vm.$emit(
        "files",
        [aFile("a.png"), aFile("page.html", 10, "text/html"), aFile("c.png")],
        "public"
      );
    await flushPromises();
    const queue = wrapper.findComponent(UploadQueue);
    expect(queue.props("items").map((item: { status: string }) => item.status)).toEqual([
      "uploading",
      "rejected",
      "uploading"
    ]);

    await buttonNamed(wrapper, "Cancel").trigger("click");
    await flushPromises();
    await buttonNamed(wrapper, "Retry").trigger("click");
    await buttonNamed(wrapper, "Remove").trigger("click");
    requests[1].respond(201, { upload: anUpload("c") });
    await flushPromises();

    expect(wrapper.emitted("uploaded")).toEqual([[anUpload("c")]]);
    await buttonNamed(wrapper, "Clear finished").trigger("click");
    expect(queue.props("items")).toHaveLength(1);
  });
});
