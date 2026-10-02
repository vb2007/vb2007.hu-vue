import { describe, expect, it, vi } from "vitest";
import { flushPromises } from "@vue/test-utils";
import App from "@/App.vue";
import AppNavbar from "@/components/layout/AppNavbar.vue";
import AppFooter from "@/components/layout/AppFooter.vue";
import HomeView from "@/views/HomeView.vue";
import LoginView from "@/views/LoginView.vue";
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
});
