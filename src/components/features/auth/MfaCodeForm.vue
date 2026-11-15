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
  /** Letters too (a recovery code): a text keyboard, and no one-time-code autofill offering a mailed code. */
  text?: boolean;
  /** The site's words for the API's 400 (a wrong code), when its own don't fit the method. */
  refused?: string;
  /** Holds Log in, e.g. while a new code is being mailed, which would void the one typed. */
  busy?: boolean;
}>();

const code = ref("");
const form = useTemplateRef("form");
const errorId = useId();
const { isVerifying, refusal, hold } = props.verifier;
const isHeld = computed(() => hold.isHeld());
const shownError = computed(() => hold.shown());
const shownRefusal = computed(() => refusal.value && (props.refused || refusal.value));
const { errors, isValid, leave, validate, reset } = useFormValidation({
  code: {
    value: code,
    check: () => props.check(code.value),
    early: props.early && (() => props.early!(code.value))
  }
});
/**
 * A wrong code sent with Enter, from the field: the cursor stays there, so nothing would read its
 * error out. Sent with the key, the cursor moves back to the field, which reads it with the field.
 */
const announced = ref("");
// A new code is a new try: the old one's refusal is about what was typed before.
watch(code, () => (refusal.value = announced.value = ""));

const field = () => form.value?.querySelector("input");
const focusField = () => field()?.focus();

/** A new code is on its way, which voids the one typed: an empty field, waiting for it. */
const restart = () => {
  code.value = "";
  reset();
  focusField();
};

const submit = async () => {
  if (isHeld.value || props.busy || !(await validate(form.value))) return;
  const fromField = document.activeElement === field();
  announced.value = "";
  const passed = await props.verifier.verify({
    method: props.method,
    code: code.value.replace(/\s/g, "")
  });
  if (passed) return;
  // Passed, the board shows the login; refused, the field takes the cursor back.
  focusField();
  if (fromField) announced.value = shownRefusal.value;
};

defineExpose({ focusField, restart });
</script>

<template>
  <!-- A letter code mustn't be "corrected" into another word: that would only waste a try. The
       field inherits these from its form. -->
  <form
    ref="form"
    class="code"
    novalidate
    :autocorrect="text ? 'off' : undefined"
    :spellcheck="text ? false : undefined"
    @submit.prevent="submit"
  >
    <BaseInput
      v-model="code"
      :label="label"
      :hint="hint"
      :inputmode="text ? 'text' : 'numeric'"
      :autocomplete="text ? 'off' : 'one-time-code'"
      :autocapitalize="text ? 'none' : undefined"
      mono
      :describedby="describedby"
      :error="shownRefusal || errors.code"
      required
      @blur="leave('code')"
    />
    <p class="visually-hidden" aria-live="assertive">{{ announced }}</p>
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
