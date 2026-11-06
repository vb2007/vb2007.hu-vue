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
  const refresh = vi.fn();
  const scope = effectScope();
  scope.run(() => useSignedLinkRefresh(() => urls.value, refresh));
  urls.value = initial;
  return { urls, refresh, scope };
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

  it("doesn't keep asking when links arrive already due, as with a clock that runs ahead", async () => {
    const { refresh } = start([signed(0)]);
    await nextTick();

    vi.advanceTimersByTime(120 * MINUTE);
    expect(refresh).not.toHaveBeenCalled();
    comeBack();
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
