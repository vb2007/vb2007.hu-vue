import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import StatusMessage from "@/components/ui/StatusMessage.vue";
import AppIcon from "@/components/ui/AppIcon.vue";

describe("StatusMessage", () => {
  it.each([
    ["success", "status", "check"],
    ["error", "alert", "alert"],
    ["info", "status", "info"]
  ] as const)("renders the %s tone with role %s and the %s icon", (tone, role, icon) => {
    const wrapper = mount(StatusMessage, { props: { tone }, slots: { default: "Hello" } });

    expect(wrapper.classes()).toContain(`status--${tone}`);
    expect(wrapper.attributes("role")).toBe(role);
    expect(wrapper.findComponent(AppIcon).props("name")).toBe(icon);
    expect(wrapper.text()).toBe("Hello");
  });
});
