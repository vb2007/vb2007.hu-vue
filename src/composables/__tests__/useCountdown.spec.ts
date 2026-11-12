import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mountComposable } from "@/__tests__/helpers/host";
import {
  codeCooldownOf,
  mailBudgetOf,
  retryAfterFrom,
  useCountdown
} from "@/composables/useCountdown";
import type { ApiFailure } from "@/scripts/api/client";

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

  it("counts nothing started after its component is gone, e.g. from an answer that landed late", () => {
    const { wrapper, api } = mountComposable(useCountdown);
    wrapper.unmount();

    api.start(30);

    expect(vi.getTimerCount()).toBe(0);
    expect(api.active.value).toBe(false);
  });
});

describe("useCountdown with a storage key", () => {
  const KEY = "test-cooldown";
  const keyed = () => useCountdown(KEY);

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    sessionStorage.clear();
    vi.restoreAllMocks();
  });

  it("keeps the deadline for an id, so a reloaded page resumes it", () => {
    const first = mountComposable(keyed);
    first.api.start(60, "me@example.com");
    vi.advanceTimersByTime(20_000);
    first.wrapper.unmount();

    const { api } = mountComposable(keyed);
    expect(api.active.value).toBe(false);

    expect(api.resume("me@example.com")).toBe(true);
    expect(api.remaining.value).toBe(40);
    vi.advanceTimersByTime(40_000);
    expect(api.active.value).toBe(false);
  });

  it("still keeps a deadline started after its component is gone, without counting it there", () => {
    // e.g. an answer that landed after the page was left: a reload still waits it out.
    const first = mountComposable(keyed);
    first.wrapper.unmount();
    // Counted by its intervals: jsdom's storage events take timers of their own.
    const intervals = vi.spyOn(globalThis, "setInterval");
    first.api.start(60, "me@example.com");
    expect(intervals).not.toHaveBeenCalled();
    expect(first.api.active.value).toBe(false);

    const { api } = mountComposable(keyed);
    expect(api.resume("me@example.com")).toBe(true);
    expect(api.remaining.value).toBe(60);
  });

  it("resumes nothing on screen once its component is gone", () => {
    const first = mountComposable(keyed);
    first.api.start(60, "me@example.com");
    const late = mountComposable(keyed);
    late.wrapper.unmount();
    const intervals = vi.spyOn(globalThis, "setInterval");

    expect(late.api.resume("me@example.com")).toBe(true);

    // Only the first one's count runs.
    expect(intervals).not.toHaveBeenCalled();
    expect(late.api.active.value).toBe(false);
    first.wrapper.unmount();
  });

  it("keeps why it waits with the deadline, and gives it back on resume", () => {
    const first = mountComposable(keyed);
    first.api.start(900, "me@example.com", "Too many failed attempts: try again later.");
    expect(first.api.note.value).toBe("Too many failed attempts: try again later.");
    expect(JSON.parse(sessionStorage.getItem(KEY)!).note).toBe(
      "Too many failed attempts: try again later."
    );
    first.wrapper.unmount();

    const { api } = mountComposable(keyed);
    expect(api.note.value).toBe("");
    expect(api.resume("me@example.com")).toBe(true);
    expect(api.note.value).toBe("Too many failed attempts: try again later.");

    // A new countdown without a reason replaces it, and keeps none.
    api.start(60, "me@example.com");
    expect(api.note.value).toBe("");
    expect(JSON.parse(sessionStorage.getItem(KEY)!)).not.toHaveProperty("note");
  });

  it.each([
    ["no note", { id: "me@example.com", deadline: 0 }],
    ["a note that isn't text", { id: "me@example.com", deadline: 0, note: 42 }]
  ])("resumes a kept deadline with %s as nothing to say", (_, saved) => {
    sessionStorage.setItem(KEY, JSON.stringify({ ...saved, deadline: Date.now() + 30_000 }));
    const { api } = mountComposable(keyed);
    api.start(10, undefined, "stale");

    expect(api.resume("me@example.com")).toBe(true);
    expect(api.note.value).toBe("");
  });

  it("doesn't resume another id's countdown, and leaves the running one alone", () => {
    const { api } = mountComposable(keyed);
    api.start(60, "me@example.com");
    api.start(30);

    expect(api.resume("you@example.com")).toBe(false);
    expect(api.remaining.value).toBe(30);
  });

  it("keeps one deadline per key: the last id started replaces the one before", () => {
    const { api } = mountComposable(keyed);
    api.start(60, "me@example.com");
    api.start(60, "you@example.com");
    api.stop();

    expect(api.resume("me@example.com")).toBe(false);
    expect(api.resume("you@example.com")).toBe(true);
  });

  it("doesn't resume a countdown that already ran out", () => {
    const { api } = mountComposable(keyed);
    api.start(5, "me@example.com");
    vi.advanceTimersByTime(5000);

    expect(api.resume("me@example.com")).toBe(false);
    expect(api.active.value).toBe(false);
  });

  it("keeps nothing without an id or for zero seconds", () => {
    const { api } = mountComposable(keyed);
    api.start(60);
    api.start(0, "me@example.com");

    expect(sessionStorage.getItem(KEY)).toBeNull();
    expect(api.resume("me@example.com")).toBe(false);
  });

  it("keeps nothing and resumes nothing without a storage key", () => {
    const { api } = mountComposable(useCountdown);
    api.start(60, "me@example.com");
    api.stop();

    expect(sessionStorage.length).toBe(0);
    expect(api.resume("me@example.com")).toBe(false);
  });

  it.each([
    ["isn't JSON", "{"],
    ["has no id", JSON.stringify({ deadline: Date.now() + 60_000 })],
    ["has no deadline", JSON.stringify({ id: "me@example.com" })],
    ["is null", "null"]
  ])("ignores an entry that %s", (_, entry) => {
    sessionStorage.setItem(KEY, entry);
    const { api } = mountComposable(keyed);

    expect(api.resume("me@example.com")).toBe(false);
  });

  it("still counts down when storage is off, without resuming", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("The quota has been exceeded.", "QuotaExceededError");
    });
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("Access is denied.", "SecurityError");
    });
    const { api } = mountComposable(keyed);

    api.start(60, "me@example.com");
    expect(api.remaining.value).toBe(60);

    api.stop();
    expect(api.resume("me@example.com")).toBe(false);
  });
});

