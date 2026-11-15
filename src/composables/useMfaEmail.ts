import { ref, watch } from "vue";
import { HttpStatus } from "@/constants/http";
import { Endpoints } from "@/constants/endpoints";
import { Limits } from "@/constants/limits";
import { Messages } from "@/constants/messages";
import {
  codeCooldownOf,
  mailBudgetOf,
  retryAfterFrom,
  useCountdown
} from "@/composables/useCountdown";
import { apiRequest } from "@/scripts/api/client";
import { currentLogin, endMfa, isCurrentLogin } from "@/scripts/authentication/user";

/**
 * Mails the second step's code and link (vb2007/vb2007.hu-api#448). The API mails one a minute and
 * `Limits.Mfa.emailsPerDay` a day per account, and none once the day's mail is used up: `wait`
 * counts down whichever it named, with its message in `error` until it ends. A failed send keeps
 * the code mailed before.
 */
export const useMfaEmail = () => {
  const isSending = ref(false);
  /** A code may be on its way for this step, so its field is offered. */
  const sent = ref(false);
  const error = ref("");
  const wait = useCountdown();

  // The wait's message is about the wait: it goes when the count ends.
  let waitMessage = "";
  watch(wait.active, (active) => {
    if (!active && error.value === waitMessage) error.value = "";
  });

  /** Returns whether a code went out. */
  const send = async () => {
    if (isSending.value || wait.active.value) return false;
    const attempt = currentLogin();
    isSending.value = true;
    error.value = "";
    const result = await apiRequest(Endpoints.Auth.mfaEmail, {
      failure: Messages.Mfa.emailFailed,
      quietStatuses: [HttpStatus.TooManyRequests]
    });
    isSending.value = false;

    if (result.ok) {
      sent.value = true;
      wait.start(Limits.Code.cooldownSeconds);
      return true;
    }
    // The step expired: back to the password, unless it was left already.
    if (result.status === HttpStatus.Forbidden) {
      if (isCurrentLogin(attempt)) endMfa(result.error);
      return false;
    }

    const cooldown = codeCooldownOf(result);
    // Inside the minute a code went out moments ago, maybe for this step.
    if (cooldown !== undefined) sent.value = true;
    error.value = cooldown === undefined ? result.error : Messages.Mfa.emailCooldown;
    // Every other 429 (the day's codes, the hourly mail limit) names its wait too.
    const seconds =
      cooldown ??
      mailBudgetOf(result) ??
      (result.status === HttpStatus.TooManyRequests ? retryAfterFrom(result.body) : undefined);
    if (seconds !== undefined) {
      waitMessage = error.value;
      wait.start(seconds);
    }
    return false;
  };

  return { isSending, sent, error, wait, send };
};
