<script setup lang="ts">
import { nextTick, ref } from "vue";
import { RouterLink, useRouter } from "vue-router";
import { useCountdown } from "@/composables/useCountdown";
import { confirmPasswordReset, requestPasswordReset } from "@/scripts/authentication/passwordReset";
import { passwordLengthError } from "@/scripts/authentication/register";
import BaseButton from "@/components/ui/BaseButton.vue";
import BaseInput from "@/components/ui/BaseInput.vue";
import StationBoard from "@/components/ui/StationBoard.vue";
import StatusMessage from "@/components/ui/StatusMessage.vue";

/** The API allows one code a minute per address. */
const RESEND_SECONDS = 60;

const router = useRouter();
const email = ref("");
const code = ref("");
const newPassword = ref("");
/** The address the code went to; set once it was sent, which moves the board to the code step. */
const sentTo = ref("");
const sentMessage = ref("");
const failure = ref("");
const isSending = ref(false);
const isResetting = ref(false);
const isButtonError = ref(false);
const step = ref<HTMLFormElement>();
const resend = useCountdown();

const flagError = () => {
  isButtonError.value = true;
  setTimeout(() => {
    isButtonError.value = false;
  }, 1000);
};

/** Puts the cursor in a step's first field, since the step's form replaces the one it was in. */
const focusFirstField = async () => {
  await nextTick();
  step.value?.querySelector<HTMLInputElement>("input:not([hidden])")?.focus();
};

const formatSeconds = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

/** Sends a code to `email`, first from the e-mail step, then again from the code step. */
const sendCode = async () => {
  isSending.value = true;
  failure.value = "";
  try {
    const answer = await requestPasswordReset(email.value);

    if (answer.error) {
      failure.value = answer.error;
      if (answer.retryAfter) resend.start(answer.retryAfter);
      flagError();
      return;
    }

    sentMessage.value = answer.message!;
    resend.start(RESEND_SECONDS);
    if (!sentTo.value) {
      sentTo.value = email.value;
      await focusFirstField();
    }
  } finally {
    isSending.value = false;
  }
};

const changeAddress = async () => {
  sentTo.value = "";
  sentMessage.value = "";
  code.value = "";
  newPassword.value = "";
  failure.value = "";
  resend.stop();
  await focusFirstField();
};

const handleReset = async () => {
  const problem = passwordLengthError(newPassword.value);
  if (problem) {
    failure.value = problem;
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
      <form ref="step" class="form" @submit.prevent="sendCode">
        <p>Enter your account's e-mail address to get a code for a new password.</p>
        <BaseInput v-model="email" label="E-mail" type="email" autocomplete="email" required />
        <StatusMessage v-if="failure" tone="error">{{ failure }}</StatusMessage>
        <BaseButton type="submit" block :loading="isSending" :error="isButtonError">
          {{ isSending ? "Sending" : "Send code" }}
        </BaseButton>
      </form>
      <p class="alt">Remembered it? <RouterLink to="/login">Log in</RouterLink></p>
    </template>

    <template v-else>
      <form ref="step" class="form" @submit.prevent="handleReset">
        <!-- Tells password managers which login the new password belongs to. -->
        <input type="email" autocomplete="username" :value="sentTo" readonly hidden />
        <StatusMessage tone="info">{{ sentMessage }}</StatusMessage>
        <div class="sent-to">
          <p class="sent-to__fact">
            <span class="sent-to__label">E-mail</span>
            <span class="sent-to__address">{{ sentTo }}</span>
          </p>
          <BaseButton class="sent-to__change" variant="ghost" size="sm" @click="changeAddress">
            Change
          </BaseButton>
        </div>
        <BaseInput
          v-model="code"
          label="Code"
          autocomplete="one-time-code"
          inputmode="numeric"
          mono
          required
        />
        <BaseInput
          v-model="newPassword"
          label="New password"
          type="password"
          autocomplete="new-password"
          hint="8 to 128 characters."
          required
        />
        <StatusMessage v-if="failure" tone="error">{{ failure }}</StatusMessage>
        <BaseButton type="submit" block :loading="isResetting" :error="isButtonError">
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
          :disabled="resend.active.value"
          @click="sendCode"
        >
          {{
            isSending
              ? "Sending"
              : resend.active.value
                ? `Send again in ${formatSeconds(resend.remaining.value)}`
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
