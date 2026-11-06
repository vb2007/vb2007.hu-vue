import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import ListPager from "@/components/ui/ListPager.vue";

const buttons = (wrapper: ReturnType<typeof mount>) => {
  const [previous, next] = wrapper.findAll("button");
  return { previous, next };
};

describe("ListPager", () => {
  it("is hidden while everything fits on one page", () => {
    for (const pages of [0, 1]) {
      const wrapper = mount(ListPager, { props: { page: 1, pages } });
      expect(wrapper.find("nav").exists()).toBe(false);
    }
  });

  it("says where it is, and can't go back from the first page", async () => {
    const wrapper = mount(ListPager, { props: { page: 1, pages: 3 } });
    const { previous, next } = buttons(wrapper);

    expect(wrapper.find("nav").attributes("aria-label")).toBe("Pages");
    expect(wrapper.find(".pager__label").text()).toBe("Page 1 of 3");
    expect(previous.text()).toBe("Previous");
    expect(previous.attributes("disabled")).toBeDefined();
    expect(next.attributes("disabled")).toBeUndefined();

    await next.trigger("click");
    expect(wrapper.emitted("go")).toEqual([[2]]);
  });

  it("goes back, and can't go past the last page", async () => {
    const wrapper = mount(ListPager, { props: { page: 3, pages: 3 } });
    const { previous, next } = buttons(wrapper);

    expect(next.attributes("disabled")).toBeDefined();
    await previous.trigger("click");
    expect(wrapper.emitted("go")).toEqual([[2]]);
  });

  it("disables both keys while disabled, e.g. during a load", () => {
    const wrapper = mount(ListPager, { props: { page: 2, pages: 3, disabled: true } });
    const { previous, next } = buttons(wrapper);

    expect(previous.attributes("disabled")).toBeDefined();
    expect(next.attributes("disabled")).toBeDefined();
  });
});
