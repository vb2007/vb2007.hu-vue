import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import BaseCheckbox from "@/components/ui/BaseCheckbox.vue";

describe("BaseCheckbox", () => {
  it("links the label to the checkbox", () => {
    const wrapper = mount(BaseCheckbox, { props: { label: "Remember me" } });
    const input = wrapper.find("input");

    expect(wrapper.text()).toBe("Remember me");
    expect(wrapper.attributes("for")).toBe(input.attributes("id"));
    expect(input.element.checked).toBe(false);
  });

  it("supports v-model", async () => {
    const wrapper = mount(BaseCheckbox, {
      props: {
        label: "Remember me",
        modelValue: true,
        "onUpdate:modelValue": (value: boolean) => wrapper.setProps({ modelValue: value })
      }
    });
    const input = wrapper.find("input");
    expect(input.element.checked).toBe(true);

    await input.setValue(false);

    expect(wrapper.props("modelValue")).toBe(false);
  });
});
