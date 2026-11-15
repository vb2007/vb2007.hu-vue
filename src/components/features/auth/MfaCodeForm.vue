<script setup lang="ts">
/**
 * A typed code for the login's second step: the mailed code now, and the authenticator app's or a
 * recovery code next (they bring their own `method`, `check` and `early`). The step's `verifier`
 * sends it and holds the key; a wrong code is the field's own error and keeps the focus there.
 */
import { computed, ref, useId, useTemplateRef, watch } from "vue";
import { useFormValidation } from "@/composables/useFormValidation";
import type { MfaVerifier } from "@/composables/useMfaVerify";
import BaseButton from "@/components/ui/BaseButton.vue";
import BaseInput from "@/components/ui/BaseInput.vue";
import StatusMessage from "@/components/ui/StatusMessage.vue";
import { statusTextId } from "@/components/ui/statusMessage";
import type { MfaVerifyBody } from "@/types/api/mfa";

const props = defineProps<{
  verifier: MfaVerifier;
  /** The methods answered with a typed `code` (not the passkey's `response`). */
  method: Extract<MfaVerifyBody, { code: string }>["method"];
  label: string;
  hint: string;
  /** The problem with a finished code, "" when there's none. */
  check: (code: string) => string;
  /** One that shows while typing, since more typing can't fix it. */
  early?: (code: string) => string;
  /** Ids of messages above that also describe the field, e.g. where the code went. */
  describedby?: string;
  /** Holds Log in, e.g. while a new code is being mailed, which would void the one typed. */
  busy?: boolean;
  /** Shown in place of the API's wrong-answer text, where that doesn't fit the method. */
  refused?: string;
}>();

const code = ref("");
const form = useTemplateRef("form");
const errorId = useId();
const { isVerifying, refusal, hold } = props.verifier;
const shownRefusal = computed(() => refusal.value && (props.refused || refusal.value));
const isHeld = computed(() => hold.isHeld());
const shownError = computed(() => hold.shown());
const { errors, isValid, leave, validate, reset } = useFormValidation({
  code: {
    value: code,
    check: () => props.check(code.value),
    early: props.early && (() => props.early!(code.value))
  }
});
// A new code is a new try: the old one's refusal is about what was typed before.
watch(code, () => (refusal.value = ""));

const focusField = () => form.value?.querySelector("input")?.focus();

/** A new code is on its way, which voids the one typed: an empty field, waiting for it. */
const restart = () => {
  code.value = "";
  reset();
  focusField();
};

const submit = async () => {
  if (isHeld.value || props.busy || !(await validate(form.value))) return;
  const passed = await props.verifier.verify({
    method: props.method,
    code: code.value.replace(/\s/g, "")
  });
  // Passed, the board shows the login; refused, the field takes the cursor back.
  if (!passed) focusField();
};

defineExpose({ focusField, restart });
</script>

<template>
  <form ref="form" class="code" novalidate @submit.prevent="submit">
    <BaseInput
      v-model="code"
      :label="label"
      :hint="hint"
      inputmode="numeric"
      autocomplete="one-time-code"
      mono
      :describedby="describedby"
      :error="shownRefusal || errors.code"
      required
      @blur="leave('code')"
    />
    <!-- The field keeps the cursor after a wrong code, so its error isn't read out by itself. -->
    <p class="visually-hidden" aria-live="assertive">{{ shownRefusal }}</p>
    <StatusMessage v-if="shownError" :id="errorId" tone="error" :spoken="hold.spokenFor()">{{
      shownError
    }}</StatusMessage>
    <BaseButton
      type="submit"
      block
      :loading="isVerifying"
      :disabled="isHeld || busy"
      :aria-label="isHeld ? hold.name.value : undefined"
      :aria-describedby="isHeld ? statusTextId(errorId) : undefined"
      :blocked="!isValid"
    >
      {{ isVerifying ? "Logging in" : isHeld ? hold.label.value : "Log in" }}
    </BaseButton>
  </form>
</template>

<style scoped>
.code {
  display: grid;
  gap: var(--sp-4);
}
</style>
