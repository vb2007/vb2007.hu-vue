import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import UploadProgress from "@/components/features/uploads/UploadProgress.vue";

describe("UploadProgress", () => {
  it("reports progress as a percentage and draws the run from it", () => {
    const wrapper = mount(UploadProgress, {
      props: { progress: 0.426, status: "uploading", label: "Uploading a.png" }
    });

    expect(wrapper.attributes()).toMatchObject({
      role: "progressbar",
      "aria-label": "Uploading a.png",
      "aria-valuenow": "43",
      style: "--progress: 0.426;"
    });
    expect(wrapper.classes()).toContain("track--uploading");
  });
});
