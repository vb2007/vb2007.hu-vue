import { computed, onScopeDispose, ref } from "vue";
import { HttpStatus } from "@/constants/http";
import { Limits } from "@/constants/limits";
import { Messages } from "@/constants/messages";
import { apiErrorOf, type ApiFailure } from "@/scripts/api/client";
import { readSaved, writeSaved } from "@/scripts/utility/savedForOwner";

/**
 * Counts whole seconds down to 0, e.g. the cooldown before a code can be sent again. It counts
 * against a deadline rather than its ticks, so a throttled or suspended tab never shows more wait
 * than there is. Ticking every 250 ms keeps each second's step on time without skipping numbers.
 *
 * With a `storageKey`, `start(seconds, id)` also keeps the deadline for `id` (e.g. a normalized
 * e-mail address) in sessionStorage, and `resume(id)` picks it up again after a reload. One
 * deadline is kept per key: starting for another id replaces it.
 *
 * `start`'s `note` says why it waits, e.g. a rate limiter's message: it's kept with the deadline,
 * so after a reload `note` explains the wait again. It holds until the next `start` or `resume`.
 */
export const useCountdown = (storageKey?: string) => {
  const remaining = ref(0);
  /** Why the last started or resumed countdown waits; "" when nothing has to be said. */
  const note = ref("");
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

  /** Set once its component is gone: a start from an answer that landed after it counts nothing. */
  let isDisposed = false;

  const runUntil = (end: number) => {
    stop();
    deadline = end;
    // Nothing on screen to count for, but a kept deadline still counts for a reload.
    if (isDisposed) return;
    tick();
    timer = setInterval(tick, 250);
  };

  /**
   * (Re)starts it at `seconds`; with a storage key and an `id`, keeps the deadline for that id,
   * and `reason` as its `note`.
   */
  const start = (seconds: number, id?: string, reason = "") => {
    note.value = reason;
    if (seconds <= 0) {
      stop();
      return;
    }

    runUntil(Date.now() + seconds * 1000);
    if (storageKey && id !== undefined) {
      writeSaved(storageKey, reason ? { id, deadline, note: reason } : { id, deadline });
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

    note.value = saved.note ?? "";
    runUntil(saved.deadline);
    return true;
  };

  onScopeDispose(() => {
    isDisposed = true;
    stop();
  });

  return { remaining, active, note, start, resume, stop };
};

/**
 * The seconds to wait after a 429, sent as `retryAfter` in the body by the code cooldown and the
 * rate limiters alike (vb2007/vb2007.hu-api#242), next to the same Retry-After header. Only the body
 * is read here, and `fallback` stands in for a body without it.
 */
export const retryAfterFrom = (body: unknown, fallback = Limits.Code.cooldownSeconds): number => {
  const retryAfter = (body as { retryAfter?: unknown } | null | undefined)?.retryAfter;

  return typeof retryAfter === "number" && Number.isFinite(retryAfter) && retryAfter > 0
    ? Math.ceil(retryAfter)
    : fallback;
};

/**
 * The seconds left before another code can be mailed, when `failure` is the one-code-a-minute
 * cooldown's 429: a code went out moments ago and still works. Undefined for anything else,
 * including a rate limiter's 429, which sends `retryAfter` too but means no code was sent.
 */
export const codeCooldownOf = (failure: ApiFailure): number | undefined =>
  failure.kind === "http" &&
  failure.status === HttpStatus.TooManyRequests &&
  apiErrorOf(failure)?.startsWith(Messages.EmailCode.cooldownPrefix)
    ? retryAfterFrom(failure.body)
    : undefined;
