import { computed, ref, watch, type Ref } from "vue";
import { Messages } from "@/constants/messages";
import { useCountdown } from "@/composables/useCountdown";
import { spokenWait } from "@/scripts/utility/durationUtil";

/**
 * Holds a form's submit after a rate limiter's 429 until its `retryAfter` has passed
 * (vb2007/vb2007.hu-api#254), since the API would refuse every try until then, even a right one.
 * `error` is where the form shows the 429's message. A hold can be for one `id` (e.g. a normalized
 * address), so another can be tried at once. It's kept in memory only: a reload ends it, and the
 * API's next 429 starts it again.
 *
 * The message is the hold's `note`: `shown(id)` falls back to it while the hold runs, so a key that
 * still waits keeps its reason when the form clears `error` (Cancel, a new code typed). It goes
 * when the hold ends, from `error` too unless something else replaced it meanwhile. `spokenFor(id)`
 * is the wait in words, fixed when the hold started, for screen readers: the counting key is
 * disabled, so they'd never reach it.
 */
export const useRetryHold = (error: Ref<string>) => {
  const countdown = useCountdown();
  const heldFor = ref("");
  /** The 429's message, while the hold runs. */
  const note = ref("");
  /** "Try again in 15 minutes.", as it was when the hold started. */
  const spoken = ref("");
  /** How long the hold was when it started. */
  const seconds = ref(0);

  /** Lets go of the message, from `error` too unless something else replaced it meanwhile. */
  const release = () => {
    if (note.value && error.value === note.value) error.value = "";
    note.value = spoken.value = "";
  };

  watch(countdown.active, (active) => {
    if (!active) release();
  });

  /** Holds the submit for `wait` seconds, with the message `error` shows now; for `id`, if given. */
  const start = (wait: number, id = "") => {
    heldFor.value = id;
    note.value = error.value;
    spoken.value = Messages.tryAgainSpoken(wait);
    seconds.value = wait;
    countdown.start(wait);
  };

  /**
   * Ends the hold early, e.g. when what it held is gone from the page; its message goes as at the
   * end of the count.
   */
  const stop = () => {
    countdown.stop();
    release();
  };

  /** Whether the submit waits: for `id`, when the hold is for one. */
  const isHeld = (id = "") => countdown.active.value && heldFor.value === id;

  /** The error to show: the form's own, or the hold's message while it holds `id`. */
  const shown = (id = "") => error.value || (isHeld(id) ? note.value : "");

  /**
   * The spoken wait, while the message on show is the hold's own; "" otherwise. A form that picks
   * its message itself, rather than with `shown`, passes the one it shows.
   */
  const spokenFor = (id = "", message = shown(id)) =>
    isHeld(id) && note.value && message === note.value ? spoken.value : "";

  /** The held key's label, counting down ("Try again in 15 min"). */
  const label = computed(() => Messages.tryAgainIn(countdown.remaining.value));
  /** The held key's spelled-out name, where it keeps the visible label in it (`spokenWait`). */
  const name = computed(() =>
    spokenWait(label.value, Messages.tryAgainIn(countdown.remaining.value, "long"))
  );

  return {
    remaining: countdown.remaining,
    seconds,
    note,
    label,
    name,
    isHeld,
    shown,
    spokenFor,
    start,
    stop
  };
};
