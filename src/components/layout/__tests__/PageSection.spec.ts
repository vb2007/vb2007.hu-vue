import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import PageSection from "@/components/layout/PageSection.vue";

describe("PageSection", () => {
  it("is wide by default and renders its slot", () => {
    const wrapper = mount(PageSection, { slots: { default: "<p>Content</p>" } });

    expect(wrapper.classes()).toEqual(["page", "page--wide"]);
    expect(wrapper.html()).toContain("<p>Content</p>");
  });

  it("can be narrow", () => {
    const wrapper = mount(PageSection, { props: { width: "narrow" } });

    expect(wrapper.classes()).toContain("page--narrow");
  });
});
