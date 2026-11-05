import { ref, watch, type Ref } from "vue";
import { useCountdown } from "@/composables/useCountdown";

/**
 * Holds a form's submit after a rate limiter's 429 until its `retryAfter` has passed
 * (vb2007/vb2007.hu-api#254), since the API would refuse every try until then, even a right one.
 * `error` is where the form shows the 429's message: it goes when the hold ends, unless something
 * else replaced it meanwhile. A hold can be for one `id` (e.g. a normalized address), so another
 * can be tried at once. It's kept in memory only: a reload ends it, and the API's next 429 starts
 * it again.
 */
export const useRetryHold = (error: Ref<string>) => {
  const countdown = useCountdown();
  const heldFor = ref("");
  /** The 429's message, which only holds until the countdown ends. */
  let heldError = "";

  watch(countdown.active, (active) => {
    if (active) return;
    if (heldError && error.value === heldError) error.value = "";
    heldError = "";
  });

  /** Holds the submit for `seconds`, with the message `error` shows now; for `id`, if given. */
  const start = (seconds: number, id = "") => {
    heldFor.value = id;
    heldError = error.value;
    countdown.start(seconds);
  };

  /** Whether the submit waits: for `id`, when the hold is for one. */
  const isHeld = (id = "") => countdown.active.value && heldFor.value === id;

  return { remaining: countdown.remaining, isHeld, start };
};
