import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import StatusPill from "@/components/ui/StatusPill.vue";
import AppIcon from "@/components/ui/AppIcon.vue";

describe("StatusPill", () => {
  it("is a muted pill without an icon by default", () => {
    const wrapper = mount(StatusPill, { slots: { default: "Custom quota" } });

    expect(wrapper.text()).toBe("Custom quota");
    expect(wrapper.classes()).toEqual(["pill", "pill--muted"]);
    expect(wrapper.findComponent(AppIcon).exists()).toBe(false);
  });

  it("takes a tone and an icon", () => {
    const wrapper = mount(StatusPill, {
      props: { tone: "ok", icon: "check" },
      slots: { default: "Confirmed" }
    });

    expect(wrapper.classes()).toContain("pill--ok");
    expect(wrapper.findComponent(AppIcon).props()).toMatchObject({ name: "check", size: 14 });
  });
});
