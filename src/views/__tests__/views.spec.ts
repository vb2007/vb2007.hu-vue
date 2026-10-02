import { describe, expect, it, vi } from "vitest";
import HomeView from "@/views/HomeView.vue";
import LoginView from "@/views/LoginView.vue";
import RegisterView from "@/views/RegisterView.vue";
import ShortenView from "@/views/ShortenView.vue";
import HomeHero from "@/components/features/home/HomeHero.vue";
import RouteMap from "@/components/features/home/RouteMap.vue";
import LoginForm from "@/components/features/auth/LoginForm.vue";
import RegisterForm from "@/components/features/auth/RegisterForm.vue";
import ShortenPanel from "@/components/features/shorten/ShortenPanel.vue";
import PageSection from "@/components/layout/PageSection.vue";
import { TOOLS_LINE } from "@/constants/stops";
import { mountWithRouter } from "@/__tests__/helpers/mount";

vi.mock("@/scripts/authentication/user", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/scripts/authentication/user")>()),
  restoreSession: vi.fn(() => Promise.resolve())
}));

describe("views", () => {
  it("HomeView shows the hero and the route map", async () => {
    const { wrapper } = await mountWithRouter(HomeView);

    expect(wrapper.findComponent(HomeHero).exists()).toBe(true);
    expect(wrapper.find("#route-map-title").text()).toBe("Route map");
    expect(wrapper.findComponent(RouteMap).props()).toMatchObject({
      line: TOOLS_LINE,
      hereId: "home",
      initialId: "paste"
    });
  });

  it.each([
    ["LoginView", LoginView, LoginForm],
    ["RegisterView", RegisterView, RegisterForm],
    ["ShortenView", ShortenView, ShortenPanel]
  ])("%s wraps its feature in a narrow section", async (_name, view, feature) => {
    const { wrapper } = await mountWithRouter(view);

    expect(wrapper.findComponent(PageSection).props("width")).toBe("narrow");
    expect(wrapper.findComponent(feature).exists()).toBe(true);
  });

  it("ShortenView uses the panel as the page heading", async () => {
    const { wrapper } = await mountWithRouter(ShortenView);

    expect(wrapper.findComponent(ShortenPanel).props("as")).toBe("h1");
  });
});
