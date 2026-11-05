import { computed, onScopeDispose, ref } from "vue";
import { Limits } from "@/constants/limits";
import { Messages } from "@/constants/messages";
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
 * The seconds to wait after a 429: its body's `retryAfter`, which the resend cooldown and every
 * rate limiter send (vb2007/vb2007.hu-api#254). `fallback` covers a 429 without a usable one.
 */
export const retryAfterFrom = (body: unknown, fallback = Limits.Code.cooldownSeconds): number => {
  const retryAfter = (body as { retryAfter?: unknown } | null | undefined)?.retryAfter;

  return typeof retryAfter === "number" && Number.isFinite(retryAfter) && retryAfter > 0
    ? Math.ceil(retryAfter)
    : fallback;
};

/**
 * Whether a 429's body is the per-address resend cooldown (a code went out moments ago and still
 * works), not a rate limiter's. Both send `retryAfter`; only the cooldown's message starts this way.
 */
export const isResendCooldown = (body: unknown): boolean => {
  const error = (body as { error?: unknown } | null | undefined)?.error;

  return typeof error === "string" && error.startsWith(Messages.EmailCode.cooldownPrefix);
};
