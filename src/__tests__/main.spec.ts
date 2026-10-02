import { describe, expect, it, vi } from "vitest";
import { mockFetch, jsonResponse } from "@/__tests__/helpers/fetch";

describe("main", () => {
  it("mounts the app with the router into #app", async () => {
    mockFetch().mockResolvedValue(jsonResponse(401));
    document.body.innerHTML = '<div id="app"></div>';

    await import("@/main");

    await vi.waitFor(() => expect(document.querySelector("#app .shell")).not.toBeNull());
    expect(document.querySelector("#app .bar")).not.toBeNull();
    expect(document.documentElement.classList).toContain("light-theme");
  });
});
