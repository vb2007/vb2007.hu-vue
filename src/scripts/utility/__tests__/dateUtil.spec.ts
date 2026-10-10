import { describe, expect, it, vi } from "vitest";
import { formatDateTime, getCurrentYear } from "@/scripts/utility/dateUtil";

describe("getCurrentYear", () => {
  it("returns the current calendar year", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2031-06-15T12:00:00Z"));

    expect(getCurrentYear()).toBe(2031);
  });
});

describe("formatDateTime", () => {
  it("formats a timestamp as a medium date with a short time", () => {
    // Midday UTC, so the calendar date is the same in every timezone the tests might run in.
    const formatted = formatDateTime("2026-10-10T12:00:00.000Z", "en-GB");

    expect(formatted).toMatch(/^10 Oct 2026, \d{2}:\d{2}$/);
  });
});
