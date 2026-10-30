import { computed, onScopeDispose, ref } from "vue";

/**
 * Counts whole seconds down to 0, e.g. the cooldown before a code can be sent again. It counts
 * against a deadline rather than its ticks, so a throttled or suspended tab never shows more wait
 * than there is. Ticking every 250 ms keeps each second's step on time without skipping numbers.
 */
export const useCountdown = () => {
  const remaining = ref(0);
  const active = computed(() => remaining.value > 0);
  let deadline = 0;
  let timer: ReturnType<typeof setInterval> | undefined;

  const stop = () => {
    clearInterval(timer);
    timer = undefined;
    remaining.value = 0;
  };

  const tick = () => {
    remaining.value = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));

    if (remaining.value === 0) {
      stop();
    }
  };

  /** (Re)starts it at `seconds`. */
  const start = (seconds: number) => {
    stop();

    if (seconds > 0) {
      deadline = Date.now() + seconds * 1000;
      tick();
      timer = setInterval(tick, 250);
    }
  };

  onScopeDispose(stop);

  return { remaining, active, start, stop };
};

/**
 * The seconds to wait after a 429. The resend cooldown sends them as `retryAfter` in the body;
 * the rate limiters don't, and the Retry-After header isn't exposed to the page, hence `fallback`.
 */
export const retryAfterFrom = (body: unknown, fallback = 60): number => {
  const retryAfter = (body as { retryAfter?: unknown } | null | undefined)?.retryAfter;

  return typeof retryAfter === "number" && Number.isFinite(retryAfter) && retryAfter > 0
    ? Math.ceil(retryAfter)
    : fallback;
};
