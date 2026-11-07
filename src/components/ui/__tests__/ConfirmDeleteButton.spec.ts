import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import AppIcon from "@/components/ui/AppIcon.vue";
import BaseButton from "@/components/ui/BaseButton.vue";
import ConfirmDeleteButton from "@/components/ui/ConfirmDeleteButton.vue";

describe("ConfirmDeleteButton", () => {
  it("is a quiet Delete key until armed", async () => {
    const wrapper = mount(ConfirmDeleteButton, { props: { armed: false } });
    const button = wrapper.findComponent(BaseButton);

    expect(wrapper.text()).toBe("Delete");
    expect(button.props()).toMatchObject({
      size: "sm",
      variant: "ghost",
      error: false,
      loading: false
    });
    expect(wrapper.findComponent(AppIcon).exists()).toBe(false);

    await wrapper.trigger("click");
    expect(wrapper.emitted("click")).toHaveLength(1);
  });

  it("turns solid red asking for the second click", () => {
    const wrapper = mount(ConfirmDeleteButton, { props: { armed: true, icon: true } });

    expect(wrapper.text()).toBe("Confirm delete");
    expect(wrapper.findComponent(BaseButton).props()).toMatchObject({
      variant: "primary",
      error: true
    });
    expect(wrapper.findComponent(AppIcon).props()).toMatchObject({ name: "trash", size: 16 });
  });

  it("shows the delete running, with what the slot adds", () => {
    const wrapper = mount(ConfirmDeleteButton, {
      props: { armed: false, busy: true },
      slots: { default: '<span class="visually-hidden">notes.txt</span>' }
    });

    expect(wrapper.text()).toBe("Deleting notes.txt");
    expect(wrapper.findComponent(BaseButton).props("loading")).toBe(true);
    expect(wrapper.attributes("disabled")).toBeDefined();
  });
});
