import { onScopeDispose } from "vue";

/**
 * For a request that a newer one replaces, like a list reloaded on every search, sort or page
 * change: `next()` aborts the previous request and returns the signal for the new one, so a slow
 * earlier answer can't land after it. The one in flight is aborted when the scope goes away too.
 * After awaiting, check `signal.aborted`: an answer read just before the abort still comes back ok.
 */
export const useLatestRequest = () => {
  let current: AbortController | undefined;
  onScopeDispose(() => current?.abort(), true);

  const next = () => {
    current?.abort();
    current = new AbortController();
    return current.signal;
  };

  return { next };
};
