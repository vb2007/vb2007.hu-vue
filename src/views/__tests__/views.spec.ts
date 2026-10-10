import { describe, expect, it, vi } from "vitest";
import { flushPromises } from "@vue/test-utils";
import HomeView from "@/views/HomeView.vue";
import LoginView from "@/views/LoginView.vue";
import RegisterView from "@/views/RegisterView.vue";
import ShortenView from "@/views/ShortenView.vue";
import PastebinView from "@/views/PastebinView.vue";
import PasteView from "@/views/PasteView.vue";
import HomeHero from "@/components/features/home/HomeHero.vue";
import RouteMap from "@/components/features/home/RouteMap.vue";
import LoginForm from "@/components/features/auth/LoginForm.vue";
import RegisterForm from "@/components/features/auth/RegisterForm.vue";
import ShortenPanel from "@/components/features/shorten/ShortenPanel.vue";
import PasteComposer from "@/components/features/pastebin/PasteComposer.vue";
import PasteList from "@/components/features/pastebin/PasteList.vue";
import PasteViewer from "@/components/features/pastebin/PasteViewer.vue";
import PageSection from "@/components/layout/PageSection.vue";
import { TOOLS_LINE } from "@/constants/stops";
import { isLoggedIn } from "@/scripts/authentication/authState";
import { jsonResponse, mockFetch } from "@/__tests__/helpers/fetch";
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
    ["ShortenView", ShortenView, ShortenPanel],
    ["PastebinView", PastebinView, PasteComposer]
  ])("%s wraps its feature in a narrow section", async (_name, view, feature) => {
    const { wrapper } = await mountWithRouter(view);

    expect(wrapper.findComponent(PageSection).props("width")).toBe("narrow");
    expect(wrapper.findComponent(feature).exists()).toBe(true);
  });

  it("ShortenView uses the panel as the page heading", async () => {
    const { wrapper } = await mountWithRouter(ShortenView);

    expect(wrapper.findComponent(ShortenPanel).props("as")).toBe("h1");
  });

  it("PastebinView shows the composer as the page heading and no list when logged out", async () => {
    const { wrapper } = await mountWithRouter(PastebinView);

    expect(wrapper.findComponent(PasteComposer).props("as")).toBe("h1");
    expect(wrapper.findComponent(PasteList).exists()).toBe(false);
  });

  it("PastebinView refreshes the list when a paste is created", async () => {
    isLoggedIn.value = true;
    const fetchMock = mockFetch();
    fetchMock.mockResolvedValue(jsonResponse(200, { pastes: [], pagination: null }));
    const { wrapper } = await mountWithRouter(PastebinView);
    await flushPromises();
    expect(wrapper.findComponent(PasteList).exists()).toBe(true);
    // Views mounted by earlier tests are still alive and load their own lists on login, so count from here.
    fetchMock.mockClear();

    wrapper.findComponent(PasteComposer).vm.$emit("created", { _id: "p1" });
    await flushPromises();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toContain("page=1");
  });

  it("PasteView shows the paste from the route as the page heading", async () => {
    mockFetch().mockResolvedValue(jsonResponse(404, { error: "Not found." }));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { wrapper } = await mountWithRouter(PasteView, { props: { id: "p1" } });

    expect(wrapper.findComponent(PageSection).props("width")).toBe("narrow");
    expect(wrapper.findComponent(PasteViewer).props()).toMatchObject({ id: "p1", as: "h1" });
  });
});
