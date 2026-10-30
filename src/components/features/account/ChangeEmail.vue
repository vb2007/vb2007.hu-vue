<script setup lang="ts">
import { nextTick, ref, useId, useTemplateRef } from "vue";
import { useChangeEmail } from "@/composables/useChangeEmail";
import { pendingEmail, userEmail } from "@/scripts/authentication/authState";
import { isValidEmail } from "@/scripts/authentication/register";
import BaseButton from "@/components/ui/BaseButton.vue";
import BaseInput from "@/components/ui/BaseInput.vue";
import StatusMessage from "@/components/ui/StatusMessage.vue";

const {
  isChanging,
  changeError,
  changeMessage,
  change,
  isConfirming,
  codeError,
  confirmError,
  confirm,
  cooldown
} = useChangeEmail();
const { remaining: waitSeconds, active: isWaiting } = cooldown;

const open = ref(false);
const email = ref("");
const password = ref("");
const emailError = ref("");
const passwordError = ref("");
const code = ref("");

/** Ties the code field to the waiting address it confirms. */
const pendingId = useId();

const key = useTemplateRef("key");
const form = useTemplateRef("form");
const codeForm = useTemplateRef("codeForm");
const emailField = useTemplateRef("emailField");
const passwordField = useTemplateRef("passwordField");
const codeField = useTemplateRef("codeField");

const focusField = (field: { $el: HTMLElement } | null) =>
  field?.$el.querySelector("input")!.focus();

/** While a change waits, the form starts from its address, so a new code is one password away. */
const start = async () => {
  open.value = true;
  email.value = pendingEmail.value;
  changeMessage.value = "";
  codeError.value = "";
  confirmError.value = "";
  await nextTick();
  focusField(pendingEmail.value ? passwordField.value : emailField.value);
};

const reset = () => {
  open.value = false;
  email.value = "";
  password.value = "";
  emailError.value = "";
  passwordError.value = "";
  changeError.value = "";
};

const close = async () => {
  reset();
  await nextTick();
  key.value?.$el.focus();
};

const cancel = () => {
  if (!isChanging.value) return close();
};

const addressError = (address: string) => {
  if (!isValidEmail(address)) return "Enter a valid e-mail address.";
  if (address.toLowerCase() === userEmail.value.toLowerCase()) {
    return "That's already your e-mail address.";
  }
  return "";
};

const save = async () => {
  if (isWaiting.value) return;
  const address = email.value.trim();
  emailError.value = addressError(address);
  passwordError.value = password.value ? "" : "Enter your current password.";
  if (emailError.value) return focusField(emailField.value);
  if (passwordError.value) return focusField(passwordField.value);
  if (await change(address, password.value)) {
    if (!pendingEmail.value) return close();
    // A code is on its way, so its field is what comes next.
    reset();
    code.value = "";
    codeError.value = "";
    await nextTick();
    return focusField(codeField.value);
  }
  if (!form.value?.contains(document.activeElement)) focusField(emailField.value);
};

const confirmCode = async () => {
  const digits = code.value.replace(/\s/g, "");
  codeError.value = /^\d{6}$/.test(digits) ? "" : "Enter the 6-digit code from the e-mail.";
  if (codeError.value) return focusField(codeField.value);
  if (await confirm(digits)) code.value = "";
  await nextTick();
  // Confirmed, dropped or expired: the code step is gone, and its key is left.
  if (!pendingEmail.value) return key.value?.$el.focus();
  if (!codeForm.value?.contains(document.activeElement)) focusField(codeField.value);
};
</script>

<template>
  <StatusMessage v-if="changeMessage" class="change__saved" tone="success">
    {{ changeMessage }}
  </StatusMessage>
  <!-- A refusal that took the waiting change away; one that keeps it shows in the code form. -->
  <StatusMessage v-if="confirmError && !pendingEmail" class="change__saved" tone="error">
    {{ confirmError }}
  </StatusMessage>

  <StatusMessage v-if="pendingEmail" :id="pendingId" class="change__pending" tone="info">
    Waiting for confirmation:
    <strong class="change__address">{{ pendingEmail }}</strong>
  </StatusMessage>

  <form
    v-if="pendingEmail && !open"
    ref="codeForm"
    class="change"
    novalidate
    @submit.prevent="confirmCode"
  >
    <BaseInput
      ref="codeField"
      v-model="code"
      label="Confirmation code"
      inputmode="numeric"
      autocomplete="one-time-code"
      hint="The code works for 15 minutes from when it was sent. Nothing yet? Check your spam folder, or get a new one with Change e-mail."
      :describedby="pendingId"
      :error="codeError"
      mono
      required
      @update:model-value="codeError = ''"
    />
    <StatusMessage v-if="confirmError" tone="error">{{ confirmError }}</StatusMessage>
    <div class="change__actions">
      <BaseButton type="submit" size="sm" :loading="isConfirming">
        {{ isConfirming ? "Confirming" : "Confirm code" }}
      </BaseButton>
      <BaseButton ref="key" size="sm" variant="secondary" :disabled="isConfirming" @click="start">
        Change e-mail
      </BaseButton>
    </div>
  </form>

  <BaseButton
    v-else-if="!open"
    ref="key"
    class="change__key"
    size="sm"
    variant="secondary"
    @click="start"
  >
    Change e-mail
  </BaseButton>

  <form v-else ref="form" class="change" novalidate @submit.prevent="save" @keydown.esc="cancel">
    <BaseInput
      ref="emailField"
      v-model="email"
      label="New e-mail"
      type="email"
      autocomplete="email"
      :hint="pendingEmail ? 'A new code replaces the one already sent.' : undefined"
      :error="emailError"
      required
      @update:model-value="emailError = ''"
    />
    <BaseInput
      ref="passwordField"
      v-model="password"
      label="Current password"
      type="password"
      autocomplete="current-password"
      :error="passwordError"
      required
      @update:model-value="passwordError = ''"
    />
    <StatusMessage v-if="changeError" tone="error">{{ changeError }}</StatusMessage>
    <div class="change__actions">
      <BaseButton type="submit" size="sm" :loading="isChanging" :disabled="isWaiting">
        {{ isChanging ? "Sending" : isWaiting ? `Send code in ${waitSeconds} s` : "Send code" }}
      </BaseButton>
      <BaseButton size="sm" variant="ghost" :disabled="isChanging" @click="cancel">
        Cancel
      </BaseButton>
    </div>
  </form>
</template>

<style scoped>
.change__saved,
.change__pending,
.change__key,
.change {
  margin-top: var(--sp-2);
}

.change__saved,
.change__pending,
.change {
  justify-self: stretch;
}

/* The new address, so a typo is easy to spot; it moves to the next line whole, and only an
   address wider than the line breaks. */
.change__address {
  display: inline-block;
  max-width: 100%;
  font-weight: 600;
  overflow-wrap: anywhere;
}

.change {
  display: grid;
  gap: var(--sp-4);
}

.change__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-2);
}
</style>
