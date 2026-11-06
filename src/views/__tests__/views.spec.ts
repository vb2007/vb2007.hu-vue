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
import NotFoundView from "@/views/NotFoundView.vue";
import ApiErrorView from "@/views/ApiErrorView.vue";
import AdminUserList from "@/components/features/admin/AdminUserList.vue";
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
import StationBoard from "@/components/ui/StationBoard.vue";
import { Endpoints } from "@/constants/endpoints";
import { TOOLS_LINE } from "@/constants/stops";
import { MAX_ADDRESS } from "@/scripts/utility/text";
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

  it("ShortenView uses the panel as the page heading and shows no list when logged out", async () => {
    const { wrapper } = await mountWithRouter(ShortenView);

    expect(wrapper.findComponent(ShortenPanel).props("as")).toBe("h1");
    expect(wrapper.findComponent(ShortLinkList).exists()).toBe(false);
    expect(wrapper.find(".workspace").classes()).not.toContain("workspace--split");
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
      listing: {
        endpoint: Endpoints.Admin.userUploads,
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

  it("NotFoundView names the missing path and leads home and to the open tools", async () => {
    const { wrapper } = await mountWithRouter(NotFoundView, {}, "/no/such/page?x=1");

    expect(wrapper.findAllComponents(PageSection).map((section) => section.props("width"))).toEqual(
      ["medium", "medium"]
    );
    expect(wrapper.findComponent(StationBoard).props()).toMatchObject({
      title: "Page not found",
      as: "h1"
    });
    expect(wrapper.find("h1").text()).toBe("Page not found");
    expect(wrapper.find(".path").text()).toBe("/no/such/page");
    const home = wrapper.findAll("a").find((link) => link.text() === "Back to home");
    expect(home?.attributes("href")).toBe("/");
    expect(wrapper.find("#not-found-tools-title").text()).toBe("Tools");
    // Home has its own key and Contact is still planned, so neither is offered.
    const stops = wrapper.findComponent(ToolDirectory).props("stops");
    expect(stops.map((stop) => stop.id)).toEqual(["shorten", "paste", "upload"]);
    expect(wrapper.find(".sign--planned").exists()).toBe(false);
  });

  it.each([
    ["/%C3%A1rv%C3%ADz", "/árvíz"],
    ["/a%E0b", "/a%E0b"],
    ["/r/", "/r/"],
    ["/docs/%E2%80%AEfdp.exe", "/docs/%E2%80%AEfdp.exe"],
    ["/a%20b", "/a%20b"]
  ])("NotFoundView shows %s decoded as %s", async (pushed, shown) => {
    // Vue Router warns that it kept a malformed escape as typed.
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { wrapper } = await mountWithRouter(NotFoundView, {}, pushed);

    expect(wrapper.find(".path").text()).toBe(shown);
  });

  const apiError = (url?: string) =>
    mountWithRouter(
      ApiErrorView,
      {},
      url === undefined ? "/apierror" : `/apierror?url=${encodeURIComponent(url)}`
    );

  it("ApiErrorView names the API address on the not-found board, with the same ways on", async () => {
    const { wrapper } = await apiError("/foo?x=1");

    expect(wrapper.findComponent(StationBoard).props()).toMatchObject({
      title: "API route not found",
      as: "h1"
    });
    expect(wrapper.find("h1").text()).toBe("API route not found");
    expect(wrapper.find(".board__body p").text()).toBe(
      "The API has no route at api.test/foo?x=1. The link may be old or mistyped."
    );
    expect(wrapper.find(".path .host").text()).toBe("api.test");
    const home = wrapper.findAll("a").find((link) => link.text() === "Back to home");
    expect(home?.attributes("href")).toBe("/");
    const stops = wrapper.findComponent(ToolDirectory).props("stops");
    expect(stops.map((stop) => stop.id)).toEqual(["shorten", "paste", "upload"]);
  });

  it("ApiErrorView shows the address only as text, never as a link or markup", async () => {
    const url = '/x"><a href="https://evil.test">click</a><img src=x onerror=alert(1)>';
    const { wrapper } = await apiError(url);

    expect(wrapper.find(".path").text()).toBe(`api.test${url.replace(/ /g, "%20")}`);
    expect(wrapper.find(".board__body img").exists()).toBe(false);
    expect(wrapper.find(".board__body a[href='https://evil.test']").exists()).toBe(false);
    expect(wrapper.findAll("a").map((link) => link.attributes("href"))).not.toContain(
      "https://evil.test"
    );
  });

  const noAddress =
    "The API has no route at the address you opened. The link may be old or mistyped.";

  it.each([
    ["no url", "/apierror"],
    ["a bare url", "/apierror?url"],
    ["an empty url", "/apierror?url="],
    ["a repeated url", "/apierror?url=%2Fa&url=%2Fb"],
    ["a url that isn't a path", `/apierror?url=${encodeURIComponent("Your account is locked")}`]
  ])("ApiErrorView leaves the address out for %s", async (_name, path) => {
    const { wrapper } = await mountWithRouter(ApiErrorView, {}, path);

    expect(wrapper.find(".path").exists()).toBe(false);
    expect(wrapper.find(".board__body p").text()).toBe(noAddress);
  });

  it.each([
    ["/%C3%A1rv%C3%ADz?q=%C3%A9", "/árvíz?q=é"],
    ["/a%2Fb?c=%26", "/a%2Fb?c=%26"],
    ["/a%E0b", "/a%E0b"],
    ["/docs/%E2%80%AEfdp.exe", "/docs/%E2%80%AEfdp.exe"],
    ["/%E2%80%AEabc", "/%E2%80%AEabc"]
  ])("ApiErrorView shows %s as %s", async (url, shown) => {
    const { wrapper } = await apiError(url);

    expect(wrapper.find(".path").text()).toBe(`api.test${shown}`);
  });

  it.each([
    [
      "escaped",
      "/%0A%0AYour%20session%20expired.%20Log%20in%20again%20at%20vb2007-login.example",
      "/%0A%0AYour%20session%20expired.%20Log%20in%20again%20at%20vb2007-login.example"
    ],
    [
      "raw",
      "/ Your account is locked, call 555-0100",
      "/%20Your%20account%20is%20locked,%20call%20555-0100"
    ]
  ])("ApiErrorView shows a made-up sentence (%s) as an escaped address", async (_n, url, shown) => {
    const { wrapper } = await apiError(url);

    expect(wrapper.find(".board__body p").text()).toBe(
      `The API has no route at api.test${shown}. The link may be old or mistyped.`
    );
  });

  it("ApiErrorView cuts a very long address short by character", async () => {
    const { wrapper } = await apiError("/" + "😀".repeat(500));

    expect(wrapper.find(".path").text()).toBe(`api.test/${"😀".repeat(MAX_ADDRESS - 1)}…`);
  });

  it("ApiErrorView escapes a pile of combining marks, so the address still wraps", async () => {
    const { wrapper } = await apiError("/a" + "%CC%B8".repeat(150));
    const text = wrapper.find(".path").text();

    expect(text.startsWith("api.test/a\u0338\u0338%CC%B8")).toBe(true);
    expect(text).not.toMatch(/\p{M}{3}/u);
    expect(text.endsWith("…")).toBe(true);
  });
});
