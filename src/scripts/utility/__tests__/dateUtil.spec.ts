import { describe, expect, it, vi } from "vitest";
import { formatDate, formatDateTime, getCurrentYear, isPast } from "@/scripts/utility/dateUtil";

describe("isPast", () => {
  const now = Date.parse("2026-11-06T12:00:00.000Z");

  it("is true from the moment on", () => {
    expect(isPast("2026-11-06T11:59:59.000Z", now)).toBe(true);
    expect(isPast("2026-11-06T12:00:00.000Z", now)).toBe(true);
    expect(isPast("2026-11-06T12:00:01.000Z", now)).toBe(false);
  });

  it("checks against the clock by default", () => {
    vi.useFakeTimers();
    vi.setSystemTime(now);

    expect(isPast("2026-11-06T11:00:00.000Z")).toBe(true);
    expect(isPast("2026-11-06T13:00:00.000Z")).toBe(false);
    vi.useRealTimers();
  });
});

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

describe("formatDate", () => {
  it("formats a timestamp as a medium date without the time", () => {
    expect(formatDate("2026-10-10T12:00:00.000Z", "en-GB")).toBe("10 Oct 2026");
  });
});
