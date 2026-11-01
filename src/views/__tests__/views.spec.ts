import { afterEach, describe, expect, it, vi } from "vitest";
import { enableAutoUnmount, flushPromises } from "@vue/test-utils";
import HomeView from "@/views/HomeView.vue";
import LoginView from "@/views/LoginView.vue";
import RegisterView from "@/views/RegisterView.vue";
import PasswordResetView from "@/views/PasswordResetView.vue";
import ShortenView from "@/views/ShortenView.vue";
import PastebinView from "@/views/PastebinView.vue";
import PasteView from "@/views/PasteView.vue";
import RedirectView from "@/views/RedirectView.vue";
import UploadView from "@/views/UploadView.vue";
import AdminView from "@/views/AdminView.vue";
import AccountView from "@/views/AccountView.vue";
import AdminUserUploadsView from "@/views/AdminUserUploadsView.vue";
import AdminUserList from "@/components/features/admin/AdminUserList.vue";
import AccountPanel from "@/components/features/account/AccountPanel.vue";
import HomeHero from "@/components/features/home/HomeHero.vue";
import ToolDirectory from "@/components/features/home/ToolDirectory.vue";
import LoginForm from "@/components/features/auth/LoginForm.vue";
import RegisterForm from "@/components/features/auth/RegisterForm.vue";
import PasswordResetForm from "@/components/features/auth/PasswordResetForm.vue";
import ShortenPanel from "@/components/features/shorten/ShortenPanel.vue";
import PasteComposer from "@/components/features/pastebin/PasteComposer.vue";
import PasteList from "@/components/features/pastebin/PasteList.vue";
import PasteViewer from "@/components/features/pastebin/PasteViewer.vue";
import ShortLinkResolver from "@/components/features/redirect/ShortLinkResolver.vue";
import UploadComposer from "@/components/features/uploads/UploadComposer.vue";
import UploadList from "@/components/features/uploads/UploadList.vue";
import UsageMeter from "@/components/features/uploads/UsageMeter.vue";
import PageSection from "@/components/layout/PageSection.vue";
import { TOOLS_LINE } from "@/constants/stops";
import { isLoggedIn, isSessionChecked, isSuperuser } from "@/scripts/authentication/authState";
import { jsonResponse, mockFetch } from "@/__tests__/helpers/fetch";
import { mountWithRouter } from "@/__tests__/helpers/mount";

vi.mock("@/scripts/authentication/user", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/scripts/authentication/user")>()),
  restoreSession: vi.fn(() => Promise.resolve())
}));

// The upload page loads storage on login, so a view left over from an earlier test would read
// that test's mock responses.
enableAutoUnmount(afterEach);

