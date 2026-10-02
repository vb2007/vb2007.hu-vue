import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import BaseButton from "@/components/ui/BaseButton.vue";
import { mountWithRouter } from "@/__tests__/helpers/mount";

describe("BaseButton", () => {
  it("renders a primary, medium button by default", () => {
    const wrapper = mount(BaseButton, { slots: { default: "Save" } });

    expect(wrapper.element.tagName).toBe("BUTTON");
    expect(wrapper.attributes("type")).toBe("button");
    expect(wrapper.attributes("disabled")).toBeUndefined();
    expect(wrapper.attributes("aria-busy")).toBeUndefined();
    expect(wrapper.classes()).toEqual(["btn", "btn--primary", "btn--md"]);
    expect(wrapper.text()).toBe("Save");
  });

  it("applies variant, size and state modifiers", () => {
    const wrapper = mount(BaseButton, {
      props: { variant: "ghost", size: "sm", type: "submit", block: true, error: true }
    });

    expect(wrapper.attributes("type")).toBe("submit");
    expect(wrapper.classes()).toEqual(
      expect.arrayContaining(["btn--ghost", "btn--sm", "btn--block", "btn--error"])
    );
  });

  it("is disabled and busy while loading", () => {
    const wrapper = mount(BaseButton, { props: { loading: true } });

    expect(wrapper.attributes("disabled")).toBeDefined();
    expect(wrapper.attributes("aria-busy")).toBe("true");
    expect(wrapper.classes()).toContain("btn--loading");
  });

  it("can be disabled without loading", () => {
    const wrapper = mount(BaseButton, { props: { disabled: true } });

    expect(wrapper.attributes("disabled")).toBeDefined();
    expect(wrapper.attributes("aria-busy")).toBeUndefined();
  });

  it("renders a router link when given a destination", async () => {
    const { wrapper } = await mountWithRouter(BaseButton, {
      props: { to: "/login" },
      slots: { default: "Log in" }
    });

    expect(wrapper.element.tagName).toBe("A");
    expect(wrapper.attributes("href")).toBe("/login");
    expect(wrapper.attributes("type")).toBeUndefined();
    expect(wrapper.classes()).toContain("btn");
  });
});
