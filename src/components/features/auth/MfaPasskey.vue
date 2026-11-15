<script setup lang="ts">
/**
 * The second step with a passkey (vb2007/vb2007.hu-api#484): the API's options for this login, the
 * browser's prompt, then the step's `verifier`. A cancelled prompt says nothing; the key takes the
 * focus back, or while it's held, the message.
 */
import { computed, nextTick, ref, useId, useTemplateRef } from "vue";
import { HttpStatus } from "@/constants/http";
import { loadMfaPasskeyOptions } from "@/scripts/authentication/mfa";
import { getPasskey } from "@/scripts/authentication/webauthn";
import type { MfaVerifier } from "@/composables/useMfaVerify";
import AppIcon from "@/components/ui/AppIcon.vue";
import BaseButton from "@/components/ui/BaseButton.vue";
import StatusMessage from "@/components/ui/StatusMessage.vue";
import { statusTextId } from "@/components/ui/statusMessage";

const props = defineProps<{ verifier: MfaVerifier }>();

const { isVerifying, refusal, hold } = props.verifier;
const isAsking = ref(false);
/** The options' or the browser's failure; the verifier keeps the API's answers. */
const error = ref("");
const isHeld = computed(() => hold.isHeld());
const shownError = computed(() => error.value || refusal.value || hold.shown());
const errorId = useId();
const key = useTemplateRef<InstanceType<typeof BaseButton>>("key");
const errorMessage = useTemplateRef<InstanceType<typeof StatusMessage>>("errorMessage");

const use = async () => {
  if (isAsking.value || isVerifying.value || isHeld.value) return;
  isAsking.value = true;
  error.value = refusal.value = "";
  const options = await loadMfaPasskeyOptions();
  // A 403 ended the step: the password form is back.
  if (!options.ok && options.status !== HttpStatus.Forbidden) error.value = options.error;
  const passkey = options.ok ? await getPasskey(options.data) : undefined;
  isAsking.value = false;
  if (passkey && !passkey.ok) error.value = passkey.error;
  if (
    passkey?.ok &&
    (await props.verifier.verify({ method: "passkey", response: passkey.response }))
  )
    return;
  await nextTick();
  if (isHeld.value) errorMessage.value?.$el.focus();
  else key.value?.$el.focus();
};
</script>

<template>
  <div class="passkey">
    <p class="passkey__note">Use the passkey on this device, your phone or a security key.</p>
    <StatusMessage
      v-if="shownError"
      :id="errorId"
      ref="errorMessage"
      class="passkey__error"
      tone="error"
      tabindex="-1"
      :spoken="hold.spokenFor()"
      >{{ shownError }}</StatusMessage
    >
    <BaseButton
      ref="key"
      block
      :loading="isAsking || isVerifying"
      :disabled="isHeld"
      :aria-label="isHeld ? hold.name.value : undefined"
      :aria-describedby="isHeld ? statusTextId(errorId) : undefined"
      @click="use"
    >
      <AppIcon name="passkey" :size="20" />
      {{ isAsking || isVerifying ? "Logging in" : isHeld ? hold.label.value : "Use a passkey" }}
    </BaseButton>
  </div>
</template>

<style scoped>
.passkey {
  display: grid;
  gap: var(--sp-4);
}

.passkey__note {
  color: var(--c-ink-soft);
}

.passkey__error {
  scroll-margin-top: calc(var(--nav-h) + var(--sp-4));
}
</style>
