import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import SegmentedControl from "@/components/ui/SegmentedControl.vue";
import AppIcon from "@/components/ui/AppIcon.vue";

const options = [
  { value: "a", label: "First", icon: "lock" as const },
  { value: "b", label: "Second" }
];

describe("SegmentedControl", () => {
  it("draws a radio per option under a legend, with the model checked", () => {
    const wrapper = mount(SegmentedControl, {
      props: { legend: "Pick one", options, modelValue: "b" }
    });

    expect(wrapper.find("legend").text()).toBe("Pick one");
    expect(wrapper.find("legend").classes()).not.toContain("visually-hidden");
    expect(wrapper.classes()).toContain("segments--md");
    const radios = wrapper.findAll<HTMLInputElement>("input[type=radio]");
    expect(radios.map((radio) => radio.element.checked)).toEqual([false, true]);
    expect(radios[0].attributes("name")).toBe(radios[1].attributes("name"));
    expect(wrapper.findAll(".segment__key").map((key) => key.text())).toEqual(["First", "Second"]);
    expect(wrapper.findComponent(AppIcon).props()).toMatchObject({ name: "lock", size: 18 });
  });

  it("updates the model when another option is picked", async () => {
    const wrapper = mount(SegmentedControl, {
      props: { legend: "Pick one", options, modelValue: "b", size: "sm", hideLegend: true }
    });

    await wrapper.findAll("input")[0].setValue();

    expect(wrapper.emitted("update:modelValue")).toEqual([["a"]]);
    expect(wrapper.classes()).toContain("segments--sm");
    expect(wrapper.find("legend").classes()).toContain("visually-hidden");
    expect(wrapper.findComponent(AppIcon).props("size")).toBe(16);
  });
});
