import { describe, expect, it } from "vitest";
import router, { routes } from "@/router";

describe("router", () => {
  it.each([
    ["home", "/"],
    ["shorten", "/shorten"],
    ["pastebin", "/pastebin"],
    ["login", "/login"],
    ["register", "/register"]
  ])("resolves the %s route to %s", (name, path) => {
    expect(router.resolve({ name }).path).toBe(path);
  });

  it("resolves a paste's page and hands its ID to the view as a prop", () => {
    const resolved = router.resolve({ name: "paste", params: { id: "abc123" } });

    expect(resolved.path).toBe("/pastebin/abc123");
    expect(resolved.matched[0].props.default).toBe(true);
  });

  it.each(routes.map((route) => [route.path, route] as const))(
    "loads the component for %s",
    async (_path, route) => {
      const component =
        "component" in route && typeof route.component === "function"
          ? await (route.component as () => Promise<{ default: unknown }>)()
          : { default: route.component };
      expect(component.default).toBeTruthy();
    }
  );
});
