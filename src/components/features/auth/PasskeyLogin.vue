<script setup lang="ts">
/**
 * "Log in with a passkey", under GitHub on the Log in board (vb2007/vb2007.hu-api#446): no address
 * or password, and no second step. Its refusals are its own, not the typed address's, so it shows
 * them, and holds its key after the API's 429, by itself. Browsers that can't run the prompt don't
 * get the key.
 */
import { computed, nextTick, ref, useId, useTemplateRef } from "vue";
import { useRetryHold } from "@/composables/useRetryHold";
import { passkeyLogin } from "@/scripts/authentication/passkeys";
import { passkeysSupported } from "@/scripts/authentication/webauthn";
import AppIcon from "@/components/ui/AppIcon.vue";
import BaseButton from "@/components/ui/BaseButton.vue";
import StatusMessage from "@/components/ui/StatusMessage.vue";
import { statusTextId } from "@/components/ui/statusMessage";

const supported = passkeysSupported();
const isBusy = ref(false);
const error = ref("");
const hold = useRetryHold(error);
const isHeld = computed(() => hold.isHeld());
const shownError = computed(() => hold.shown());
const errorId = useId();
const key = useTemplateRef<InstanceType<typeof BaseButton>>("key");
const errorMessage = useTemplateRef<InstanceType<typeof StatusMessage>>("errorMessage");

const logIn = async () => {
  if (isBusy.value) return;
  isBusy.value = true;
  error.value = "";
  const failure = await passkeyLogin();
  isBusy.value = false;
  // Logged in, the board shows it; a newer login, or leaving, says nothing here.
  if (!failure) return;
  error.value = failure.error;
  if (failure.wait) hold.start(failure.wait);
  await nextTick();
  if (isHeld.value) errorMessage.value?.$el.focus();
  else key.value?.$el.focus();
};
</script>

<template>
  <div v-if="supported" class="passkey">
    <StatusMessage
      v-if="shownError"
      :id="errorId"
      ref="errorMessage"
      tone="error"
      tabindex="-1"
      :spoken="hold.spokenFor()"
      >{{ shownError }}</StatusMessage
    >
    <BaseButton
      ref="key"
      variant="secondary"
      block
      :loading="isBusy"
      :disabled="isHeld"
      :aria-label="isHeld ? hold.name.value : undefined"
      :aria-describedby="isHeld ? statusTextId(errorId) : undefined"
      @click="logIn"
    >
      <AppIcon name="passkey" :size="20" />
      {{ isBusy ? "Logging in" : isHeld ? hold.label.value : "Log in with a passkey" }}
    </BaseButton>
  </div>
</template>

<style scoped>
.passkey {
  display: grid;
  gap: var(--sp-4);
}
</style>
