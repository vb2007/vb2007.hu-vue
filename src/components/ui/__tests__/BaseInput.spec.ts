import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import BaseInput from "@/components/ui/BaseInput.vue";

describe("BaseInput", () => {
  it("renders a plain labelled text input by default", () => {
    const wrapper = mount(BaseInput, { props: { label: "Name" } });
    const input = wrapper.find("input");

    expect(wrapper.find("label").text()).toBe("Name");
    expect(wrapper.find("label").attributes("for")).toBe(input.attributes("id"));
    expect(input.attributes("type")).toBe("text");
    expect(input.attributes("aria-invalid")).toBeUndefined();
    expect(input.attributes("aria-describedby")).toBeUndefined();
    expect(input.classes()).not.toContain("field__input--mono");
    expect(wrapper.find(".field__hint").exists()).toBe(false);
    expect(wrapper.find(".field__error").exists()).toBe(false);
  });

  it("passes the input attributes through", () => {
    const wrapper = mount(BaseInput, {
      props: {
        label: "E-mail",
        type: "email",
        placeholder: "me@example.com",
        autocomplete: "email",
        required: true,
        mono: true
      }
    });
    const input = wrapper.find("input");

    expect(input.attributes()).toMatchObject({
      type: "email",
      placeholder: "me@example.com",
      autocomplete: "email"
    });
    expect(input.attributes("required")).toBeDefined();
    expect(input.classes()).toContain("field__input--mono");
  });

  it("describes the input with its hint and error", () => {
    const wrapper = mount(BaseInput, {
      props: { label: "URL", hint: "Include https://", error: "Invalid URL" }
    });
    const input = wrapper.find("input");
    const hint = wrapper.find(".field__hint");
    const error = wrapper.find(".field__error");

    expect(hint.text()).toBe("Include https://");
    expect(error.text()).toBe("Invalid URL");
    expect(input.attributes("aria-describedby")).toBe(
      `${hint.attributes("id")} ${error.attributes("id")}`
    );
    expect(input.attributes("aria-invalid")).toBe("true");
    expect(wrapper.classes()).toContain("field--invalid");
  });

  it("describes the input with just a hint", () => {
    const wrapper = mount(BaseInput, { props: { label: "URL", hint: "Include https://" } });

    expect(wrapper.find("input").attributes("aria-describedby")).toBe(
      wrapper.find(".field__hint").attributes("id")
    );
  });

  it("supports v-model", async () => {
    const wrapper = mount(BaseInput, {
      props: {
        label: "Name",
        modelValue: "old",
        "onUpdate:modelValue": (value: string) => wrapper.setProps({ modelValue: value })
      }
    });
    expect(wrapper.find("input").element.value).toBe("old");

    await wrapper.find("input").setValue("new");

    expect(wrapper.props("modelValue")).toBe("new");
  });
});
