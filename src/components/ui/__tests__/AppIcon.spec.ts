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

  it("draws brand marks filled, on their own grid", () => {
    const wrapper = mount(AppIcon, { props: { name: "github" } });

    expect(wrapper.attributes()).toMatchObject({
      width: "20",
      height: "20",
      viewBox: "0 0 16 16",
      fill: "currentColor",
      "aria-hidden": "true"
    });
    expect(wrapper.attributes("stroke")).toBeUndefined();
    expect(wrapper.find("path").attributes("d")).toMatch(/^M8 0C3\.58/);
  });

  it.each(["menu", "github"] as const)("draws %s at the given size", (name) => {
    const wrapper = mount(AppIcon, { props: { name, size: 32 } });

    expect(wrapper.attributes()).toMatchObject({ width: "32", height: "32" });
  });
});
