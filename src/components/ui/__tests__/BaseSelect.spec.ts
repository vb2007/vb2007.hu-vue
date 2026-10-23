import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import BaseSelect from "@/components/ui/BaseSelect.vue";

const options = [
  { value: "new", label: "Newest" },
  { value: "old", label: "Oldest" }
];

describe("BaseSelect", () => {
  it("labels a select with the options and the chosen one selected", () => {
    const wrapper = mount(BaseSelect, { props: { label: "Sort", options, modelValue: "old" } });

    const select = wrapper.find<HTMLSelectElement>("select");
    expect(wrapper.find("label").attributes("for")).toBe(select.attributes("id"));
    expect(wrapper.find("label").text()).toBe("Sort");
    expect(wrapper.findAll("option").map((option) => option.text())).toEqual(["Newest", "Oldest"]);
    expect(select.element.value).toBe("old");
    expect(wrapper.classes()).toContain("field--md");
  });

  it("updates the model on change", async () => {
    const wrapper = mount(BaseSelect, {
      props: { label: "Sort", options, modelValue: "old", size: "sm" }
    });

    await wrapper.find("select").setValue("new");

    expect(wrapper.emitted("update:modelValue")).toEqual([["new"]]);
    expect(wrapper.classes()).toContain("field--sm");
  });
});
