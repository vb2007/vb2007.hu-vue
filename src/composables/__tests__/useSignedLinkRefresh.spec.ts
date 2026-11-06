import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { effectScope, nextTick, ref } from "vue";
import {
  SIGNED_LINK_REFRESH_LEAD_MS,
  useSignedLinkRefresh
} from "@/composables/useSignedLinkRefresh";

const NOW = Date.UTC(2026, 10, 6, 12);
const MINUTE = 60_000;

/** A private link signed to stop working `minutes` from now. */
const signed = (minutes: number) =>
  `https://cdn.test/useruploads/u1/a.png?expires=${(NOW + minutes * MINUTE) / 1000}&sig=x`;
const plain = "https://cdn.test/useruploads/u1/b.png";

let hidden = false;

const start = (initial: string[] = []) => {
  const urls = ref<string[]>([]);
  const refresh = vi.fn(() => true);
  const scope = effectScope();
  const { refreshIfDue } = scope.run(() => useSignedLinkRefresh(() => urls.value, refresh))!;
  urls.value = initial;
  return { urls, refresh, scope, refreshIfDue };
};

const comeBack = () => document.dispatchEvent(new Event("visibilitychange"));

describe("useSignedLinkRefresh", () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: NOW });
    hidden = false;
    vi.spyOn(document, "hidden", "get").mockImplementation(() => hidden);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("refreshes just before the earliest signed link stops working", async () => {
    const { refresh } = start([plain, signed(60), signed(30)]);
    await nextTick();

    vi.advanceTimersByTime(30 * MINUTE - SIGNED_LINK_REFRESH_LEAD_MS - 1);
    expect(refresh).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("waits again for the new links, and not at all for plain ones", async () => {
    const { urls, refresh } = start([signed(10)]);
    await nextTick();

    urls.value = [signed(60)];
    await nextTick();
    vi.advanceTimersByTime(10 * MINUTE);
    expect(refresh).not.toHaveBeenCalled();

    urls.value = [plain];
    await nextTick();
    vi.advanceTimersByTime(120 * MINUTE);
    comeBack();
    window.dispatchEvent(new Event("focus"));
    expect(refresh).not.toHaveBeenCalled();
  });

  it("leaves a hidden tab alone until the user comes back to it", async () => {
    const { refresh } = start([signed(10)]);
    await nextTick();
    hidden = true;

    vi.advanceTimersByTime(30 * MINUTE);
    comeBack();
    expect(refresh).not.toHaveBeenCalled();

    hidden = false;
    comeBack();
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("refreshes on focus only once the links are due", async () => {
    const { refresh } = start([signed(10)]);
    await nextTick();

    window.dispatchEvent(new Event("focus"));
    expect(refresh).not.toHaveBeenCalled();

    // A sleeping machine's timer runs late: the clock moved on, the timer didn't fire.
    vi.setSystemTime(NOW + 10 * MINUTE);
    window.dispatchEvent(new Event("focus"));
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("never asks for links that arrive already due, as with a clock that runs ahead", async () => {
    const { refresh } = start([signed(0)]);
    await nextTick();

    vi.advanceTimersByTime(120 * MINUTE);
    comeBack();
    window.dispatchEvent(new Event("focus"));
    expect(refresh).not.toHaveBeenCalled();
  });

  it("asks once per set of links, however often the user comes back", async () => {
    const { refresh } = start([signed(10)]);
    await nextTick();

    vi.advanceTimersByTime(10 * MINUTE);
    comeBack();
    window.dispatchEvent(new Event("focus"));
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("asks again when a refresh was held back, e.g. once an edit is done", async () => {
    const { refresh, refreshIfDue } = start([signed(10)]);
    await nextTick();
    refresh.mockReturnValueOnce(false);

    vi.advanceTimersByTime(10 * MINUTE);
    expect(refresh).toHaveBeenCalledTimes(1);
    refreshIfDue();
    expect(refresh).toHaveBeenCalledTimes(2);
    refreshIfDue();
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it("waits out a link further off than a timer can wait at once", async () => {
    const days = 30 * 24 * 60;
    const { refresh } = start([signed(days)]);
    await nextTick();

    vi.advanceTimersByTime(2 ** 31 - 1);
    expect(refresh).not.toHaveBeenCalled();
    vi.advanceTimersByTime(days * MINUTE - SIGNED_LINK_REFRESH_LEAD_MS - (2 ** 31 - 1));
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("stops listening and waiting when its scope goes away", async () => {
    const { refresh, scope } = start([signed(10)]);
    await nextTick();

    scope.stop();
    vi.advanceTimersByTime(30 * MINUTE);
    comeBack();
    window.dispatchEvent(new Event("focus"));
    expect(refresh).not.toHaveBeenCalled();
  });
});
