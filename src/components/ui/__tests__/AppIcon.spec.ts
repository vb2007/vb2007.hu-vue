import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import AppIcon from "@/components/ui/AppIcon.vue";

describe("AppIcon", () => {
  it("draws the named icon at the default size", () => {
    const wrapper = mount(AppIcon, { props: { name: "close" } });

    expect(wrapper.attributes()).toMatchObject({
      width: "20",
      height: "20",
      "aria-hidden": "true"
    });
    expect(wrapper.find("path").attributes("d")).toBe("M6 6l12 12M18 6L6 18");
  });

  it("uses the given size", () => {
    const wrapper = mount(AppIcon, { props: { name: "menu", size: 32 } });

    expect(wrapper.attributes()).toMatchObject({ width: "32", height: "32" });
  });
});
