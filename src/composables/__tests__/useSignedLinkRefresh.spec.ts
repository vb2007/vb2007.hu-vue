import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises } from "@vue/test-utils";
import { effectScope, nextTick, ref } from "vue";
import {
  SIGNED_LINK_REFRESH_LEAD_MS,
  useSignedLinkRefresh
} from "@/composables/useSignedLinkRefresh";

const NOW = Date.UTC(2026, 10, 6, 12);
const MINUTE = 60_000;
const LEAD = SIGNED_LINK_REFRESH_LEAD_MS / MINUTE;

/** A private link signed to expire `minutes` from now. */
const signed = (minutes: number) =>
  `https://cdn.test/useruploads/u1/a.png?expires=${(NOW + minutes * MINUTE) / 1000}&sig=x`;
const plain = "https://cdn.test/useruploads/u1/b.png";

let hidden = false;

const start = (initial: string[] = []) => {
  const urls = ref<string[]>(initial);
  const refresh = vi.fn(() => Promise.resolve(true));
  const scope = effectScope();
  const { refreshIfDue } = scope.run(() => useSignedLinkRefresh(() => urls.value, refresh))!;
  return { urls, refresh, scope, refreshIfDue };
};

const comeBack = () => document.dispatchEvent(new Event("visibilitychange"));
const focus = () => window.dispatchEvent(new Event("focus"));

describe("useSignedLinkRefresh", () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: NOW });
    hidden = false;
    vi.spyOn(document, "hidden", "get").mockImplementation(() => hidden);
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = "";
  });

  it("refreshes the lead before the earliest signed link expires, for links it starts with", () => {
    const { refresh } = start([plain, signed(60), signed(30)]);

    vi.advanceTimersByTime((30 - LEAD) * MINUTE - 1);
    expect(refresh).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("waits again for the new links, and not at all for plain ones", async () => {
    const { urls, refresh } = start([signed(30)]);

    urls.value = [signed(60)];
    await nextTick();
    vi.advanceTimersByTime(30 * MINUTE);
    expect(refresh).not.toHaveBeenCalled();

    urls.value = [plain];
    await nextTick();
    vi.advanceTimersByTime(120 * MINUTE);
    comeBack();
    focus();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("leaves a hidden tab alone until the user comes back to it", () => {
    const { refresh } = start([signed(30)]);
    hidden = true;

    vi.advanceTimersByTime(60 * MINUTE);
    comeBack();
    expect(refresh).not.toHaveBeenCalled();

    hidden = false;
    comeBack();
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("refreshes a hidden tab that's playing a video or song, so it carries on", () => {
    const { refresh } = start([signed(30)]);
    const song = document.createElement("audio");
    Object.defineProperty(song, "paused", { value: false });
    document.body.append(song, document.createElement("video"));
    hidden = true;

    vi.advanceTimersByTime((30 - LEAD) * MINUTE);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("refreshes on focus only once the links are due", () => {
    const { refresh } = start([signed(30)]);

    focus();
    expect(refresh).not.toHaveBeenCalled();

    // A sleeping machine's timer runs late: the clock moved on, the timer didn't fire.
    vi.setSystemTime(NOW + 30 * MINUTE);
    focus();
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("never asks for links that arrive already due, as with a clock that runs ahead", () => {
    const { refresh } = start([signed(LEAD)]);

    vi.advanceTimersByTime(120 * MINUTE);
    comeBack();
    focus();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("asks once per set of links once they're renewed, however often the user comes back", async () => {
    const { refresh } = start([signed(30)]);
    vi.setSystemTime(NOW + 30 * MINUTE);

    focus();
    focus();
    await flushPromises();
    comeBack();
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("asks again after a refresh that failed: on return, or when the network is back", async () => {
    const { refresh } = start([signed(30)]);
    refresh.mockResolvedValueOnce(false).mockResolvedValueOnce(false);

    vi.advanceTimersByTime(30 * MINUTE);
    await flushPromises();
    expect(refresh).toHaveBeenCalledTimes(1);

    focus();
    await flushPromises();
    window.dispatchEvent(new Event("online"));
    await flushPromises();
    focus();
    expect(refresh).toHaveBeenCalledTimes(3);
  });

  it("asks again when a refresh was held back, e.g. once an edit is done", async () => {
    const { refresh, refreshIfDue } = start([signed(30)]);
    refresh.mockResolvedValueOnce(false);

    vi.advanceTimersByTime(30 * MINUTE);
    await flushPromises();
    await refreshIfDue();
    await refreshIfDue();
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it("waits out a link further off than a timer can wait at once", () => {
    const days = 30 * 24 * 60;
    const { refresh } = start([signed(days)]);

    vi.advanceTimersByTime(2 ** 31 - 1);
    expect(refresh).not.toHaveBeenCalled();
    vi.advanceTimersByTime((days - LEAD) * MINUTE - (2 ** 31 - 1));
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("stops listening and waiting when its scope goes away", () => {
    const { refresh, scope } = start([signed(30)]);

    scope.stop();
    vi.advanceTimersByTime(60 * MINUTE);
    comeBack();
    focus();
    window.dispatchEvent(new Event("online"));
    expect(refresh).not.toHaveBeenCalled();
  });
});