describe("views", () => {
  it("HomeView shows the hero and every destination except home", async () => {
    const { wrapper } = await mountWithRouter(HomeView);

    expect(wrapper.findComponent(HomeHero).exists()).toBe(true);
    expect(wrapper.find("#tools-title").text()).toBe("Tools");
    expect(wrapper.findComponent(ToolDirectory).props("stops")).toEqual(
      TOOLS_LINE.stops.filter((stop) => stop.id !== "home")
    );
  });

  it.each([
    ["LoginView", LoginView, LoginForm],
    ["RegisterView", RegisterView, RegisterForm],
    ["PasswordResetView", PasswordResetView, PasswordResetForm],
    ["AccountView", AccountView, AccountPanel],
    ["ShortenView", ShortenView, ShortenPanel],
    ["PastebinView", PastebinView, PasteComposer],
    ["UploadView", UploadView, UploadComposer]
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
    expect(wrapper.findComponent(PageSection).props("width")).toBe("narrow");
    expect(wrapper.find(".workspace").classes()).not.toContain("workspace--split");
  });

  it("PastebinView refreshes the list when a paste is created", async () => {
    isLoggedIn.value = true;
    const fetchMock = mockFetch();
    fetchMock.mockResolvedValue(jsonResponse(200, { pastes: [], pagination: null }));
    const { wrapper } = await mountWithRouter(PastebinView);
    await flushPromises();
    expect(wrapper.findComponent(PasteList).exists()).toBe(true);
    expect(wrapper.findComponent(PageSection).props("width")).toBe("wide");
    expect(wrapper.find(".workspace").classes()).toContain("workspace--split");
    // Views mounted by earlier tests are still alive and load their own lists on login, so count from here.
    fetchMock.mockClear();

    wrapper.findComponent(PasteComposer).vm.$emit("created", { _id: "p1" });
    await flushPromises();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toContain("page=1");
  });

  it("UploadView shows the composer as the page heading and nothing else when logged out", async () => {
    const fetchMock = mockFetch();
    const { wrapper } = await mountWithRouter(UploadView);

    expect(wrapper.findComponent(UploadComposer).props("as")).toBe("h1");
    expect(wrapper.findComponent(UploadList).exists()).toBe(false);
    expect(wrapper.findComponent(UsageMeter).exists()).toBe(false);
    expect(wrapper.find(".workspace").classes()).not.toContain("workspace--split");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("UploadView loads storage once logged in and refreshes after uploads and deletes", async () => {
    const usage = {
      usedBytes: 10,
      quotaBytes: 100,
      count: 1,
      maxFileSizeBytes: 50,
      allowedTypes: [],
      byCategory: []
    };
    const fetchMock = mockFetch();
    fetchMock.mockImplementation((url) =>
      Promise.resolve(
        String(url).endsWith("/uploads/usage")
          ? jsonResponse(200, usage)
          : jsonResponse(200, { uploads: [], pagination: null })
      )
    );
    const { wrapper } = await mountWithRouter(UploadView);
    isLoggedIn.value = true;
    await flushPromises();

    expect(wrapper.findComponent(PageSection).props("width")).toBe("wide");
    expect(wrapper.find(".workspace").classes()).toContain("workspace--split");
    expect(wrapper.findComponent(UsageMeter).props("usage")).toEqual(usage);
    expect(wrapper.findComponent(UploadComposer).props("usage")).toEqual(usage);
    // Views mounted by earlier tests are still alive and load on login, so count from here.
    fetchMock.mockClear();

    wrapper.findComponent(UploadComposer).vm.$emit("uploaded", { id: "u1" });
    await flushPromises();
    const urls = fetchMock.mock.calls.map(([url]) => String(url));
    expect(urls).toContain("https://api.test/uploads/usage");
    expect(
      urls.some((url) => url.startsWith("https://api.test/uploads?") && url.includes("page=1"))
    ).toBe(true);

    fetchMock.mockClear();
    wrapper.findComponent(UploadList).vm.$emit("changed");
    await flushPromises();
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([
      "https://api.test/uploads/usage"
    ]);
  });

  it("AdminView shows nothing until the session is known", async () => {
    const { wrapper } = await mountWithRouter(AdminView);

    expect(wrapper.find("h1").exists()).toBe(false);
  });

  it("AdminView asks a visitor to log in", async () => {
    isSessionChecked.value = true;
    const { wrapper } = await mountWithRouter(AdminView);

    expect(wrapper.findComponent(PageSection).props("width")).toBe("narrow");
    expect(wrapper.find("h1").text()).toBe("Admin");
    expect(wrapper.find(".status").text()).toBe("Log in with the admin account to open this page.");
    expect(wrapper.find('a[href="/login"]').exists()).toBe(true);
    expect(wrapper.findComponent(AdminUserList).exists()).toBe(false);
  });

  it("AdminView turns away a logged-in user who isn't the admin", async () => {
    isSessionChecked.value = true;
    isLoggedIn.value = true;
    const { wrapper } = await mountWithRouter(AdminView);

    expect(wrapper.find(".status").text()).toBe("This page is only for the site's admin.");
    expect(wrapper.find('a[href="/"]').text()).toBe("Back to home");
  });

  it("AdminView shows the superuser the quotas board as the page heading", async () => {
    mockFetch().mockResolvedValue(jsonResponse(200, { users: [], pagination: null }));
    isSessionChecked.value = true;
    isLoggedIn.value = true;
    isSuperuser.value = true;
    const { wrapper } = await mountWithRouter(AdminView);

    expect(wrapper.findComponent(PageSection).props("width")).toBe("wide");
    expect(wrapper.findComponent(AdminUserList).props("as")).toBe("h1");
  });

  it("AdminUserUploadsView gates everyone but the superuser", async () => {
    isSessionChecked.value = true;
    const { wrapper } = await mountWithRouter(AdminUserUploadsView, { props: { id: "u9" } });

    expect(wrapper.findComponent(PageSection).props("width")).toBe("narrow");
    expect(wrapper.find("h1").text()).toBe("Admin");
    expect(wrapper.findComponent(UploadList).exists()).toBe(false);
  });

  it("AdminUserUploadsView lists the user's uploads with a way back", async () => {
    const fetchMock = mockFetch();
    fetchMock.mockResolvedValue(jsonResponse(200, { uploads: [], pagination: null }));
    isSessionChecked.value = true;
    isLoggedIn.value = true;
    isSuperuser.value = true;
    const { wrapper } = await mountWithRouter(AdminUserUploadsView, { props: { id: "u 9" } });
    await flushPromises();

    expect(wrapper.findComponent(PageSection).props("width")).toBe("medium");
    expect(wrapper.find('a[href="/admin"]').text()).toBe("All users");
    expect(wrapper.findComponent(UploadList).props()).toMatchObject({
      listUrl: "https://api.test/admin/users/u%209/uploads",
      as: "h1"
    });
    expect(String(fetchMock.mock.calls[0][0])).toMatch(
      /^https:\/\/api\.test\/admin\/users\/u%209\/uploads\?/
    );
  });

  it("PasteView shows the paste from the route as the page heading", async () => {
    mockFetch().mockResolvedValue(jsonResponse(404, { error: "Not found." }));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { wrapper } = await mountWithRouter(PasteView, { props: { id: "p1" } });

    expect(wrapper.findComponent(PageSection).props("width")).toBe("medium");
    expect(wrapper.findComponent(PasteViewer).props()).toMatchObject({ id: "p1", as: "h1" });
  });

  it("RedirectView resolves the code from the route", async () => {
    mockFetch().mockResolvedValue(jsonResponse(404, { error: "Not found." }));
    const { wrapper } = await mountWithRouter(RedirectView, { props: { code: "abc123" } });

    expect(wrapper.findComponent(PageSection).props("width")).toBe("narrow");
    expect(wrapper.findComponent(ShortLinkResolver).props("code")).toBe("abc123");
  });

  it("RedirectView passes the preview flag on", async () => {
    mockFetch().mockResolvedValue(jsonResponse(404, { error: "Not found." }));
    const { wrapper } = await mountWithRouter(RedirectView, {
      props: { code: "abc123", preview: true }
    });

    expect(wrapper.findComponent(ShortLinkResolver).props("preview")).toBe(true);
  });
});
