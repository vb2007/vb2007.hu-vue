import { computed, onScopeDispose, watch } from "vue";
import { linkExpiresAt } from "@/scripts/uploads/upload";

/** How long before a signed link expires the page asks for new ones, so one just copied still works a while. */
export const SIGNED_LINK_REFRESH_LEAD_MS = 60_000;

/** The longest wait `setTimeout` takes; a longer one would fire at once. */
const MAX_TIMER_MS = 2 ** 31 - 1;

/**
 * Private upload links are signed and expire (vb2007/vb2007.hu-api#361). Calls `refresh` just
 * before the earliest of `urls` does: on time while the tab is shown, or when the user comes back
 * to the tab or the window, since a hidden or sleeping tab's timer runs late. `refresh` says
 * whether it asked for new links; each set of links is asked for once, so a refresh that failed
 * waits for new links (or `refreshIfDue`) rather than repeating on every return to the tab.
 */
export const useSignedLinkRefresh = (urls: () => string[], refresh: () => boolean) => {
  const refreshAt = computed(() => {
    const expiries = urls()
      .map(linkExpiresAt)
      .filter((at) => at !== undefined);
    return expiries.length ? Math.min(...expiries) - SIGNED_LINK_REFRESH_LEAD_MS : undefined;
  });
  /** The `refreshAt` already asked for, or not worth asking for. */
  let settled: number | undefined;

  /** Refreshes if the links are due and haven't been asked for; e.g. after an edit held it back. */
  const refreshIfDue = () => {
    const at = refreshAt.value;
    if (document.hidden || at === undefined || at === settled || Date.now() < at) return;
    if (refresh()) settled = at;
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

  watch(refreshAt, (at) => {
    clearTimeout(timer);
    if (at === undefined) return;
    // Links that are due as they arrive mean this clock runs ahead of the API's: asking again
    // would bring the same, so this set is never asked for.
    if (at <= Date.now()) settled = at;
    else wait(at);
  });

  document.addEventListener("visibilitychange", onReturn);
  window.addEventListener("focus", onReturn);
  onScopeDispose(() => {
    clearTimeout(timer);
    document.removeEventListener("visibilitychange", onReturn);
    window.removeEventListener("focus", onReturn);
  });

  return { refreshIfDue };
};
