import { describe, expect, it, vi } from "vitest";
import AppFooter from "@/components/layout/AppFooter.vue";
import { mountWithRouter } from "@/__tests__/helpers/mount";
import { isLoggedIn } from "@/scripts/authentication/authState";

describe("AppFooter", () => {
  it("shows the current year and the footer links", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2031-01-01T00:00:00Z"));

    const { wrapper } = await mountWithRouter(AppFooter);

    expect(wrapper.find(".foot__meta").text()).toContain("2023 – 2031");
    expect(wrapper.findAll(".foot__links a").map((link) => link.attributes("href"))).toEqual([
      "/shorten",
      "/pastebin",
      "/login",
      "/register"
    ]);
  });

  it("links the account instead of logging in once logged in", async () => {
    isLoggedIn.value = true;

    const { wrapper } = await mountWithRouter(AppFooter);

    expect(wrapper.findAll(".foot__links a").map((link) => link.attributes("href"))).toEqual([
      "/shorten",
      "/pastebin",
      "/account"
    ]);
  });
});
