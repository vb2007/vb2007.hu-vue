import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises } from "@vue/test-utils";
import AppNavbar from "@/components/layout/AppNavbar.vue";
import RouteStrip from "@/components/ui/RouteStrip.vue";
import { isLoggedIn, isSessionChecked, userEmail } from "@/scripts/authentication/authState";
import { logout, restoreSession } from "@/scripts/authentication/user";
import { mountWithRouter } from "@/__tests__/helpers/mount";

vi.mock("@/scripts/authentication/user", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/scripts/authentication/user")>()),
  logout: vi.fn(),
  restoreSession: vi.fn()
}));

const mountNavbar = () => mountWithRouter(AppNavbar, { attachTo: document.body });

const toggle = (wrapper: Awaited<ReturnType<typeof mountNavbar>>["wrapper"]) =>
  wrapper.find(".bar__toggle");

const isOpen = (wrapper: Awaited<ReturnType<typeof mountNavbar>>["wrapper"]) =>
  wrapper.find("#site-menu").classes().includes("bar__menu--open");

describe("AppNavbar", () => {
  beforeEach(() => {
    vi.mocked(logout).mockReset();
    vi.mocked(restoreSession).mockReset();
  });

  it("checks the session on mount and shows no account actions until it is known", async () => {
    const { wrapper } = await mountNavbar();

    expect(restoreSession).toHaveBeenCalledOnce();
    expect(wrapper.find(".bar__account").text()).toBe("");
    wrapper.unmount();
  });

  it("offers log in and register once the visitor is known to be logged out", async () => {
    isSessionChecked.value = true;
    const { wrapper } = await mountNavbar();

    const links = wrapper.findAll(".bar__account a").map((link) => link.attributes("href"));
    expect(links).toEqual(["/login", "/register"]);
    wrapper.unmount();
  });

  it("shows the user's email and logs out", async () => {
    isLoggedIn.value = true;
    userEmail.value = "me@example.com";
    const { wrapper } = await mountNavbar();
    expect(wrapper.find(".bar__user").text()).toBe("me@example.com");
    expect(wrapper.find(".bar__user").attributes("title")).toBe("me@example.com");

    await toggle(wrapper).trigger("click");
    await wrapper.find(".bar__account button").trigger("click");
    await flushPromises();

    expect(logout).toHaveBeenCalledOnce();
    expect(isOpen(wrapper)).toBe(false);
    wrapper.unmount();
  });

  it("hides the email slot when the email is unknown", async () => {
    isLoggedIn.value = true;
    const { wrapper } = await mountNavbar();

    expect(wrapper.find(".bar__user").exists()).toBe(false);
    expect(wrapper.find(".bar__account button").text()).toBe("Log out");
    wrapper.unmount();
  });

  it("opens and closes the mobile menu with the toggle", async () => {
    const { wrapper } = await mountNavbar();
    expect(toggle(wrapper).attributes("aria-expanded")).toBe("false");
    expect(toggle(wrapper).text()).toBe("Open menu");

    await toggle(wrapper).trigger("click");
    expect(isOpen(wrapper)).toBe(true);
    expect(toggle(wrapper).attributes("aria-expanded")).toBe("true");
    expect(toggle(wrapper).text()).toBe("Close menu");

    await toggle(wrapper).trigger("click");
    expect(isOpen(wrapper)).toBe(false);
    wrapper.unmount();
  });

  it("closes the menu on Escape and ignores other keys", async () => {
    const { wrapper } = await mountNavbar();

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    await toggle(wrapper).trigger("click");
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    await flushPromises();
    expect(isOpen(wrapper)).toBe(true);

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    await flushPromises();
    expect(isOpen(wrapper)).toBe(false);
    wrapper.unmount();
  });

  it("closes the menu after navigating", async () => {
    const { wrapper, router } = await mountNavbar();
    await toggle(wrapper).trigger("click");

    await router.push("/login");
    await flushPromises();

    expect(isOpen(wrapper)).toBe(false);
    wrapper.unmount();
  });

  it("closes the menu when a stop in the vertical strip is chosen", async () => {
    const { wrapper } = await mountNavbar();
    await toggle(wrapper).trigger("click");

    wrapper.findAllComponents(RouteStrip)[1].vm.$emit("navigate");
    await flushPromises();

    expect(isOpen(wrapper)).toBe(false);
    wrapper.unmount();
  });

  it("stops listening for Escape once unmounted", async () => {
    const removeListener = vi.spyOn(window, "removeEventListener");
    const { wrapper } = await mountNavbar();

    wrapper.unmount();

    expect(removeListener).toHaveBeenCalledWith("keydown", expect.any(Function));
  });
});
