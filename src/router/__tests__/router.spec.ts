import { describe, expect, it } from "vitest";
import type { RouteRecordRaw } from "vue-router";
import router, { routes } from "@/router";
import { ADMIN_SECTIONS, AdminPaths } from "@/constants/admin";

const areaRoute = routes.find((route) => route.path === AdminPaths.overview)!;

/** Every route with its full path, children included, so each one's component gets loaded. */
const flatten = (records: RouteRecordRaw[], base = ""): [string, RouteRecordRaw][] =>
  records.flatMap((route) => {
    const path = route.path.startsWith("/") ? route.path : `${base}/${route.path}`;
    return [[path, route] as [string, RouteRecordRaw], ...flatten(route.children ?? [], path)];
  });

describe("router", () => {
  it.each([
    ["home", "/"],
    ["shorten", "/shorten"],
    ["pastebin", "/pastebin"],
    ["upload", "/upload"],
    ["admin", "/admin"],
    ["admin-users", "/admin/users"],
    ["admin-pastes", "/admin/pastes"],
    ["admin-short-links", "/admin/short-links"],
    ["account", "/account"],
    ["login", "/login"],
    ["register", "/register"],
    ["reset-password", "/reset-password"],
    ["api-error", "/apierror"]
  ])("resolves the %s route to %s", (name, path) => {
    expect(router.resolve({ name }).path).toBe(path);
  });

  it("resolves a paste's page and hands its ID to the view as a prop", () => {
    const resolved = router.resolve({ name: "paste", params: { id: "abc123" } });

    expect(resolved.path).toBe("/pastebin/abc123");
    expect(resolved.matched[0].props.default).toBe(true);
  });

  it("opens a short link's preview with the code and the preview flag", () => {
    const resolved = router.resolve("/r/abc123/preview");
    const props = resolved.matched[0].props.default as (route: typeof resolved) => object;

    expect(resolved.name).toBe("redirect-preview");
    expect(props(resolved)).toEqual({ code: "abc123", preview: true });
  });

  it("opens one user's page for the admin with the user's ID as a prop", () => {
    const resolved = router.resolve({ name: "admin-user", params: { id: "u9" } });

    expect(resolved.path).toBe("/admin/users/u9");
    expect(resolved.matched[0].path).toBe(AdminPaths.overview);
    expect(resolved.matched[1].props.default).toBe(true);
  });

  it("opens one user's uploads for the admin with the user's ID as a prop", () => {
    const resolved = router.resolve({ name: "admin-user-uploads", params: { id: "u9" } });

    expect(resolved.path).toBe("/admin/users/u9/uploads");
    expect(resolved.matched[1].props.default).toBe(true);
  });

  it.each(Object.values(AdminPaths).map((path) => [path]))(
    "puts %s behind the admin area's gate",
    (path) => {
      const [area] = router.resolve(path).matched;

      expect(area.path).toBe(AdminPaths.overview);
      expect(area.components?.default).toBe(areaRoute.component);
    }
  );

  it("has a page for every section the overview lists", () => {
    for (const section of ADMIN_SECTIONS) {
      expect(router.resolve(section.to).matched).toHaveLength(2);
      expect(router.resolve(section.to).name).not.toBe("not-found");
    }
  });

  it("resolves a short link and hands its code to the view as a prop", () => {
    const resolved = router.resolve({ name: "redirect", params: { code: "abc123" } });

    expect(resolved.path).toBe("/r/abc123");
    expect(resolved.matched[0].props.default).toBe(true);
  });

  it.each([
    ["/no-such-page", ["no-such-page"]],
    ["/no/such/page", ["no", "such", "page"]],
    ["/pastebin/abc/extra", ["pastebin", "abc", "extra"]],
    ["/admin/no-such-section", ["admin", "no-such-section"]]
  ])("sends the unknown path %s to the not-found page", (path, segments) => {
    const resolved = router.resolve(path);

    expect(resolved.name).toBe("not-found");
    expect(resolved.params.pathMatch).toEqual(segments);
  });

  it.each([
    ["/pastebin/abc", "paste"],
    ["/r/abc", "redirect"],
    ["/r/abc/preview", "redirect-preview"],
    ["/admin/users/1/uploads", "admin-user-uploads"],
    ["/admin/users/1", "admin-user"],
    ["/admin/users", "admin-users"],
    ["/admin/pastes", "admin-pastes"],
    ["/admin/short-links", "admin-short-links"],
    ["/admin/", "admin"],
    ["/apierror?url=%2Ffoo", "api-error"]
  ])("still resolves %s to its own route, not the catch-all", (path, name) => {
    expect(router.resolve(path).name).toBe(name);
  });

  it.each([
    ["/", "vb2007.hu"],
    ["/shorten", "Shorten · vb2007.hu"],
    ["/pastebin", "Paste · vb2007.hu"],
    ["/pastebin/abc123", "Paste · vb2007.hu"],
    ["/upload", "Upload · vb2007.hu"],
    ["/admin", "Admin · vb2007.hu"],
    ["/admin/users", "Users · vb2007.hu"],
    ["/admin/users/u9", "User · vb2007.hu"],
    ["/admin/users/u9/uploads", "User uploads · vb2007.hu"],
    ["/admin/pastes", "Pastes · vb2007.hu"],
    ["/admin/short-links", "Short links · vb2007.hu"],
    ["/admin/uploads", "Uploads · vb2007.hu"],
    ["/admin/system", "System · vb2007.hu"],
    ["/r/abc123", "Short link · vb2007.hu"],
    ["/r/abc123/preview", "Short link preview · vb2007.hu"],
    ["/account", "Account · vb2007.hu"],
    ["/login", "Log in · vb2007.hu"],
    ["/register", "Register · vb2007.hu"],
    ["/reset-password", "Reset password · vb2007.hu"],
    ["/apierror?url=%2Ffoo", "API route not found · vb2007.hu"],
    ["/no/such/page", "Page not found · vb2007.hu"]
  ])("titles the tab of %s %j", async (path, title) => {
    await router.push(path);

    expect(document.title).toBe(title);
  });

  it("gives every named route but home a title of its own", () => {
    const untitled = flatten(routes)
      .filter(([, route]) => route.name && route.name !== "home" && !route.meta?.title)
      .map(([path]) => path);

    expect(untitled).toEqual([]);
  });

  it("titles each admin page itself rather than through the area's meta", () => {
    expect(areaRoute.meta).toBeUndefined();
    expect(router.resolve(AdminPaths.overview).meta.title).toBe("Admin");
  });

  it.each([
    ["the not-found page", "/no/such/page"],
    ["the API's unknown-route page", "/apierror?url=%2Ffoo"]
  ])("keeps %s out of search results until the visitor moves on", async (_page, path) => {
    const noindexTags = () => document.head.querySelectorAll('meta[name="robots"]');

    await router.push(path);
    expect(noindexTags()).toHaveLength(1);
    expect(noindexTags()[0].getAttribute("content")).toBe("noindex");

    // Another noindex page doesn't add a second tag.
    await router.push("/another/missing/page");
    expect(noindexTags()).toHaveLength(1);

    await router.push("/");
    expect(noindexTags()).toHaveLength(0);
    expect(document.title).toBe("vb2007.hu");
  });

  it("marks only the not-found pages noindex", () => {
    const noindex = flatten(routes)
      .filter(([, route]) => route.meta?.noindex)
      .map(([, route]) => route.name);

    expect(noindex).toEqual(["api-error", "not-found"]);
  });

  it.each(flatten(routes))("loads the component for %s", async (_path, route) => {
    const component =
      "component" in route && typeof route.component === "function"
        ? await (route.component as () => Promise<{ default: unknown }>)()
        : { default: route.component };
    expect(component.default).toBeTruthy();
  });
});
