import { computed, onScopeDispose, ref } from "vue";
import { HttpStatus } from "@/constants/http";
import type { ApiResult } from "@/scripts/api/client";
import { readSaved, writeSaved } from "@/scripts/utility/savedForOwner";

/**
 * Counts whole seconds down to 0, e.g. the cooldown before a code can be sent again. It counts
 * against a deadline rather than its ticks, so a throttled or suspended tab never shows more wait
 * than there is. Ticking every 250 ms keeps each second's step on time without skipping numbers.
 *
 * With a `storageKey`, `start(seconds, id)` also keeps the deadline for `id` (e.g. a normalized
 * e-mail address) in sessionStorage, and `resume(id)` picks it up again after a reload. One
 * deadline is kept per key: starting for another id replaces it.
 */
export const useCountdown = (storageKey?: string) => {
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

  const runUntil = (end: number) => {
    stop();
    deadline = end;
    tick();
    timer = setInterval(tick, 250);
  };

  /** (Re)starts it at `seconds`; with a storage key and an `id`, keeps the deadline for that id. */
  const start = (seconds: number, id?: string) => {
    if (seconds <= 0) {
      stop();
      return;
    }

    runUntil(Date.now() + seconds * 1000);
    if (storageKey && id !== undefined) {
      writeSaved(storageKey, { id, deadline });
    }
  };

  /**
   * Restarts the countdown kept for `id`, if its deadline is still ahead. Returns whether it did;
   * otherwise (nothing kept for `id`, expired, no storage) it leaves the current countdown alone.
   */
  const resume = (id: string) => {
    const saved = storageKey ? readSaved(storageKey) : null;

    if (!saved || saved.id !== id || saved.deadline <= Date.now()) {
      return false;
    }

    runUntil(saved.deadline);
    return true;
  };

  onScopeDispose(stop);

  return { remaining, active, start, resume, stop };
};

/**
 * The seconds to wait, when `result` is the one-code-a-minute cooldown's 429, which sends them as
 * `retryAfter` in the body; otherwise undefined. The rate limiters' 429s don't send them, and their
 * wait (up to an hour) can't be read either, since the Retry-After header isn't exposed to the
 * page: such a 429 gets no countdown, as one would end while the API still refuses.
 */
export const retryAfterFrom = (result: ApiResult<unknown>): number | undefined => {
  if (result.ok || result.kind !== "http" || result.status !== HttpStatus.TooManyRequests) {
    return undefined;
  }
  const retryAfter: unknown = result.body?.retryAfter;

  return typeof retryAfter === "number" && Number.isFinite(retryAfter) && retryAfter > 0
    ? Math.ceil(retryAfter)
    : undefined;
};
