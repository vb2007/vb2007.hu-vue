import { describe, expect, it, vi } from "vitest";
import { flushPromises } from "@vue/test-utils";
import App from "@/App.vue";
import AppNavbar from "@/components/layout/AppNavbar.vue";
import AppFooter from "@/components/layout/AppFooter.vue";
import HomeView from "@/views/HomeView.vue";
import LoginView from "@/views/LoginView.vue";
import NotFoundView from "@/views/NotFoundView.vue";
import ApiErrorView from "@/views/ApiErrorView.vue";
import { mountWithRouter } from "@/__tests__/helpers/mount";

vi.mock("@/scripts/authentication/user", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/scripts/authentication/user")>()),
  restoreSession: vi.fn(() => Promise.resolve())
}));

describe("App", () => {
  it("renders the shell around the current route", async () => {
    const { wrapper, router } = await mountWithRouter(App);

    expect(wrapper.find(".shell__skip").attributes("href")).toBe("#main");
    expect(wrapper.findComponent(AppNavbar).exists()).toBe(true);
    expect(wrapper.findComponent(AppFooter).exists()).toBe(true);
    expect(wrapper.find("main#main").findComponent(HomeView).exists()).toBe(true);

    await router.push("/login");
    await flushPromises();
    await vi.waitFor(() => expect(wrapper.findComponent(LoginView).exists()).toBe(true));
  });

  it("renders the not-found board inside main for an unknown path", async () => {
    const { wrapper } = await mountWithRouter(App, {}, "/no/such/page");

    await vi.waitFor(() =>
      expect(wrapper.find("main#main").findComponent(NotFoundView).exists()).toBe(true)
    );
    expect(wrapper.find("main#main h1").text()).toBe("Page not found");
  });

  it("renders the API error board, not the not-found one, for the API's redirect", async () => {
    const { wrapper } = await mountWithRouter(App, {}, "/apierror?url=%2Ffoo");

    await vi.waitFor(() =>
      expect(wrapper.find("main#main").findComponent(ApiErrorView).exists()).toBe(true)
    );
    expect(wrapper.find("main#main h1").text()).toBe("API route not found");
  });
});
