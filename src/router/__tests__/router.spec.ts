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
    ["/admin/", "admin"],
    ["/apierror?url=%2Ffoo", "api-error"]
  ])("still resolves %s to its own route, not the catch-all", (path, name) => {
    expect(router.resolve(path).name).toBe(name);
  });

  it.each(flatten(routes))("loads the component for %s", async (_path, route) => {
    const component =
      "component" in route && typeof route.component === "function"
        ? await (route.component as () => Promise<{ default: unknown }>)()
        : { default: route.component };
    expect(component.default).toBeTruthy();
  });
});
