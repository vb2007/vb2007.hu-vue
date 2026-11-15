<script setup lang="ts">
/**
 * The second step by e-mail: nothing is mailed until the user asks, since each mail counts against
 * the account's day. Then the code field, a notice that the mailed link only works in this
 * browser, and a key for a new code once the minute is over.
 */
import { computed, nextTick, useId, useTemplateRef } from "vue";
import { Limits } from "@/constants/limits";
import { Messages } from "@/constants/messages";
import {
  confirmationCodeEarlyError,
  confirmationCodeError
} from "@/scripts/authentication/register";
import { spokenWait } from "@/scripts/utility/durationUtil";
import { useMfaEmail } from "@/composables/useMfaEmail";
import type { MfaVerifier } from "@/composables/useMfaVerify";
import MfaCodeForm from "@/components/features/auth/MfaCodeForm.vue";
import BaseButton from "@/components/ui/BaseButton.vue";
import StatusMessage from "@/components/ui/StatusMessage.vue";
import { statusTextId } from "@/components/ui/statusMessage";

defineProps<{ verifier: MfaVerifier }>();

const { isSending, sent, error, wait, send } = useMfaEmail();
const sentId = useId();
const errorId = useId();
const codeForm = useTemplateRef("codeForm");
const errorMessage = useTemplateRef<InstanceType<typeof StatusMessage>>("errorMessage");
const hint = `${Messages.EmailCode.invalid(Limits.Code.digits)} ${Messages.Mfa.stepLimits(Limits.Mfa.challengeMinutes, Limits.Mfa.challengeAttempts)}`;
const sendLabel = computed(() => {
  if (isSending.value) return "Sending";
  if (wait.active.value) return Messages.EmailCode.sendAgainIn(wait.remaining.value);
  return sent.value ? "Send a new code" : "E-mail me a code";
});
const sendName = computed(() =>
  wait.active.value && !isSending.value
    ? spokenWait(sendLabel.value, Messages.EmailCode.sendAgainIn(wait.remaining.value, "long"))
    : undefined
);

const onSend = async () => {
  const mailed = await send();
  await nextTick();
  // The send key waits now, disabled. A new mail voids the code typed before, so the field starts
  // empty; after a refusal the field, or without one the message, takes the cursor.
  if (mailed) codeForm.value?.restart();
  else if (codeForm.value) codeForm.value.focusField();
  else errorMessage.value?.$el.focus();
};
</script>

<template>
  <div class="email">
    <StatusMessage v-if="sent" :id="sentId" tone="info">{{ Messages.Mfa.emailSent }}</StatusMessage>
    <p v-else class="email__note">
      Get a code and a link at your account's e-mail address. The link only works in this browser.
    </p>
    <StatusMessage
      v-if="error"
      :id="errorId"
      ref="errorMessage"
      class="email__error"
      tone="error"
      tabindex="-1"
      >{{ error }}</StatusMessage
    >
    <MfaCodeForm
      v-if="sent"
      ref="codeForm"
      :verifier="verifier"
      method="email"
      label="Code from the e-mail"
      :hint="hint"
      :check="confirmationCodeError"
      :early="confirmationCodeEarlyError"
      :describedby="sentId"
      :busy="isSending"
    />
    <div class="email__send" :class="{ 'email__send--again': sent }">
      <span v-if="sent" class="email__ask">No code yet?</span>
      <BaseButton
        :variant="sent ? 'secondary' : 'primary'"
        :size="sent ? 'sm' : 'md'"
        :block="!sent"
        :loading="isSending"
        :disabled="wait.active.value || verifier.isVerifying.value"
        :aria-label="sendName"
        :aria-describedby="wait.active.value && error ? statusTextId(errorId) : undefined"
        @click="onSend"
      >
        {{ sendLabel }}
      </BaseButton>
    </div>
  </div>
</template>

<style scoped>
.email {
  display: grid;
  gap: var(--sp-4);
}

.email__error {
  scroll-margin-top: calc(var(--nav-h) + var(--sp-4));
}

.email__note {
  color: var(--c-ink-soft);
}

.email__send--again {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--sp-2) var(--sp-3);
}

.email__ask {
  font-size: var(--fs-sm);
  color: var(--c-ink-soft);
}
</style>
