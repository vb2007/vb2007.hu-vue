import { describe, expect, it } from "vitest";
import { TOOLS_LINE } from "@/constants/stops";
import { createTestRouter } from "@/__tests__/helpers/mount";

// Guards for the line diagram that the navbar and the route map are generated from.
describe("TOOLS_LINE", () => {
  const { stops } = TOOLS_LINE;

  it("has unique stop ids", () => {
    expect(new Set(stops.map((stop) => stop.id)).size).toBe(stops.length);
  });

  it("starts with at least one open stop", () => {
    expect(stops[0].status).toBe("open");
  });

  it("puts every planned stop after the open ones", () => {
    const firstPlanned = stops.findIndex((stop) => stop.status === "planned");
    if (firstPlanned === -1) return;
    expect(stops.slice(firstPlanned).every((stop) => stop.status === "planned")).toBe(true);
  });

  it.each(stops.filter((stop) => stop.status === "open"))(
    "open stop $id points at a registered route",
    (stop) => {
      expect(createTestRouter().resolve(stop.to).matched).not.toHaveLength(0);
    }
  );
});
