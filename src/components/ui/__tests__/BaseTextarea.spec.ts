import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import BaseTextarea from "@/components/ui/BaseTextarea.vue";

describe("BaseTextarea", () => {
  it("renders a plain labelled textarea by default", () => {
    const wrapper = mount(BaseTextarea, { props: { label: "Text" } });
    const textarea = wrapper.find("textarea");

    expect(wrapper.find("label").text()).toBe("Text");
    expect(wrapper.find("label").attributes("for")).toBe(textarea.attributes("id"));
    expect(textarea.attributes("rows")).toBe("8");
    expect(textarea.attributes("aria-invalid")).toBeUndefined();
    expect(textarea.attributes("aria-describedby")).toBeUndefined();
    expect(textarea.classes()).not.toContain("field__input--mono");
    expect(wrapper.find(".field__count").exists()).toBe(false);
    expect(wrapper.find(".field__hint").exists()).toBe(false);
    expect(wrapper.find(".field__error").exists()).toBe(false);
  });

  it("passes the textarea attributes through", () => {
    const wrapper = mount(BaseTextarea, {
      props: { label: "Text", placeholder: "Type here", rows: 3, required: true, mono: true }
    });
    const textarea = wrapper.find("textarea");

    expect(textarea.attributes()).toMatchObject({ placeholder: "Type here", rows: "3" });
    expect(textarea.attributes("required")).toBeDefined();
    expect(textarea.classes()).toContain("field__input--mono");
  });

  it("describes the textarea with its hint and error", () => {
    const wrapper = mount(BaseTextarea, {
      props: { label: "Text", hint: "Be nice", error: "Too short" }
    });
    const textarea = wrapper.find("textarea");
    const hint = wrapper.find(".field__hint");
    const error = wrapper.find(".field__error");

    expect(hint.text()).toBe("Be nice");
    expect(error.text()).toBe("Too short");
    expect(textarea.attributes("aria-describedby")).toBe(
      `${hint.attributes("id")} ${error.attributes("id")}`
    );
    expect(textarea.attributes("aria-invalid")).toBe("true");
    expect(wrapper.classes()).toContain("field--invalid");
  });

  it("describes the textarea with just a hint", () => {
    const wrapper = mount(BaseTextarea, { props: { label: "Text", hint: "Be nice" } });

    expect(wrapper.find("textarea").attributes("aria-describedby")).toBe(
      wrapper.find(".field__hint").attributes("id")
    );
  });

  it("counts characters against the maximum and flags going over", async () => {
    const wrapper = mount(BaseTextarea, {
      props: {
        label: "Text",
        maxCount: 5,
        modelValue: "abc",
        "onUpdate:modelValue": (value: string) => wrapper.setProps({ modelValue: value })
      }
    });
    const count = () => wrapper.find(".field__count");
    expect(count().text()).toBe("3 / 5");
    expect(count().classes()).not.toContain("field__count--over");

    await wrapper.find("textarea").setValue("abcdef");

    expect(wrapper.props("modelValue")).toBe("abcdef");
    expect(count().text()).toBe("6 / 5");
    expect(count().classes()).toContain("field__count--over");
  });
});
