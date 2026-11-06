import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CONFIRM_DELETE_MS, useConfirmDelete } from "@/composables/useConfirmDelete";
import { mountComposable } from "@/__tests__/helpers/host";

describe("useConfirmDelete", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("arms on the first press and deletes on the second", () => {
    const { api } = mountComposable(() => useConfirmDelete());
    const remove = vi.fn(() => "removed");

    expect(api.press("a", remove)).toBeUndefined();
    expect(api.isArmed("a")).toBe(true);
    expect(remove).not.toHaveBeenCalled();

    expect(api.press("a", remove)).toBe("removed");
    expect(remove).toHaveBeenCalledOnce();
    expect(api.isArmed("a")).toBe(false);
  });

  it("wears off after a while", () => {
    const { api } = mountComposable(() => useConfirmDelete());
    api.press("a", vi.fn());

    vi.advanceTimersByTime(CONFIRM_DELETE_MS - 1);
    expect(api.isArmed("a")).toBe(true);
    vi.advanceTimersByTime(1);
    expect(api.armedId.value).toBe("");
  });

  it("arms one row at a time, and the newer one gets the full wait", () => {
    const { api } = mountComposable(() => useConfirmDelete());
    const remove = vi.fn();
    api.press("a", remove);
    vi.advanceTimersByTime(CONFIRM_DELETE_MS - 1);

    api.press("b", remove);
    expect(api.isArmed("a")).toBe(false);
    expect(api.isArmed("b")).toBe(true);
    vi.advanceTimersByTime(1);
    expect(api.isArmed("b")).toBe(true);
    expect(remove).not.toHaveBeenCalled();
  });

  it("disarms on request, and stops its timer when it goes away", () => {
    const { api, wrapper } = mountComposable(() => useConfirmDelete());
    api.press("a", vi.fn());
    api.disarm();
    expect(api.isArmed("a")).toBe(false);

    api.press("a", vi.fn());
    wrapper.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
