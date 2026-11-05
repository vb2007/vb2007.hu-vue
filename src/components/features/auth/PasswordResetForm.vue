<script setup lang="ts">
import { computed, nextTick, ref, useId, watch } from "vue";
import { RouterLink, useRouter } from "vue-router";
import { Limits } from "@/constants/limits";
import { Messages } from "@/constants/messages";
import { useCountdown } from "@/composables/useCountdown";
import { confirmPasswordReset, requestPasswordReset } from "@/scripts/authentication/passwordReset";
import {
  confirmationCodeEarlyError,
  confirmationCodeError,
  emailShapeError,
  normalizeEmail,
  passwordEarlyError,
  passwordError
} from "@/scripts/authentication/register";
import { useFormValidation } from "@/composables/useFormValidation";
import { spokenWait } from "@/scripts/utility/durationUtil";
import BaseButton from "@/components/ui/BaseButton.vue";
import BaseInput from "@/components/ui/BaseInput.vue";
import StationBoard from "@/components/ui/StationBoard.vue";
import StatusMessage from "@/components/ui/StatusMessage.vue";

const codeHint = `The ${Limits.Code.digits}-digit code from the e-mail. It works for ${Limits.Code.passwordResetValidMinutes} minutes.`;
const passwordHint = Messages.Auth.passwordHint(
  Limits.Password.minLength,
  Limits.Password.maxLength
);

/** The API allows one code a minute per address. */
const RESEND_SECONDS = Limits.Code.cooldownSeconds;
/**
 * The API answers a resend like the first code, but sends nothing within a minute of the last one,
 * which another tab or a lost countdown can't rule out.
 */
const RESENT_MESSAGE =
  "If an account uses this address, a new code is on its way, unless one was sent in the last minute: then the one before still works.";
/** Back on an address whose code is still recent, with no message of the API's to show again. */
const RECENT_MESSAGE =
  "If an account uses this address, a code was sent to it in the last minute and still works.";

const router = useRouter();
const email = ref("");
const code = ref("");
const newPassword = ref("");
/** The address on the code step; set, it moves the board there. */
const sentTo = ref("");
/** The last address a code was asked for, which the resend countdown belongs to. */
const lastSentTo = ref("");
/** The message for `lastSentTo`, shown again when the user comes back to it. */
const lastMessage = ref("");
const sentMessage = ref("");
const failure = ref("");
const isSending = ref(false);
const isResetting = ref(false);
const isButtonError = ref(false);
const step = ref<HTMLFormElement>();
const sentMessageId = useId();
const failureId = useId();
const resend = useCountdown("password-reset-cooldown");

const emailChecks = useFormValidation({
  email: { value: email, check: () => emailShapeError(email.value) }
});
const resetChecks = useFormValidation({
  code: {
    value: code,
    check: () => confirmationCodeError(code.value),
    early: () => confirmationCodeEarlyError(code.value)
  },
  newPassword: {
    value: newPassword,
    check: () => passwordError(newPassword.value),
    early: () => passwordEarlyError(newPassword.value)
  }
});
const { errors: emailErrors, isValid: isEmailValid, leave: leaveEmail } = emailChecks;
const { errors: resetErrors, isValid: isResetValid, leave: leaveReset } = resetChecks;

/** Only the address the countdown started for has to wait; any other can get a code now. */
const isResendWaiting = computed(
  () => resend.active.value && normalizeEmail(sentTo.value) === normalizeEmail(lastSentTo.value)
);

/** The waiting resend key's spelled-out name, where it keeps the visible label in it. */
const resendName = computed(() =>
  isResendWaiting.value && !isSending.value
    ? spokenWait(
        Messages.EmailCode.sendAgainIn(resend.remaining.value),
        Messages.EmailCode.sendAgainIn(resend.remaining.value, "long")
      )
    : undefined
);
/** Whether the error on show is why the resend key waits, which then describes the key. */
const failureIsWait = computed(
  () => isResendWaiting.value && !!failure.value && failure.value === resend.note.value
);

const flagError = () => {
  isButtonError.value = true;
  setTimeout(() => {
    isButtonError.value = false;
  }, 1000);
};

/** Puts the cursor in the step's first field: the e-mail, or the code. */
const focusFirstField = async () => {
  await nextTick();
  step.value?.querySelector<HTMLInputElement>("input:not([hidden])")?.focus();
};

