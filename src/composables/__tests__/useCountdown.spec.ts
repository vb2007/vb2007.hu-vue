import { beforeEach, describe, expect, it, vi } from "vitest";
import { mountComposable } from "@/__tests__/helpers/host";
import { retryAfterFrom, useCountdown } from "@/composables/useCountdown";

describe("useCountdown", () => {
  // Fake timers mock Date.now too, so the deadline moves with advanceTimersByTime.
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it("starts inactive", () => {
    const { api } = mountComposable(useCountdown);

    expect(api.remaining.value).toBe(0);
    expect(api.active.value).toBe(false);
  });

  it("steps down once a second and stops at 0", () => {
    const { api } = mountComposable(useCountdown);

    api.start(3);
    expect(api.remaining.value).toBe(3);
    expect(api.active.value).toBe(true);

    vi.advanceTimersByTime(999);
    expect(api.remaining.value).toBe(3);
    vi.advanceTimersByTime(1);
    expect(api.remaining.value).toBe(2);

    vi.advanceTimersByTime(2000);
    expect(api.remaining.value).toBe(0);
    expect(api.active.value).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("shows every number on the way down", () => {
    const { api } = mountComposable(useCountdown);
    const shown = new Set<number>();

    api.start(5);
    for (let elapsed = 0; elapsed <= 5000; elapsed += 50) {
      shown.add(api.remaining.value);
      vi.advanceTimersByTime(50);
    }

    expect([...shown]).toEqual([5, 4, 3, 2, 1, 0]);
  });

  it("catches up with the clock when ticks were held back", () => {
    const { api } = mountComposable(useCountdown);

    api.start(60);
    // A suspended tab: the clock moves on, but no tick runs.
    vi.setSystemTime(Date.now() + 45_000);
    vi.advanceTimersByTime(250);

    expect(api.remaining.value).toBe(15);
  });

  it("restarts from the new value when started again", () => {
    const { api } = mountComposable(useCountdown);

    api.start(5);
    vi.advanceTimersByTime(3000);
    api.start(10);

    expect(api.remaining.value).toBe(10);
    expect(vi.getTimerCount()).toBe(1);
  });

  it("rounds a fraction of a second up", () => {
    const { api } = mountComposable(useCountdown);

    api.start(1.2);

    expect(api.remaining.value).toBe(2);
  });

  it("doesn't start for zero or fewer seconds", () => {
    const { api } = mountComposable(useCountdown);

    api.start(0);
    api.start(-5);

    expect(api.active.value).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("stops on demand", () => {
    const { api } = mountComposable(useCountdown);

    api.start(30);
    api.stop();

    expect(api.remaining.value).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("clears the interval when the component unmounts", () => {
    const { wrapper, api } = mountComposable(useCountdown);

    api.start(30);
    wrapper.unmount();

    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("retryAfterFrom", () => {
  it("takes the API's retryAfter, rounded up to whole seconds", () => {
    expect(retryAfterFrom({ error: "Wait a bit.", retryAfter: 42 })).toBe(42);
    expect(retryAfterFrom({ error: "Wait a bit.", retryAfter: 41.3 })).toBe(42);
  });

  it.each([
    ["a rate limiter's body without one", { error: "Too many requests." }],
    ["zero", { retryAfter: 0 }],
    ["a negative number", { retryAfter: -3 }],
    ["infinity", { retryAfter: Infinity }],
    ["NaN", { retryAfter: NaN }],
    ["a string", { retryAfter: "30" }],
    ["null", null],
    ["undefined", undefined],
    ["a non-object", "Too many requests."]
  ])("falls back for %s", (_, body) => {
    expect(retryAfterFrom(body)).toBe(60);
    expect(retryAfterFrom(body, 15)).toBe(15);
  });
});
