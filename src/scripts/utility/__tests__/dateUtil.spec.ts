import { describe, expect, it, vi } from "vitest";
import { getCurrentYear } from "@/scripts/utility/dateUtil";

describe("getCurrentYear", () => {
  it("returns the current calendar year", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2031-06-15T12:00:00Z"));

    expect(getCurrentYear()).toBe(2031);
  });
});
