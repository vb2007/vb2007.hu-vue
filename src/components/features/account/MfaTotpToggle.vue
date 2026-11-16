<script setup lang="ts">
/**
 * The Authenticator app row's keys (vb2007/vb2007.hu-api#447): Set up, or with it on Move to a new
 * app and Turn off, each confirmed with `ReauthForm` in place. Setting up then shows `TotpSetup`
 * until its first code turns it on. The account is looked up again afterwards, so `mfa` is current.
 */
import { nextTick, ref, useTemplateRef } from "vue";
import { Endpoints } from "@/constants/endpoints";
import { REAUTH_QUIET_STATUSES } from "@/constants/http";
import { Messages } from "@/constants/messages";
import { apiRequest } from "@/scripts/api/client";
import { mfa } from "@/scripts/authentication/authState";
import { fetchUserDetails } from "@/scripts/authentication/user";
import ReauthForm from "@/components/features/account/ReauthForm.vue";
import TotpSetup from "@/components/features/account/TotpSetup.vue";
import BaseButton from "@/components/ui/BaseButton.vue";
import type { MfaPasswordBody, MfaTurnOnResponse, TotpSetupResponse } from "@/types/api/mfa";

const emit = defineEmits<{
  /** A form opened: older notices go. */
  start: [];
  /** The section's message, and the recovery codes the first method brings, shown once. */
  done: [message: string, recoveryCodes?: string[]];
}>();

/** Which confirmation is open, fixed when it opened: a new setup (moving, with TOTP on) or off. */
const confirming = ref<"" | "setup" | "off">("");
const moving = ref(false);
/** Whether the setup panel is open, and its setup with the secret, until it runs out. */
const settingUp = ref(false);
const setup = ref<TotpSetupResponse | null>(null);
const setupKey = useTemplateRef<InstanceType<typeof BaseButton>>("setupKey");
const offKey = useTemplateRef<InstanceType<typeof BaseButton>>("offKey");

const startSetup = (body: MfaPasswordBody) =>
  apiRequest(Endpoints.User.mfaTotpSetup, {
    body,
    failure: Messages.Mfa.totpSetupFailed,
    quietStatuses: REAUTH_QUIET_STATUSES
  });
const turnOff = (body: MfaPasswordBody) =>
  apiRequest(Endpoints.User.mfaTotpOff, {
    body,
    failure: Messages.Mfa.totpOffFailed,
    quietStatuses: REAUTH_QUIET_STATUSES
  });

const open = (kind: "setup" | "off") => {
  moving.value = kind === "setup" && mfa.value.totp;
  confirming.value = kind;
  emit("start");
};

/** Drops the setup and its secret, and whatever was open. */
const reset = () => {
  confirming.value = "";
  settingUp.value = false;
  setup.value = null;
};

/** Back to the keys, on the one that opened what closed. */
const close = async () => {
  const kind = confirming.value || "setup";
  reset();
  await nextTick();
  (kind === "off" ? offKey : setupKey).value?.$el.focus();
};

const onSetup = (data: TotpSetupResponse) => {
  confirming.value = "";
  setup.value = data;
  settingUp.value = true;
};

/** Starting again takes the password again, as the API's setup does. */
const restart = () => {
  reset();
  confirming.value = "setup";
};

/**
 * The outcome, with any recovery codes, goes out first: they exist only in this answer, so a slow
 * or failed refresh (the session ended meanwhile, say) mustn't hold them back.
 */
const finish = (message: string, recoveryCodes?: string[]) => {
  reset();
  emit("done", message, recoveryCodes);
  void fetchUserDetails();
};
const onTurnedOn = (data: MfaTurnOnResponse) =>
  finish(moving.value ? Messages.Mfa.totpMoved : Messages.Mfa.totpOn, data.recoveryCodes);
/** The setup looked the account up already, which shows TOTP on. */
const onTurnedOnElsewhere = () => {
  reset();
  emit("done", Messages.Mfa.totpOnElsewhere);
};
</script>

<template>
  <ReauthForm
    v-if="confirming === 'off'"
    :send="turnOff"
    submit-label="Turn off"
    busy-label="Turning off"
    hint="Confirms it's you. Without another second step, your recovery codes go too."
    danger
    @done="finish(Messages.Mfa.totpOff)"
    @cancel="close"
  />
  <ReauthForm
    v-else-if="confirming"
    :send="startSetup"
    submit-label="Continue"
    busy-label="Checking"
    :hint="
      moving
        ? 'Confirms it\'s you. Your current app keeps working until the new one is set up.'
        : 'Confirms it\'s you. Then you scan a QR code with your authenticator app.'
    "
    @done="onSetup"
    @cancel="close"
  />
  <TotpSetup
    v-else-if="settingUp"
    :setup="setup"
    :moving="moving"
    @done="onTurnedOn"
    @cancel="close"
    @restart="restart"
    @expire="setup = null"
    @turned-on-elsewhere="onTurnedOnElsewhere"
  />
  <div v-else class="keys">
    <BaseButton
      ref="setupKey"
      size="sm"
      :variant="mfa.totp ? 'secondary' : 'primary'"
      @click="open('setup')"
    >
      <template v-if="mfa.totp">Move to a new app</template>
      <template v-else>Set up<span class="visually-hidden"> authenticator app</span></template>
    </BaseButton>
    <BaseButton v-if="mfa.totp" ref="offKey" size="sm" variant="secondary" @click="open('off')">
      Turn off<span class="visually-hidden"> authenticator app</span>
    </BaseButton>
  </div>
</template>

<style scoped>
.keys {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-2);
  margin-top: var(--sp-2);
}
</style>
