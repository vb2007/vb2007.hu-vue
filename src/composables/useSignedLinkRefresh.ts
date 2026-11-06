import { computed, onScopeDispose, watch } from "vue";
import { linkExpiresAt } from "@/scripts/uploads/upload";

/** How long before a signed link stops working the page asks for fresh ones, so one just copied still works a while. */
export const SIGNED_LINK_REFRESH_LEAD_MS = 60_000;

/**
 * Private upload links are signed and stop working at their `expires` (vb2007/vb2007.hu-api#361).
 * Calls `refresh` just before the earliest of `urls` does: on time while the tab is shown, or when
 * the user comes back to the tab or the window, since a hidden or sleeping tab's timer runs late.
 * `refresh` should bring new links; until it does, this doesn't ask again on its own.
 */
export const useSignedLinkRefresh = (urls: () => string[], refresh: () => void) => {
  const refreshAt = computed(() => {
    const expiries = urls()
      .map(linkExpiresAt)
      .filter((at) => at !== undefined);
    return expiries.length ? Math.min(...expiries) - SIGNED_LINK_REFRESH_LEAD_MS : undefined;
  });

  const refreshIfDue = () => {
    if (!document.hidden && refreshAt.value !== undefined && Date.now() >= refreshAt.value) {
      refresh();
    }
  };

  let timer: ReturnType<typeof setTimeout> | undefined;
  watch(refreshAt, (at) => {
    clearTimeout(timer);
    // Links that look expired as soon as they arrive mean this clock runs ahead of the API's:
    // waiting for the user to come back keeps that from asking again and again.
    if (at !== undefined && at > Date.now()) {
      timer = setTimeout(() => {
        if (!document.hidden) refresh();
      }, at - Date.now());
    }
  });

  document.addEventListener("visibilitychange", refreshIfDue);
  window.addEventListener("focus", refreshIfDue);
  onScopeDispose(() => {
    clearTimeout(timer);
    document.removeEventListener("visibilitychange", refreshIfDue);
    window.removeEventListener("focus", refreshIfDue);
  });
};