describe("retryAfterFrom", () => {
  it("takes the API's retryAfter, rounded up to whole seconds", () => {
    expect(retryAfterFrom({ error: "Wait a bit.", retryAfter: 42 })).toBe(42);
    expect(retryAfterFrom({ error: "Wait a bit.", retryAfter: 41.3 })).toBe(42);
  });

  it.each([
    ["a body without one", { error: "Too many requests." }],
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

describe("codeCooldownOf", () => {
  const cooldownError = "A code was sent just now: wait 42 seconds before requesting another one.";
  /** A failure as `apiRequest` returns it; `error` is the API's message or the fallback. */
  const http = (
    status: number,
    body: { error?: string; retryAfter?: number; reason?: string } | null
  ): ApiFailure => ({
    ok: false,
    kind: "http",
    status,
    error: body?.error ?? `Failed: ${status}`,
    body
  });

  it("takes the cooldown's retryAfter: a code went out moments ago", () => {
    expect(
      codeCooldownOf(
        http(429, { error: cooldownError, retryAfter: 41.5, reason: "resendCooldown" })
      )
    ).toBe(42);
  });

  it("waits a minute for a cooldown's 429 without a retryAfter", () => {
    expect(codeCooldownOf(http(429, { error: cooldownError, reason: "resendCooldown" }))).toBe(60);
  });

  it("recognises the cooldown by its reason, whatever its message says", () => {
    expect(
      codeCooldownOf(http(429, { error: "Slow down.", retryAfter: 30, reason: "resendCooldown" }))
    ).toBe(30);
  });

  it.each([
    [
      "a rate limiter's 429, though it has a retryAfter",
      http(429, { error: "Too many failed attempts: try again later.", retryAfter: 900 })
    ],
    [
      "a rate limiter's 429 whose text starts like the old cooldown's",
      http(429, { error: cooldownError, retryAfter: 42 })
    ],
    ["a 429 without a reason", http(429, { error: "Wait.", retryAfter: 42 })],
    [
      "another reason",
      http(429, { error: cooldownError, retryAfter: 42, reason: "somethingElse" })
    ],
    ["a 429 without a body", http(429, null)],
    [
      "the cooldown's reason on another status",
      http(503, { error: cooldownError, retryAfter: 42, reason: "resendCooldown" })
    ],
    [
      "a network failure",
      { ok: false, kind: "network", status: 0, error: "Error connecting to server" } as ApiFailure
    ]
  ])("is undefined for %s", (_, failure) => {
    expect(codeCooldownOf(failure)).toBeUndefined();
  });
});

describe("mailBudgetOf", () => {
  const budgetError =
    "No more registration e-mails can be sent today: please try again after the daily limit resets.";
  const http = (
    status: number,
    body: { error?: string; retryAfter?: number; reason?: string } | null
  ): ApiFailure => ({
    ok: false,
    kind: "http",
    status,
    error: body?.error ?? `Failed: ${status}`,
    body
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("takes the used-up limit's retryAfter, which may be most of a day", () => {
    expect(
      mailBudgetOf(http(503, { error: budgetError, reason: "mailBudget", retryAfter: 51234 }))
    ).toBe(51234);
  });

  it("waits until the next UTC midnight without a retryAfter", () => {
    vi.useFakeTimers();
    vi.setSystemTime(Date.UTC(2026, 10, 12, 22, 59, 30, 500));

    expect(mailBudgetOf(http(503, { error: budgetError, reason: "mailBudget" }))).toBe(3630);
  });

  it("waits at least a second right before UTC midnight", () => {
    vi.useFakeTimers();
    vi.setSystemTime(Date.UTC(2026, 10, 12, 23, 59, 59, 999));

    expect(mailBudgetOf(http(503, { reason: "mailBudget" }))).toBe(1);
  });

  it.each([
    [
      "a 503 without a reason: a failed send",
      http(503, { error: "The e-mail couldn't be sent: please try again later.", retryAfter: 42 })
    ],
    ["another reason", http(503, { error: budgetError, retryAfter: 42, reason: "somethingElse" })],
    [
      "the budget's reason on another status",
      http(429, { error: budgetError, retryAfter: 42, reason: "mailBudget" })
    ],
    ["a 503 without a body", http(503, null)],
    [
      "a network failure",
      { ok: false, kind: "network", status: 0, error: "Error connecting to server" } as ApiFailure
    ]
  ])("is undefined for %s", (_, failure) => {
    expect(mailBudgetOf(failure)).toBeUndefined();
  });
});
