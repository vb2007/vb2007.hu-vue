<script setup lang="ts">
/**
 * The second step with a passkey (vb2007/vb2007.hu-api#484): the API's options for this login, the
 * browser's prompt, then the step's `verifier`. The options are asked for as the panel opens (or
 * comes back), and again after each try, so the click runs the prompt at once (Safari may refuse
 * one that waits for a request); a newer set only replaces the challenge. A cancelled prompt says
 * nothing, unless it followed a wait for the options; the key takes the focus back, or while it's
 * held, the message.
 */
import { computed, nextTick, onActivated, onBeforeUnmount, ref, useId, useTemplateRef } from "vue";
import { HttpStatus } from "@/constants/http";
import { Messages } from "@/constants/messages";
import { retryAfterFrom } from "@/composables/useCountdown";
import { useRetryHold } from "@/composables/useRetryHold";
import { loadMfaPasskeyOptions } from "@/scripts/authentication/mfa";
import { optionsAhead } from "@/scripts/authentication/passkeys";
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
/** The options' own limit (30 a minute per IP), apart from the step's daily one. */
const optionsHold = useRetryHold(error);
const heldBy = computed(() =>
  optionsHold.isHeld() ? optionsHold : hold.isHeld() ? hold : undefined
);
const shownError = computed(() => optionsHold.shown() || refusal.value || hold.shown());
const errorId = useId();
const key = useTemplateRef<InstanceType<typeof BaseButton>>("key");
const errorMessage = useTemplateRef<InstanceType<typeof StatusMessage>>("errorMessage");

const options = optionsAhead(loadMfaPasskeyOptions);
// On every opening (`MfaStep` keeps the panel alive while another method is open), but not while
// a try runs: new options would replace the challenge of the prompt on show.
onActivated(() => {
  if (!isAsking.value && !isVerifying.value) options.prefetch();
});
let open = true;
onBeforeUnmount(() => (open = false));

const use = async () => {
  if (isAsking.value) return;
  isAsking.value = true;
  error.value = refusal.value = "";
  const { result, fetched } = await options.take();
  // A 403 ended the step: the password form is back.
  if (!result.ok && result.status !== HttpStatus.Forbidden) {
    error.value = result.error;
    if (result.status === HttpStatus.TooManyRequests)
      optionsHold.start(retryAfterFrom(result.body));
  }
  const passkey = result.ok ? await getPasskey(result.data) : undefined;
  isAsking.value = false;
  if (passkey && !passkey.ok) {
    error.value = passkey.error || (fetched ? Messages.Passkeys.noPrompt : "");
  }
  if (
    passkey?.ok &&
    (await props.verifier.verify({ method: "passkey", response: passkey.response }))
  )
    return;
  await nextTick();
  // The next try's options, while the step is still on and nothing holds the key.
  if (open && !heldBy.value) options.prefetch();
  if (heldBy.value) errorMessage.value?.$el.focus();
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
      :tone="shownError === Messages.Passkeys.noPrompt ? 'info' : 'error'"
      tabindex="-1"
      :spoken="heldBy?.spokenFor(undefined, shownError)"
      >{{ shownError }}</StatusMessage
    >
    <BaseButton
      ref="key"
      block
      :loading="isAsking || isVerifying"
      :disabled="!!heldBy"
      :aria-label="heldBy?.name.value"
      :aria-describedby="heldBy ? statusTextId(errorId) : undefined"
      @click="use"
    >
      <AppIcon name="passkey" :size="20" />
      {{ isAsking || isVerifying ? "Logging in" : heldBy ? heldBy.label.value : "Use a passkey" }}
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
