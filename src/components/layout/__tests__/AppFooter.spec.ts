import { describe, expect, it, vi } from "vitest";
import AppFooter from "@/components/layout/AppFooter.vue";
import { mountWithRouter } from "@/__tests__/helpers/mount";
import { TOOLS_LINE } from "@/constants/stops";
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
      "/upload",
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
      "/upload",
      "/account"
    ]);
  });

  it("doesn't link planned stops", async () => {
    const planned = TOOLS_LINE.stops.filter((stop) => stop.status === "planned");
    expect(planned.length).toBeGreaterThan(0);

    const { wrapper } = await mountWithRouter(AppFooter);
    const hrefs = wrapper.findAll(".foot__links a").map((link) => link.attributes("href"));

    for (const stop of planned) expect(hrefs).not.toContain(stop.to);
  });
});
