<script setup lang="ts">
/**
 * The Authenticator app row's keys (vb2007/vb2007.hu-api#447): Set up, or with it on Move to a new
 * app and Turn off, each confirmed with `ReauthForm` in place. Setting up then shows `TotpSetup`
 * until its first code turns it on. The account is looked up again afterwards, so `mfa` is current.
 */
import { nextTick, ref, useTemplateRef } from "vue";
import { Endpoints } from "@/constants/endpoints";
import { Messages } from "@/constants/messages";
import { apiRequest } from "@/scripts/api/client";
import { mfa } from "@/scripts/authentication/authState";
import { fetchUserDetails } from "@/scripts/authentication/user";
import ReauthForm from "@/components/features/account/ReauthForm.vue";
import TotpSetup from "@/components/features/account/TotpSetup.vue";
import BaseButton from "@/components/ui/BaseButton.vue";
import type { MfaPasswordBody, MfaTurnOnResponse, TotpSetupResponse } from "@/types/api/mfa";
import type { MessageResponse } from "@/types/api/common";

const emit = defineEmits<{
  /** A form opened: older notices go. */
  start: [];
  /** The API's message, and the recovery codes the first method brings, shown once. */
  done: [message: string, recoveryCodes?: string[]];
}>();

/** Which confirmation is open, fixed when it opened: a new setup (moving, with TOTP on) or off. */
const confirming = ref<"" | "setup" | "off">("");
const moving = ref(false);
/** The waiting setup with its secret, only while it's on screen. */
const setup = ref<TotpSetupResponse | null>(null);
const setupKey = useTemplateRef<InstanceType<typeof BaseButton>>("setupKey");
const offKey = useTemplateRef<InstanceType<typeof BaseButton>>("offKey");

const startSetup = (body: MfaPasswordBody) =>
  apiRequest(Endpoints.User.mfaTotpSetup, { body, failure: Messages.Mfa.totpSetupFailed });
const turnOff = (body: MfaPasswordBody) =>
  apiRequest(Endpoints.User.mfaTotpOff, { body, failure: Messages.Mfa.totpOffFailed });

const open = (kind: "setup" | "off") => {
  moving.value = kind === "setup" && mfa.value.totp;
  confirming.value = kind;
  emit("start");
};

/** Back to the keys, on the one that opened what closed. */
const close = async () => {
  const kind = confirming.value || "setup";
  confirming.value = "";
  setup.value = null;
  await nextTick();
  (kind === "off" ? offKey : setupKey).value?.$el.focus();
};

const onSetup = (data: TotpSetupResponse) => {
  confirming.value = "";
  setup.value = data;
};

/** Starting again takes the password again, as the API's setup does. */
const restart = () => {
  setup.value = null;
  confirming.value = "setup";
};

const finish = async (data: MessageResponse | MfaTurnOnResponse) => {
  confirming.value = "";
  setup.value = null;
  await fetchUserDetails();
  emit("done", data.message, "recoveryCodes" in data ? data.recoveryCodes : undefined);
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
    @done="finish"
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
    v-else-if="setup"
    :setup="setup"
    :moving="moving"
    @done="finish"
    @cancel="close"
    @restart="restart"
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
