<script setup lang="ts">
/**
 * The Recovery codes row's key (vb2007/vb2007.hu-api#482): "Generate new codes", confirmed with
 * `ReauthForm` in place. The new set replaces the old one, so the account is looked up again for
 * the count, and the codes go up to the panel, shown once.
 */
import { nextTick, ref, useTemplateRef } from "vue";
import { Endpoints } from "@/constants/endpoints";
import { Messages } from "@/constants/messages";
import { apiRequest } from "@/scripts/api/client";
import { fetchUserDetails } from "@/scripts/authentication/user";
import ReauthForm from "@/components/features/account/ReauthForm.vue";
import BaseButton from "@/components/ui/BaseButton.vue";
import type { MfaPasswordBody, MfaRecoveryCodesResponse } from "@/types/api/mfa";

const emit = defineEmits<{
  /** The form opened: older notices go. */
  start: [];
  /** The API's message and the new codes. */
  done: [message: string, recoveryCodes: string[]];
}>();

const confirming = ref(false);
const opener = useTemplateRef<InstanceType<typeof BaseButton>>("opener");

const generate = (body: MfaPasswordBody) =>
  apiRequest(Endpoints.User.mfaRecoveryCodes, { body, failure: Messages.Mfa.recoveryCodesFailed });

const open = () => {
  confirming.value = true;
  emit("start");
};

const close = async () => {
  confirming.value = false;
  await nextTick();
  opener.value?.$el.focus();
};

/**
 * The codes go up first: they exist only in this answer and the old ones are already dead, so a
 * slow or failed refresh (the session ended meanwhile, say) mustn't hold them back. The refresh
 * then brings the count up to date.
 */
const onDone = (data: MfaRecoveryCodesResponse) => {
  confirming.value = false;
  emit("done", data.message, data.recoveryCodes);
  void fetchUserDetails();
};
</script>

<template>
  <ReauthForm
    v-if="confirming"
    :send="generate"
    submit-label="Generate"
    busy-label="Generating"
    hint="Confirms it's you. Your current codes stop working, and the new ones show only once."
    @done="onDone"
    @cancel="close"
  />
  <BaseButton v-else ref="opener" class="generate" size="sm" variant="secondary" @click="open">
    Generate new codes
  </BaseButton>
</template>

<style scoped>
.generate {
  margin-top: var(--sp-2);
}
</style>
