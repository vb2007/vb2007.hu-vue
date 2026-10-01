import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import StationBoard from "@/components/ui/StationBoard.vue";

describe("StationBoard", () => {
  it("renders the title as an h2 with the body slot", () => {
    const wrapper = mount(StationBoard, {
      props: { title: "Shorten" },
      slots: { default: "<p>Body</p>" }
    });

    expect(wrapper.find("h2").text()).toBe("Shorten");
    expect(wrapper.find(".board__body").html()).toContain("<p>Body</p>");
    expect(wrapper.find(".board__aside").exists()).toBe(false);
  });

  it("uses the requested heading level and renders the aside slot", () => {
    const wrapper = mount(StationBoard, {
      props: { title: "Log in", as: "h1" },
      slots: { aside: "<span>Extra</span>" }
    });

    expect(wrapper.find("h1").text()).toBe("Log in");
    expect(wrapper.find(".board__aside").text()).toBe("Extra");
  });
});
