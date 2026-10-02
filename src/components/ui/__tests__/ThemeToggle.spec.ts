import { beforeEach, describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import ThemeToggle from "@/components/ui/ThemeToggle.vue";
import { currentTheme, setTheme } from "@/scripts/utility/themeState";

describe("ThemeToggle", () => {
  beforeEach(() => {
    setTheme("light");
  });

  it("switches from light to dark and back", async () => {
    const wrapper = mount(ThemeToggle);
    expect(wrapper.attributes("aria-label")).toBe("Switch to dark theme");
    expect(wrapper.find(".toggle__icon").classes()).not.toContain("toggle__icon--dark");

    await wrapper.trigger("click");

    expect(currentTheme.value).toBe("dark");
    expect(wrapper.attributes("aria-label")).toBe("Switch to light theme");
    expect(wrapper.attributes("title")).toBe("Switch to light theme");
    expect(wrapper.find(".toggle__icon").classes()).toContain("toggle__icon--dark");

    await wrapper.trigger("click");

    expect(currentTheme.value).toBe("light");
  });
});
