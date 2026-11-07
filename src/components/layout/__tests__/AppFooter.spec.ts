import { describe, expect, it, vi } from "vitest";
import AppFooter from "@/components/layout/AppFooter.vue";
import { mountWithRouter } from "@/__tests__/helpers/mount";
import { PLANNED_STOP } from "@/__tests__/helpers/stops";
import { TOOLS_LINE } from "@/constants/stops";
import { isLoggedIn } from "@/scripts/authentication/authState";

// The real line has no planned stop today, so one is added to check the footer leaves it out.
vi.mock("@/constants/stops", async (importOriginal) =>
  (await import("@/__tests__/helpers/stops")).withPlannedStop(await importOriginal())
);

describe("AppFooter", () => {
  it("shows the footer links", async () => {
    const { wrapper } = await mountWithRouter(AppFooter);

    expect(wrapper.findAll(".foot__links a").map((link) => link.attributes("href"))).toEqual([
      "/shorten",
      "/pastebin",
      "/upload",
      "/login",
      "/register"
    ]);
  });

  it("names the e-mail address and the Matrix ID, each as its own link", async () => {
    const { wrapper } = await mountWithRouter(AppFooter);
    const [email, matrix] = wrapper.findAll(".foot__contact a");

    expect(wrapper.find(".foot__contact").element.tagName).toBe("ADDRESS");
    expect(wrapper.findAll(".foot__label").map((label) => label.text())).toEqual([
      "E-mail",
      "Matrix"
    ]);
    expect(email.text()).toBe("balazs@vb2007.hu");
    expect(email.attributes("href")).toBe("mailto:balazs@vb2007.hu");
    expect(email.attributes("target")).toBeUndefined();
    expect(matrix.text()).toBe("@vb2007:vb2007.hu (opens in a new tab)");
    expect(matrix.find(".visually-hidden").text()).toBe("(opens in a new tab)");
    expect(matrix.attributes("href")).toBe("https://matrix.to/#/@vb2007:vb2007.hu");
    expect(matrix.attributes("target")).toBe("_blank");
    expect(matrix.attributes("rel")).toBe("noopener");
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
    expect(TOOLS_LINE.stops).toContain(PLANNED_STOP);

    const { wrapper } = await mountWithRouter(AppFooter);
    const hrefs = wrapper.findAll("a").map((link) => link.attributes("href"));

    expect(hrefs).not.toContain(PLANNED_STOP.to);
  });
});
