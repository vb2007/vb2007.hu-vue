import { nextTick, ref } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mountComposable } from "@/__tests__/helpers/host";
import { useRetryHold } from "@/composables/useRetryHold";

const LIMITED = "Too many failed attempts: try again later.";

describe("useRetryHold", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const mountHold = () => {
    const error = ref("");
    const { api, wrapper } = mountComposable(() => useRetryHold(error));
    return { error, hold: api, wrapper };
  };

  it("holds nothing until started", () => {
    const { hold } = mountHold();

    expect(hold.isHeld()).toBe(false);
    expect(hold.remaining.value).toBe(0);
  });

  it("holds for the wait, then drops the 429's message", async () => {
    const { error, hold } = mountHold();
    error.value = LIMITED;

    hold.start(900);
    expect(hold.isHeld()).toBe(true);
    expect(hold.remaining.value).toBe(900);

    vi.advanceTimersByTime(899_000);
    await nextTick();
    expect(hold.isHeld()).toBe(true);
    expect(error.value).toBe(LIMITED);

    vi.advanceTimersByTime(1000);
    await nextTick();
    expect(hold.isHeld()).toBe(false);
    expect(error.value).toBe("");
  });

  it("keeps a message that replaced the 429's meanwhile", async () => {
    const { error, hold } = mountHold();
    error.value = LIMITED;
    hold.start(10);

    error.value = "The provided password is incorrect.";
    vi.advanceTimersByTime(10_000);
    await nextTick();

    expect(hold.isHeld()).toBe(false);
    expect(error.value).toBe("The provided password is incorrect.");
  });

  it("started without a message, clears none a later failure shows", async () => {
    const { error, hold } = mountHold();
    hold.start(10);

    error.value = "";
    vi.advanceTimersByTime(10_000);
    await nextTick();

    expect(hold.isHeld()).toBe(false);
    expect(error.value).toBe("");
  });

  it("keeps its reason and the wait in words while it holds, also once the error was cleared", async () => {
    const { error, hold } = mountHold();
    error.value = LIMITED;
    hold.start(85_500, "me@example.com");
    await nextTick();

    expect(hold.note.value).toBe(LIMITED);
    expect(hold.seconds.value).toBe(85_500);
    expect(hold.spokenFor("me@example.com")).toBe("Try again in 23 hours 45 minutes.");
    // Another id isn't held, so neither its reason nor its wait shows there.
    expect(hold.shown("you@example.com")).toBe(LIMITED);
    expect(hold.spokenFor("you@example.com")).toBe("");

    // e.g. Cancel, or a new code typed.
    error.value = "";
    expect(hold.shown("me@example.com")).toBe(LIMITED);
    expect(hold.shown("you@example.com")).toBe("");
    expect(hold.spokenFor("me@example.com")).toBe("Try again in 23 hours 45 minutes.");

    // Another error on show isn't the hold's, so the wait isn't read out with it.
    error.value = "Wrong.";
    expect(hold.shown("me@example.com")).toBe("Wrong.");
    expect(hold.spokenFor("me@example.com")).toBe("");

    // The words stay as they were when it started; the key's label counts down.
    error.value = "";
    vi.advanceTimersByTime(60_000);
    expect(hold.spokenFor("me@example.com")).toBe("Try again in 23 hours 45 minutes.");
    expect(hold.label.value).toBe("Try again in 23 hr 44 min");

    vi.advanceTimersByTime(85_440_000);
    await nextTick();
    expect(hold.note.value).toBe("");
    expect(hold.shown("me@example.com")).toBe("");
    expect(hold.spokenFor("me@example.com")).toBe("");
  });

  it("names its key in words only where they keep the label in them", () => {
    const { hold } = mountHold();

    hold.start(900);
    expect(hold.label.value).toBe("Try again in 15 min");
    expect(hold.name.value).toBe("Try again in 15 minutes");

    hold.start(3900);
    expect(hold.label.value).toBe("Try again in 1 hr 5 min");
    expect(hold.name.value).toBeUndefined();
  });

  it("holds only the id it was started for", () => {
    const { hold } = mountHold();

    hold.start(60, "me@example.com");

    expect(hold.isHeld("me@example.com")).toBe(true);
    expect(hold.isHeld("you@example.com")).toBe(false);
    expect(hold.isHeld()).toBe(false);
  });

  it("stops counting with its component", () => {
    const { hold, wrapper } = mountHold();
    hold.start(60);

    wrapper.unmount();

    expect(vi.getTimerCount()).toBe(0);
  });
});
