import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import BrandMark from "@/components/ui/BrandMark.vue";

describe("BrandMark", () => {
  it("renders a decorative logo", () => {
    const wrapper = mount(BrandMark);

    expect(wrapper.element.tagName.toLowerCase()).toBe("svg");
    expect(wrapper.attributes("aria-hidden")).toBe("true");
  });
});