/**
 * Holds the resend key back for `address`; the wait outlives a reload of the page. `reason` is
 * the mail limit's message when that's what it waits out, kept with it to show again.
 */
const waitBeforeResend = (address: string, seconds: number, reason = "") => {
  lastSentTo.value = address;
  resend.start(seconds, normalizeEmail(address), reason);
};

/** Whether the address on screen is the one the countdown holds back. */
const isWaitShownFor = () =>
  normalizeEmail(sentTo.value || email.value) === normalizeEmail(lastSentTo.value);

// The mail limit's message only holds until its countdown ends, like the key's wait; an error
// about another address, or another error, stays.
watch(resend.active, (waiting) => {
  if (!waiting && failure.value === resend.note.value && isWaitShownFor()) failure.value = "";
});

/** Whether `address` still has to wait for another code, also counting from before a reload. */
const isWaitingFor = (address: string) => {
  if (resend.resume(normalizeEmail(address))) {
    lastSentTo.value = address;
  }
  return resend.active.value && normalizeEmail(address) === normalizeEmail(lastSentTo.value);
};

/** `problem` is an error to show there, e.g. the mail limit a resumed wait is for. */
const showCodeStep = async (message: string, problem = "") => {
  failure.value = problem;
  sentTo.value = email.value;
  sentMessage.value = message;
  await focusFirstField();
};

/** Asks the API for a code to `address`; returns its message, or null after showing its error. */
const askForCode = async (address: string, onCodeStep: boolean) => {
  isSending.value = true;
  failure.value = "";
  try {
    const answer = await requestPasswordReset(address);

    if (answer.error) {
      failure.value = answer.error;
      // Only the code step has a key to hold back; the e-mail step just shows the error.
      if (onCodeStep && answer.retryAfter) {
        waitBeforeResend(address, answer.retryAfter, answer.error);
      }
      flagError();
      return null;
    }

    lastMessage.value = answer.message!;
    waitBeforeResend(address, RESEND_SECONDS);
    return answer.message!;
  } finally {
    isSending.value = false;
  }
};

const handleSend = async () => {
  if (!(await emailChecks.validate(step.value))) {
    flagError();
    return;
  }

  // A code went to this address moments ago and the API wouldn't send another yet. A wait for
  // the mail limit says so instead: the last code may be older than a minute.
  if (isWaitingFor(email.value)) {
    const limit = resend.note.value;
    await showCodeStep(lastMessage.value || (limit ? "" : RECENT_MESSAGE), limit);
    return;
  }

  const message = await askForCode(email.value, false);
  if (message !== null) {
    await showCodeStep(message);
  }
};

/** For a code that already arrived, e.g. after a reload: nothing is sent. */
const enterCode = async () => {
  if (await emailChecks.validate(step.value)) {
    // Picks up the countdown, so the key doesn't offer a code the API wouldn't send yet, and
    // says why when it's the mail limit's.
    const waiting = isWaitingFor(email.value);
    await showCodeStep("", waiting ? resend.note.value : "");
  }
};

const sendAgain = async () => {
  if ((await askForCode(sentTo.value, true)) !== null) {
    sentMessage.value = RESENT_MESSAGE;
    // A code typed before was most likely the one that didn't work.
    code.value = "";
    resetChecks.reset();
  }
  // The key is disabled now, which drops focus; the code is what comes next anyway.
  await focusFirstField();
};

/** Back to the e-mail step, keeping the address; the countdown keeps running for it. */
const changeAddress = async () => {
  sentTo.value = "";
  sentMessage.value = "";
  code.value = "";
  newPassword.value = "";
  failure.value = "";
  resetChecks.reset();
  await focusFirstField();
};

const handleReset = async () => {
  if (!(await resetChecks.validate(step.value))) {
    flagError();
    return;
  }

  isResetting.value = true;
  failure.value = "";
  try {
    const answer = await confirmPasswordReset(sentTo.value, code.value, newPassword.value);

    if (answer.error) {
      failure.value = answer.error;
      flagError();
      return;
    }

    await router.push("/login");
  } finally {
    isResetting.value = false;
  }
};
</script>

