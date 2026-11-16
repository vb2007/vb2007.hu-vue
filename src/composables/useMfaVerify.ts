import { onScopeDispose, ref } from "vue";
import { HttpStatus } from "@/constants/http";
import { retryAfterFrom } from "@/composables/useCountdown";
import { useRetryHold } from "@/composables/useRetryHold";
import { verifyMfa } from "@/scripts/authentication/mfa";
import { currentLogin, finishedElsewhere } from "@/scripts/authentication/user";
import type { MfaVerifyBody } from "@/types/api/mfa";

/**
 * The login's second step, shared by its methods (`MfaStep` makes one and hands it to each): one
 * answer at a time, and one hold after the API's 429 for too many wrong answers a day, which no
 * method gets past.
 */
export const useMfaVerify = () => {
  const isVerifying = ref(false);
  /** The API's 400 for a wrong answer, which used a try: about what was typed or presented. */
  const refusal = ref("");
  /**
   * The step's tries left after the last wrong answer (the API's `attemptsLeft`), for every method:
   * it outlasts the refusal, which an edit or another method clears. At 0 the step is over.
   */
  const attemptsLeft = ref<number>();
  /** Any other failure: the daily limit, the network. */
  const error = ref("");
  const hold = useRetryHold(error);

  /** Returns whether the answer passed; the login is then finished. */
  const verify = async (body: MfaVerifyBody) => {
    if (isVerifying.value || hold.isHeld()) return false;
    isVerifying.value = true;
    refusal.value = error.value = "";
    const failure = await verifyMfa(body);
    isVerifying.value = false;
    if (!failure) return true;

    if (failure.status === HttpStatus.BadRequest) {
      refusal.value = failure.error;
      attemptsLeft.value = failure.body?.attemptsLeft ?? attemptsLeft.value;
    } else {
      error.value = failure.error;
      if (failure.status === HttpStatus.TooManyRequests) {
        hold.start(retryAfterFrom(failure.body));
      }
    }
    return false;
  };

  /**
   * Coming back to the tab looks the session up: the mailed link, which mail apps open in a new
   * tab, may have finished this login there. One lookup per return, not while an answer is out.
   */
  const onReturn = () => {
    if (document.hidden || isVerifying.value) return;
    void finishedElsewhere(currentLogin());
  };
  document.addEventListener("visibilitychange", onReturn);
  onScopeDispose(() => document.removeEventListener("visibilitychange", onReturn));

  return { isVerifying, refusal, attemptsLeft, error, hold, verify };
};

/** What a method of the second step is given (its `verifier` prop). */
export type MfaVerifier = ReturnType<typeof useMfaVerify>;
