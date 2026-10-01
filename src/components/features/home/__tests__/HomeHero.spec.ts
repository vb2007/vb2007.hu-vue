import { describe, expect, it } from "vitest";
import HomeHero from "@/components/features/home/HomeHero.vue";
import ShortenPanel from "@/components/features/shorten/ShortenPanel.vue";
import { mountWithRouter } from "@/__tests__/helpers/mount";

describe("HomeHero", () => {
  it("welcomes the visitor next to the shortener", async () => {
    const { wrapper } = await mountWithRouter(HomeHero);

    expect(wrapper.find("h1").text()).toBe("Welcome home");
    expect(wrapper.findComponent(ShortenPanel).exists()).toBe(true);
  });
});