<template>
  <StationBoard title="Reset password" as="h1">
    <template v-if="!sentTo">
      <form ref="step" class="form" novalidate @submit.prevent="handleSend">
        <p>Enter your account's e-mail address to get a code for a new password.</p>
        <BaseInput
          v-model="email"
          label="E-mail"
          type="email"
          autocomplete="email"
          :error="emailErrors.email"
          required
          @blur="leaveEmail('email')"
        />
        <StatusMessage v-if="failure" tone="error">{{ failure }}</StatusMessage>
        <BaseButton
          type="submit"
          block
          :loading="isSending"
          :blocked="!isEmailValid"
          :error="isButtonError"
        >
          {{ isSending ? "Sending" : "Send code" }}
        </BaseButton>
      </form>
      <div class="alt">
        <p>
          Already have a code?
          <button type="button" class="link" :disabled="isSending" @click="enterCode">
            Enter it
          </button>
        </p>
        <p>Remembered it? <RouterLink to="/login">Log in</RouterLink></p>
      </div>
    </template>

    <template v-else>
      <form ref="step" class="form" novalidate @submit.prevent="handleReset">
        <!-- Tells password managers which login the new password belongs to. -->
        <input type="email" autocomplete="username" :value="sentTo" readonly hidden />
        <StatusMessage v-if="sentMessage" :id="sentMessageId" tone="info">
          {{ sentMessage }}
        </StatusMessage>
        <div class="sent-to">
          <p class="sent-to__fact">
            <span class="sent-to__label">E-mail</span>
            <span class="sent-to__address">{{ sentTo }}</span>
          </p>
          <BaseButton
            class="sent-to__change"
            variant="ghost"
            size="sm"
            :disabled="isSending"
            @click="changeAddress"
          >
            Change
          </BaseButton>
        </div>
        <BaseInput
          v-model="code"
          label="Code"
          :hint="codeHint"
          :describedby="sentMessage ? sentMessageId : undefined"
          autocomplete="one-time-code"
          inputmode="numeric"
          :error="resetErrors.code"
          mono
          required
          @blur="leaveReset('code')"
        />
        <BaseInput
          v-model="newPassword"
          label="New password"
          type="password"
          autocomplete="new-password"
          :hint="passwordHint"
          :error="resetErrors.newPassword"
          required
          @blur="leaveReset('newPassword')"
        />
        <StatusMessage v-if="failure" :id="failureId" tone="error">{{ failure }}</StatusMessage>
        <BaseButton
          type="submit"
          block
          :loading="isResetting"
          :blocked="!isResetValid"
          :error="isButtonError"
        >
          {{ isResetting ? "Resetting" : "Reset password" }}
        </BaseButton>
      </form>
      <div class="resend">
        <p>No code yet?</p>
        <BaseButton
          class="resend__key"
          variant="secondary"
          size="sm"
          :loading="isSending"
          :disabled="isResendWaiting"
          :aria-label="resendName"
          :aria-describedby="failureIsWait ? failureId : undefined"
          @click="sendAgain"
        >
          {{
            isSending
              ? "Sending"
              : isResendWaiting
                ? Messages.EmailCode.sendAgainIn(resend.remaining.value)
                : "Send again"
          }}
        </BaseButton>
      </div>
    </template>
  </StationBoard>
</template>

<style scoped>
.form {
  display: grid;
  gap: var(--sp-4);
}

.alt,
.resend {
  font-size: var(--fs-sm);
}

.alt {
  display: grid;
  gap: var(--sp-1);
}

/* A button that reads like the links beside it */
.link {
  padding: 0;
  border: 0;
  background: none;
  color: var(--c-action);
  text-decoration: underline;
  text-decoration-thickness: 0.09em;
  text-underline-offset: 0.18em;
  cursor: pointer;
}

.link:hover:not(:disabled) {
  text-decoration-thickness: 0.16em;
}

.link:disabled {
  color: var(--c-ink-soft);
  cursor: not-allowed;
}

.sent-to {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp-3);
  padding-bottom: var(--sp-3);
  border-bottom: var(--edge) solid var(--c-hairline);
}

.sent-to__fact {
  display: grid;
  gap: var(--sp-1);
  min-width: 0;
}

.sent-to__label {
  font-size: var(--fs-sm);
  font-weight: 600;
  color: var(--c-ink-soft);
}

.sent-to__change {
  flex: none;
}

.sent-to__address {
  font-weight: 600;
  overflow-wrap: anywhere;
}

.resend {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: var(--sp-2) var(--sp-3);
  color: var(--c-ink-soft);
}

.resend__key {
  font-variant-numeric: tabular-nums;
}
</style>
