<script setup lang="ts">
/**
 * The E-mail codes row's key (vb2007/vb2007.hu-api#448): Turn on or Turn off, each confirmed with
 * `ReauthForm` in place. The account is looked up again afterwards, so `mfa` is current.
 */
import { computed, nextTick, ref, useTemplateRef } from "vue";
import { Endpoints } from "@/constants/endpoints";
import { REAUTH_QUIET_STATUSES } from "@/constants/http";
import { Messages } from "@/constants/messages";
import { apiRequest } from "@/scripts/api/client";
import { mfa } from "@/scripts/authentication/authState";
import { fetchUserDetails } from "@/scripts/authentication/user";
import ReauthForm from "@/components/features/account/ReauthForm.vue";
import BaseButton from "@/components/ui/BaseButton.vue";
import type { MfaPasswordBody, MfaTurnOnResponse } from "@/types/api/mfa";

const emit = defineEmits<{
  /** The form opened: older notices go. */
  start: [];
  /** The API's message, and the recovery codes the first method brings, shown once. */
  done: [message: string, recoveryCodes?: string[]];
}>();

const confirming = ref(false);
/** Which way the open form goes, fixed when it opened. */
const turningOn = ref(false);
const opener = useTemplateRef<InstanceType<typeof BaseButton>>("opener");
/** With an authenticator app or a passkey, the login opens on that: e-mail is one more way. */
const opensElsewhere = computed(() => mfa.value.totp || mfa.value.passkeys > 0);

const turnOn = (body: MfaPasswordBody) =>
  apiRequest(Endpoints.User.mfaEmailOn, {
    body,
    failure: Messages.Mfa.emailOnFailed,
    quietStatuses: REAUTH_QUIET_STATUSES
  });
const turnOff = (body: MfaPasswordBody) =>
  apiRequest(Endpoints.User.mfaEmailOff, {
    body,
    failure: Messages.Mfa.emailOffFailed,
    quietStatuses: REAUTH_QUIET_STATUSES
  });

const open = () => {
  turningOn.value = !mfa.value.email;
  confirming.value = true;
  emit("start");
};

const close = async () => {
  confirming.value = false;
  await nextTick();
  opener.value?.$el.focus();
};

/**
 * The outcome, with any recovery codes, goes out first: they exist only in this answer, so a slow
 * or failed refresh (the session ended meanwhile, say) mustn't hold them back. The refresh then
 * brings the badge and `mfa` up to date.
 */
const onDone = (data: MfaTurnOnResponse) => {
  confirming.value = false;
  // The section's own words, rather than the API's "E-mail MFA turned on".
  const on = opensElsewhere.value ? Messages.Mfa.emailOnBesideOthers : Messages.Mfa.emailOn;
  emit("done", turningOn.value ? on : Messages.Mfa.emailOff, data.recoveryCodes);
  void fetchUserDetails();
};
</script>

<template>
  <ReauthForm
    v-if="confirming"
    :send="turningOn ? turnOn : turnOff"
    :submit-label="turningOn ? 'Turn on' : 'Turn off'"
    :busy-label="turningOn ? 'Turning on' : 'Turning off'"
    :hint="
      turningOn
        ? opensElsewhere
          ? 'Confirms it\'s you. Each login can then also take a code or link from your inbox.'
          : 'Confirms it\'s you. Each login then also takes a code or link from your inbox.'
        : 'Confirms it\'s you. Without another second step, your recovery codes go too.'
    "
    :danger="!turningOn"
    @done="onDone"
    @cancel="close"
  />
  <BaseButton
    v-else
    ref="opener"
    class="toggle"
    size="sm"
    :variant="mfa.email ? 'secondary' : 'primary'"
    @click="open"
  >
    {{ mfa.email ? "Turn off" : "Turn on" }}<span class="visually-hidden"> e-mail codes</span>
  </BaseButton>
</template>

<style scoped>
.toggle {
  margin-top: var(--sp-2);
}
</style>
