import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import StopMarker from "@/components/ui/StopMarker.vue";

describe("StopMarker", () => {
  it("reflects the stop status", () => {
    const wrapper = mount(StopMarker, { props: { status: "planned" } });

    expect(wrapper.classes()).toEqual(["marker", "marker--planned"]);
    expect(wrapper.attributes("aria-hidden")).toBe("true");
  });

  it("highlights the current stop", () => {
    const wrapper = mount(StopMarker, { props: { status: "open", current: true } });

    expect(wrapper.classes()).toEqual(["marker", "marker--open", "marker--here"]);
  });
});
