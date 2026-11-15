<script setup lang="ts">
/**
 * "Add a passkey" (vb2007/vb2007.hu-api#446) in two steps in place: the name, then `ReauthForm`,
 * whose one key asks the API for the options, runs the browser's prompt and sends the new passkey.
 * Cancel on the confirmation goes back to the name. Browsers that can't run the prompt, and an
 * account at the cap, get a line instead of the key.
 */
import { nextTick, ref, useTemplateRef } from "vue";
import { Endpoints } from "@/constants/endpoints";
import { HttpStatus, REAUTH_QUIET_STATUSES } from "@/constants/http";
import { Limits } from "@/constants/limits";
import { Messages } from "@/constants/messages";
import { useFormValidation } from "@/composables/useFormValidation";
import { apiRequest, type ApiAbortedFailure, type ApiResult } from "@/scripts/api/client";
import { mfa } from "@/scripts/authentication/authState";
import {
  forPrompt,
  optionsUsableUntil,
  passkeyNameEarlyError,
  passkeyNameError
} from "@/scripts/authentication/passkeys";
import { createPasskey, passkeysSupported } from "@/scripts/authentication/webauthn";
import ReauthForm from "@/components/features/account/ReauthForm.vue";
import AppIcon from "@/components/ui/AppIcon.vue";
import BaseButton from "@/components/ui/BaseButton.vue";
import BaseInput from "@/components/ui/BaseInput.vue";
import StatusMessage from "@/components/ui/StatusMessage.vue";
import type { MfaPasswordBody } from "@/types/api/mfa";
import type { PasskeyAddedResponse } from "@/types/api/passkeys";

const emit = defineEmits<{
  /** The form opened: older notices go. */
  start: [];
  done: [message: string];
}>();

const supported = passkeysSupported();
const step = ref<"" | "name" | "confirm">("");
const name = ref("");
/** "If no prompt appeared, try again.": beside the confirmation, as information, not its error. */
const hint = ref("");
const opener = useTemplateRef<InstanceType<typeof BaseButton>>("opener");
const nameForm = useTemplateRef("nameForm");
const { errors, isValid, leave, validate, reset } = useFormValidation({
  name: {
    value: name,
    check: () => passkeyNameError(name.value),
    early: () => passkeyNameEarlyError(name.value)
  }
});

const focusName = async () => {
  await nextTick();
  nameForm.value?.querySelector("input")?.focus();
};

const open = () => {
  name.value = "";
  reset();
  step.value = "name";
  emit("start");
  return focusName();
};

const close = async () => {
  unused = undefined;
  hint.value = "";
  step.value = "";
  await nextTick();
  opener.value?.$el.focus();
};

const toConfirm = async () => {
  if (await validate(nameForm.value)) step.value = "confirm";
};

const back = () => {
  hint.value = "";
  step.value = "name";
  return focusName();
};

/**
 * Options a failed prompt left unused (Safari may refuse one that waited for the request): their
 * challenge waits in the registration cookie until their `timeout`, so until shortly before that
 * (`optionsUsableUntil`) the next click runs the prompt at once, without asking the API again.
 */
let unused:
  { options: PublicKeyCredentialCreationOptionsJSON; sentAt: number; until: number } | undefined;

/**
 * A prompt that made no passkey, shaped as `ApiResult`'s aborted failure (nothing logged) so
 * `ReauthForm` shows its message like the API's refusals; an empty one (a cancel) shows nothing.
 */
const promptFailed = (error: string): ApiAbortedFailure => ({
  ok: false,
  kind: "aborted",
  status: 0,
  error
});

const add = async (body: MfaPasswordBody): Promise<ApiResult<PasskeyAddedResponse>> => {
  hint.value = "";
  const kept = unused && unused.until > Date.now() ? unused : undefined;
  unused = undefined;
  let ready = kept;
  if (!ready) {
    const sentAt = Date.now();
    const result = await apiRequest(Endpoints.User.passkeyOptions, {
      body,
      failure: Messages.Passkeys.optionsFailed,
      // A wrong or missing password, GitHub to confirm, the cap: the form's answers, not faults.
      quietStatuses: REAUTH_QUIET_STATUSES
    });
    if (!result.ok) return result;
    ready = { options: result.data, sentAt, until: optionsUsableUntil(sentAt, result.data) };
  }
  // Kept options get only the time their challenge has left.
  const passkey = await createPasskey(kept ? forPrompt(kept.sentAt, kept.options) : ready.options);
  if (!passkey.ok) {
    unused = ready;
    // A prompt that may not have shown is no failure: a hint beside the form, not its error.
    if (!passkey.error && !kept) hint.value = Messages.Passkeys.noPrompt;
    return promptFailed(passkey.error);
  }
  return apiRequest(Endpoints.User.addPasskey, {
    body: { name: name.value.trim(), response: passkey.response },
    failure: Messages.Passkeys.addFailed,
    quietStatuses: [HttpStatus.BadRequest, HttpStatus.Conflict]
  });
};

const onAdded = (data: PasskeyAddedResponse) => {
  unused = undefined;
  step.value = "";
  emit("done", data.message);
};
</script>

<template>
  <p v-if="!supported" class="add__note">{{ Messages.Passkeys.unsupported }}</p>
  <p v-else-if="!step && mfa.passkeys >= Limits.Passkey.perAccount" class="add__note">
    {{ Messages.Passkeys.atCap(Limits.Passkey.perAccount) }}
  </p>
  <form
    v-else-if="step === 'name'"
    ref="nameForm"
    class="add"
    novalidate
    @submit.prevent="toConfirm"
    @keydown.esc="close"
  >
    <BaseInput
      v-model="name"
      label="Name"
      :hint="`Which device or password manager it's on, like “Phone”. Up to ${Limits.Passkey.nameMaxLength} characters.`"
      :error="errors.name"
      required
      @blur="leave('name')"
    />
    <div class="add__keys">
      <BaseButton type="submit" size="sm" :blocked="!isValid">Continue</BaseButton>
      <BaseButton size="sm" variant="ghost" @click="close">Cancel</BaseButton>
    </div>
  </form>
  <template v-else-if="step === 'confirm'">
    <StatusMessage v-if="hint" tone="info">{{ hint }}</StatusMessage>
    <ReauthForm
      :send="add"
      submit-label="Add passkey"
      busy-label="Adding"
      :hint="`Confirms it's you. Your browser then asks you to make the passkey “${name.trim()}”.`"
      @done="onAdded"
      @cancel="back"
    />
  </template>
  <BaseButton v-else ref="opener" class="add__open" size="sm" @click="open">
    <AppIcon name="passkey" :size="16" /> Add a passkey
  </BaseButton>
</template>

<style scoped>
.add {
  display: grid;
  gap: var(--sp-4);
}

.add__keys {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-2);
}

.add__open {
  justify-self: start;
}

.add__note {
  font-size: var(--fs-sm);
  color: var(--c-ink-soft);
}
</style>
