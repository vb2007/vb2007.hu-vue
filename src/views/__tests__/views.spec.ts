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
import AdminAreaView from "@/views/AdminAreaView.vue";
import AdminUsersView from "@/views/AdminUsersView.vue";
import AdminPastesView from "@/views/AdminPastesView.vue";
import AdminShortLinksView from "@/views/AdminShortLinksView.vue";
import AdminShortLinkList from "@/components/features/admin/AdminShortLinkList.vue";
import AdminSystemView from "@/views/AdminSystemView.vue";
import AccountView from "@/views/AccountView.vue";
import AdminUserUploadsView from "@/views/AdminUserUploadsView.vue";
import AdminUploadsView from "@/views/AdminUploadsView.vue";
import AdminUserView from "@/views/AdminUserView.vue";
import AdminUserPanel from "@/components/features/admin/AdminUserPanel.vue";
import AdminSiteBoard from "@/components/features/admin/AdminSiteBoard.vue";
import AdminUserList from "@/components/features/admin/AdminUserList.vue";
import AdminPasteList from "@/components/features/admin/AdminPasteList.vue";
import AccountPanel from "@/components/features/account/AccountPanel.vue";
import HomeHero from "@/components/features/home/HomeHero.vue";
import ToolDirectory from "@/components/features/home/ToolDirectory.vue";
import LoginForm from "@/components/features/auth/LoginForm.vue";
import RegisterForm from "@/components/features/auth/RegisterForm.vue";
import PasswordResetForm from "@/components/features/auth/PasswordResetForm.vue";
import ShortenPanel from "@/components/features/shorten/ShortenPanel.vue";
import ShortLinkList from "@/components/features/shorten/ShortLinkList.vue";
import PasteComposer from "@/components/features/pastebin/PasteComposer.vue";
import PasteList from "@/components/features/pastebin/PasteList.vue";
import PasteViewer from "@/components/features/pastebin/PasteViewer.vue";
import ShortLinkResolver from "@/components/features/redirect/ShortLinkResolver.vue";
import UploadComposer from "@/components/features/uploads/UploadComposer.vue";
import UploadList from "@/components/features/uploads/UploadList.vue";
import UsageMeter from "@/components/features/uploads/UsageMeter.vue";
import PageSection from "@/components/layout/PageSection.vue";
import { Messages } from "@/constants/messages";
import { ADMIN_SECTIONS } from "@/constants/admin";
import { TOOLS_LINE } from "@/constants/stops";
import { isLoggedIn, isSessionChecked, isSuperuser } from "@/scripts/authentication/authState";
import { aMailBudget, someStats } from "@/__tests__/helpers/admin";
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
    expect(wrapper.find(".section-lead").text()).toBe(
      "Opening a shared link, paste or file needs no account; making one does."
    );
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

  it("ShortenView uses the panel as the page heading and shows no list when logged out", async () => {
    const { wrapper } = await mountWithRouter(ShortenView);

    expect(wrapper.findComponent(ShortenPanel).props("as")).toBe("h1");
    expect(wrapper.findComponent(ShortLinkList).exists()).toBe(false);
    expect(wrapper.find(".workspace").classes()).not.toContain("workspace--split");
    // A link that lands after a logout has no list to refresh.
    expect(() => wrapper.findComponent(ShortenPanel).vm.$emit("created")).not.toThrow();
  });

  it("ShortenView refreshes the list when a link is shortened", async () => {
    isLoggedIn.value = true;
    const fetchMock = mockFetch();
    fetchMock.mockResolvedValue(jsonResponse(200, { shortUrls: [], pagination: null }));
    const { wrapper } = await mountWithRouter(ShortenView);
    await flushPromises();
    expect(wrapper.findComponent(ShortLinkList).exists()).toBe(true);
    expect(wrapper.findComponent(PageSection).props("width")).toBe("wide");
    expect(wrapper.find(".workspace").classes()).toContain("workspace--split");
    // Views mounted by earlier tests are still alive and load their own lists on login, so count from here.
    fetchMock.mockClear();

    wrapper.findComponent(ShortenPanel).vm.$emit("created");
    await flushPromises();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toContain("/shortenUrls?");
    expect(fetchMock.mock.calls[0][0]).toContain("page=1");
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

  const asSuperuser = () => {
    isSessionChecked.value = true;
    isLoggedIn.value = true;
    isSuperuser.value = true;
  };

  it("AdminAreaView shows nothing until the session is known", async () => {
    const { wrapper } = await mountWithRouter(AdminAreaView, {}, "/admin");

    expect(wrapper.find("h1").exists()).toBe(false);
  });

  it.each(["/admin", "/admin/users", "/admin/users/u9/uploads"])(
    "AdminAreaView asks a visitor on %s to log in",
    async (path) => {
      isSessionChecked.value = true;
      const { wrapper } = await mountWithRouter(AdminAreaView, {}, path);

      const widths = wrapper.findAllComponents(PageSection).map((page) => page.props("width"));
      expect(widths).toEqual(["narrow"]);
      expect(wrapper.find("h1").text()).toBe("Admin");
      expect(wrapper.find(".status").text()).toBe(
        "Log in with the admin account to open this page."
      );
      expect(wrapper.find('a[href="/login"]').exists()).toBe(true);
      expect(wrapper.findComponent(ToolDirectory).exists()).toBe(false);
      expect(wrapper.findComponent(AdminUserList).exists()).toBe(false);
      expect(wrapper.findComponent(UploadList).exists()).toBe(false);
    }
  );

  it("AdminAreaView turns away a logged-in user who isn't the admin", async () => {
    isSessionChecked.value = true;
    isLoggedIn.value = true;
    const { wrapper } = await mountWithRouter(AdminAreaView, {}, "/admin/users");

    expect(wrapper.find(".status").text()).toBe("This page is only for the site's admin.");
    expect(wrapper.find('a[href="/"]').text()).toBe("Back to home");
    expect(wrapper.findComponent(AdminUserList).exists()).toBe(false);
  });

  it("AdminAreaView shows the superuser the overview: the site's figures, then a key to every section", async () => {
    mockFetch()
      .mockResolvedValueOnce(jsonResponse(200, someStats()))
      .mockResolvedValueOnce(jsonResponse(200, aMailBudget()));
    asSuperuser();
    const { wrapper } = await mountWithRouter(AdminAreaView, {}, "/admin");

    expect(wrapper.findComponent(AdminView).exists()).toBe(true);
    expect(wrapper.findComponent(PageSection).props("width")).toBe("medium");
    expect(wrapper.find("h1").text()).toBe("Admin");
    expect(wrapper.findAll("h2").map((heading) => heading.text())).toEqual(["Site", "Sections"]);
    expect(wrapper.findComponent(AdminSiteBoard).exists()).toBe(true);
    expect(wrapper.find(".directory").attributes("aria-labelledby")).toBe("admin-sections");
    expect(wrapper.findComponent(ToolDirectory).props("stops")).toEqual(ADMIN_SECTIONS);
    expect(wrapper.find('.directory a[href="/admin/users"]').text()).toContain("Users");
  });

  it("AdminAreaView shows the superuser the users board as the page heading", async () => {
    mockFetch().mockResolvedValue(jsonResponse(200, { users: [], pagination: null }));
    asSuperuser();
    const { wrapper } = await mountWithRouter(AdminAreaView, {}, "/admin/users");

    expect(wrapper.findComponent(AdminUsersView).exists()).toBe(true);
    expect(wrapper.findComponent(PageSection).props("width")).toBe("wide");
    expect(wrapper.findComponent(AdminUserList).props("as")).toBe("h1");
    expect(wrapper.find("h1").text()).toBe("Users");
    expect(wrapper.find('a[href="/admin"]').text()).toBe("All sections");
  });

  it("AdminAreaView shows the superuser the pastes board as the page heading", async () => {
    mockFetch().mockResolvedValue(jsonResponse(200, { pastes: [], pagination: null }));
    asSuperuser();
    const { wrapper } = await mountWithRouter(AdminAreaView, {}, "/admin/pastes");

    expect(wrapper.findComponent(AdminPastesView).exists()).toBe(true);
    expect(wrapper.findComponent(PageSection).props("width")).toBe("wide");
    expect(wrapper.findComponent(AdminPasteList).props("as")).toBe("h1");
    expect(wrapper.find("h1").text()).toBe("Pastes");
    expect(wrapper.find('a[href="/admin"]').text()).toBe("All sections");
  });

  it("AdminUsersView says which account was deleted, once", async () => {
    mockFetch().mockResolvedValue(jsonResponse(200, { users: [], pagination: null }));
    asSuperuser();
    const noticeFrom = async () => {
      const { wrapper } = await mountWithRouter(AdminUsersView);
      return wrapper.findComponent(AdminUserList).props("notice");
    };

    try {
      window.history.replaceState({ deletedUser: "anna", kept: 1 }, "");
      expect(await noticeFrom()).toBe(Messages.Admin.userDeleted("anna"));
      // Dropped from the entry, so a reload doesn't say it again; the rest of the state stays.
      expect(window.history.state).toEqual({ deletedUser: undefined, kept: 1 });
      expect(await noticeFrom()).toBe("");

      window.history.replaceState({ deletedUser: 7 }, "");
      expect(await noticeFrom()).toBe("");
      window.history.replaceState(null, "");
      expect(await noticeFrom()).toBe("");
    } finally {
      window.history.replaceState(null, "");
    }
  });

  it("AdminAreaView shows the superuser every upload, the list as the page heading", async () => {
    const fetchMock = mockFetch();
    fetchMock.mockResolvedValue(jsonResponse(200, { uploads: [], pagination: null }));
    asSuperuser();
    const { wrapper } = await mountWithRouter(AdminAreaView, {}, "/admin/uploads");
    await flushPromises();

    expect(wrapper.findComponent(AdminUploadsView).exists()).toBe(true);
    expect(wrapper.findComponent(PageSection).props("width")).toBe("medium");
    expect(wrapper.findComponent(UploadList).props()).toMatchObject({
      listing: { kind: "site" },
      as: "h1"
    });
    expect(wrapper.find("h1").text()).toBe("Uploads");
    expect(wrapper.find('a[href="/admin"]').text()).toBe("All sections");
    expect(String(fetchMock.mock.calls[0][0])).toMatch(/^https:\/\/api\.test\/admin\/uploads\?/);
  });

  it("AdminAreaView shows the superuser the short links board as the page heading", async () => {
    mockFetch().mockResolvedValue(jsonResponse(200, { shortUrls: [], pagination: null }));
    asSuperuser();
    const { wrapper } = await mountWithRouter(AdminAreaView, {}, "/admin/short-links");

    expect(wrapper.findComponent(AdminShortLinksView).exists()).toBe(true);
    expect(wrapper.findComponent(PageSection).props("width")).toBe("wide");
    expect(wrapper.findComponent(AdminShortLinkList).props("as")).toBe("h1");
    expect(wrapper.find("h1").text()).toBe("Short links");
    expect(wrapper.find('a[href="/admin"]').text()).toBe("All sections");
  });

  it("AdminAreaView shows the superuser the system tools under one heading", async () => {
    mockFetch().mockResolvedValue(
      jsonResponse(200, {
        pendingRegistrations: [],
        pagination: { limit: 20, page: 1, total: 0, pages: 0 }
      })
    );
    asSuperuser();
    const { wrapper } = await mountWithRouter(AdminAreaView, {}, "/admin/system");

    expect(wrapper.findComponent(AdminSystemView).exists()).toBe(true);
    expect(wrapper.findComponent(PageSection).props("width")).toBe("wide");
    expect(wrapper.find("h1").text()).toBe("System");
    expect(wrapper.findAll("h2").map((title) => title.text())).toEqual([
      "Pending registrations",
      "Rate limits"
    ]);
    expect(wrapper.find('a[href="/admin"]').text()).toBe("All sections");
  });

  it("AdminAreaView changes admin pages with the route fade", async () => {
    // The overview's totals and today's mail, then the users list.
    mockFetch()
      .mockResolvedValueOnce(jsonResponse(200, someStats()))
      .mockResolvedValueOnce(jsonResponse(200, aMailBudget()))
      .mockResolvedValue(jsonResponse(200, { users: [], pagination: null }));
    asSuperuser();
    const { wrapper, router } = await mountWithRouter(AdminAreaView, {}, "/admin");
    expect(wrapper.findComponent({ name: "Transition" }).props()).toMatchObject({
      name: "route",
      mode: "out-in"
    });

    await router.push("/admin/users");
    await flushPromises();

    expect(wrapper.findComponent(AdminView).exists()).toBe(false);
    expect(wrapper.findComponent(AdminUsersView).exists()).toBe(true);
  });

  it("AdminAreaView takes App's fade on its own element, so the gate swaps in plainly", async () => {
    mockFetch().mockResolvedValue(jsonResponse(200, { users: [], pagination: null }));
    asSuperuser();
    const { wrapper } = await mountWithRouter(AdminAreaView, {}, "/admin/users");
    // A component root would hand App's route fade on to whatever the gate swaps in.
    expect(wrapper.element.tagName).toBe("DIV");

    isSuperuser.value = false;
    isLoggedIn.value = false;
    await flushPromises();

    expect(wrapper.element.tagName).toBe("DIV");
    expect(wrapper.find(".status").text()).toBe("Log in with the admin account to open this page.");
    expect(wrapper.findComponent(AdminUsersView).exists()).toBe(false);
  });

  it("AdminAreaView keeps the last admin page while App fades it out of the area", async () => {
    mockFetch().mockResolvedValue(jsonResponse(200, { users: [], pagination: null }));
    asSuperuser();
    const { wrapper, router } = await mountWithRouter(AdminAreaView, {}, "/admin/users");

    await router.push("/upload");
    await flushPromises();

    expect(wrapper.findComponent(AdminUsersView).exists()).toBe(true);
  });

  it("AdminUserView shows the account from the route with a way back to the users", async () => {
    mockFetch().mockResolvedValue(
      jsonResponse(404, { error: "There is no such user with that ID." })
    );
    asSuperuser();
    const { wrapper } = await mountWithRouter(AdminUserView, { props: { id: "u9" } });
    await flushPromises();

    expect(wrapper.findComponent(PageSection).props("width")).toBe("medium");
    expect(wrapper.find('a[href="/admin/users"]').text()).toBe("All users");
    expect(wrapper.findComponent(AdminUserPanel).props("id")).toBe("u9");
    expect(wrapper.find("h1").text()).toBe("Account");
  });

  it("AdminUserUploadsView lists the user's uploads with a way back", async () => {
    const fetchMock = mockFetch();
    fetchMock.mockResolvedValue(jsonResponse(200, { uploads: [], pagination: null }));
    asSuperuser();
    const { wrapper } = await mountWithRouter(AdminUserUploadsView, { props: { id: "u 9" } });
    await flushPromises();

    expect(wrapper.findComponent(PageSection).props("width")).toBe("medium");
    expect(wrapper.find('a[href="/admin/users"]').text()).toBe("All users");
    expect(wrapper.findComponent(UploadList).props()).toMatchObject({
      listing: {
        kind: "user",
        params: { id: "u 9" },
        ownerHint: undefined
      },
      as: "h1"
    });
    expect(String(fetchMock.mock.calls[0][0])).toMatch(
      /^https:\/\/api\.test\/admin\/users\/u%209\/uploads\?/
    );
  });

  it("AdminUserUploadsView names the user from the link that led there", async () => {
    const fetchMock = mockFetch();
    fetchMock.mockResolvedValue(jsonResponse(500, undefined, "Server Error"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    isSessionChecked.value = true;
    isLoggedIn.value = true;
    isSuperuser.value = true;

    const hintFrom = async (state: unknown) => {
      window.history.replaceState(state, "");
      const { wrapper } = await mountWithRouter(AdminUserUploadsView, { props: { id: "u9" } });
      await flushPromises();
      const listing = wrapper.findComponent(UploadList).props("listing")!;
      return { hint: "ownerHint" in listing ? listing.ownerHint : "none", text: wrapper.text() };
    };

    try {
      const named = await hintFrom({ uploadsOwner: "anna" });
      expect(named.hint).toBe("anna");
      expect(named.text).toContain("anna's uploads");
      expect(named.text).toContain("Failed to load anna's uploads: Server Error");

      // Only a name counts; anything else leaves the generic wording.
      expect((await hintFrom({ uploadsOwner: "" })).hint).toBeUndefined();
      expect((await hintFrom({ uploadsOwner: 7 })).hint).toBeUndefined();
      const none = await hintFrom(null);
      expect(none.hint).toBeUndefined();
      expect(none.text).toContain("Failed to load this user's uploads: Server Error");
    } finally {
      window.history.replaceState(null, "");
    }
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
