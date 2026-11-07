import type * as StopsModule from "@/constants/stops";
import type { Stop } from "@/constants/stops";

/** A tool that isn't built yet. The real line has none today, but the planned-stop pattern stays. */
export const PLANNED_STOP: Stop = {
  id: "planned",
  label: "Planned",
  to: "/planned",
  status: "planned",
  blurb: "Not built yet."
};

/**
 * The stops module with {@link PLANNED_STOP} appended to the real line, for specs that check how
 * planned stops are left out:
 * `vi.mock("@/constants/stops", async (importOriginal) => (await import("@/__tests__/helpers/stops")).withPlannedStop(await importOriginal()))`.
 */
export const withPlannedStop = (actual: typeof StopsModule): typeof StopsModule => ({
  ...actual,
  TOOLS_LINE: { ...actual.TOOLS_LINE, stops: [...actual.TOOLS_LINE.stops, PLANNED_STOP] }
});
