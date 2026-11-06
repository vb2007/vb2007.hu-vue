import { computed, onScopeDispose, watch } from "vue";
import { linkExpiresAt } from "@/scripts/uploads/upload";

/**
 * How long before a signed link expires the page asks for new ones. Ten minutes, so a link copied
 * from the page always has at least that long left.
 */
export const SIGNED_LINK_REFRESH_LEAD_MS = 10 * 60_000;

/** The longest wait `setTimeout` takes; a longer one would fire at once. */
const MAX_TIMER_MS = 2 ** 31 - 1;

/** A video or song playing on the page, which a hidden tab still needs working links for. */
const isPlaying = () =>
  [...document.querySelectorAll<HTMLMediaElement>("audio, video")].some((media) => !media.paused);

/**
 * Private upload links are signed and expire (vb2007/vb2007.hu-api#361). Calls `refresh` once the
 * earliest of `urls` is due, `SIGNED_LINK_REFRESH_LEAD_MS` before it expires: on time while the
 * tab is shown (or playing something), or when the user comes back to the tab or the window, or
 * the network comes back, since a hidden or sleeping tab's timer runs late.
 *
 * `refresh` resolves to whether it brought new links. A set of links is asked for again until one
 * does (on the next return or reconnect), and never after: coming back to the tab doesn't reload it
 * again and again. `false` straight away holds it back, e.g. during an edit; `refreshIfDue` asks
 * again once that's over.
 */
export const useSignedLinkRefresh = (urls: () => string[], refresh: () => Promise<boolean>) => {
  const refreshAt = computed(() => {
    const expiries = urls()
      .map(linkExpiresAt)
      .filter((at) => at !== undefined);
    return expiries.length ? Math.min(...expiries) - SIGNED_LINK_REFRESH_LEAD_MS : undefined;
  });
  /** The `refreshAt` already renewed, or not worth renewing. */
  let settled: number | undefined;
  let running = false;

  const refreshIfDue = async () => {
    const at = refreshAt.value;
    if (running || at === undefined || at === settled || Date.now() < at) return;
    if (document.hidden && !isPlaying()) return;
    running = true;
    const renewed = await refresh();
    running = false;
    if (renewed) settled = at;
  };
  const onReturn = () => refreshIfDue();

  let timer: ReturnType<typeof setTimeout> | undefined;
  const wait = (at: number) => {
    // A long wait is cut to what `setTimeout` takes, and one that wakes early waits for the rest.
    timer = setTimeout(
      () => (Date.now() < at ? wait(at) : refreshIfDue()),
      Math.min(at - Date.now(), MAX_TIMER_MS)
    );
  };

  watch(
    refreshAt,
    (at) => {
      clearTimeout(timer);
      if (at === undefined) return;
      // Links that are due as they arrive mean this clock runs ahead of the API's: asking again
      // would bring the same, so this set is never asked for.
      if (at <= Date.now()) settled = at;
      else wait(at);
    },
    { immediate: true }
  );

  document.addEventListener("visibilitychange", onReturn);
  window.addEventListener("focus", onReturn);
  window.addEventListener("online", onReturn);
  onScopeDispose(() => {
    clearTimeout(timer);
    document.removeEventListener("visibilitychange", onReturn);
    window.removeEventListener("focus", onReturn);
    window.removeEventListener("online", onReturn);
  });

  return { refreshIfDue };
};
