import { describe, expect, it, vi } from "vitest";
import NotFoundView from "@/views/NotFoundView.vue";
import ApiErrorView from "@/views/ApiErrorView.vue";
import ToolDirectory from "@/components/features/home/ToolDirectory.vue";
import PageSection from "@/components/layout/PageSection.vue";
import StationBoard from "@/components/ui/StationBoard.vue";
import { PLANNED_STOP } from "@/__tests__/helpers/stops";
import { TOOLS_LINE } from "@/constants/stops";
import { MAX_ADDRESS } from "@/scripts/utility/text";
import { mountWithRouter } from "@/__tests__/helpers/mount";

// The real line has no planned stop today, so one is added to check the not-found pages leave it out.
vi.mock("@/constants/stops", async (importOriginal) =>
  (await import("@/__tests__/helpers/stops")).withPlannedStop(await importOriginal())
);

describe("not-found views", () => {
  it("run against a line with a planned stop", () => {
    expect(TOOLS_LINE.stops).toContain(PLANNED_STOP);
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
    // Home has its own key and a planned stop leads nowhere yet, so neither is offered.
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
