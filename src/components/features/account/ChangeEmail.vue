<script setup lang="ts">
import { nextTick, ref, useTemplateRef } from "vue";
import { useChangeEmail } from "@/composables/useChangeEmail";
import { userEmail } from "@/scripts/authentication/authState";
import { isValidEmail } from "@/scripts/authentication/register";
import BaseButton from "@/components/ui/BaseButton.vue";
import BaseInput from "@/components/ui/BaseInput.vue";
import StatusMessage from "@/components/ui/StatusMessage.vue";

const { isChanging, changeError, changeMessage, change } = useChangeEmail();

const open = ref(false);
const email = ref("");
const password = ref("");
const emailError = ref("");
const passwordError = ref("");

const key = useTemplateRef("key");
const form = useTemplateRef("form");
const emailField = useTemplateRef("emailField");
const passwordField = useTemplateRef("passwordField");

const focusField = (field: { $el: HTMLElement } | null) =>
  field?.$el.querySelector("input")!.focus();

const start = async () => {
  open.value = true;
  changeMessage.value = "";
  await nextTick();
  focusField(emailField.value);
};

const close = async () => {
  open.value = false;
  email.value = "";
  password.value = "";
  emailError.value = "";
  passwordError.value = "";
  changeError.value = "";
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
  const address = email.value.trim();
  emailError.value = addressError(address);
  passwordError.value = password.value ? "" : "Enter your current password.";
  if (emailError.value) return focusField(emailField.value);
  if (passwordError.value) return focusField(passwordField.value);
  if (await change(address, password.value)) return close();
  if (!form.value?.contains(document.activeElement)) focusField(emailField.value);
};
</script>

<template>
  <StatusMessage v-if="changeMessage" class="change__saved" tone="success">
    {{ changeMessage }}
  </StatusMessage>

  <BaseButton
    v-if="!open"
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
      <BaseButton type="submit" size="sm" :loading="isChanging">
        {{ isChanging ? "Saving" : "Save e-mail" }}
      </BaseButton>
      <BaseButton size="sm" variant="ghost" :disabled="isChanging" @click="cancel">
        Cancel
      </BaseButton>
    </div>
  </form>
</template>

<style scoped>
.change__saved,
.change__key,
.change {
  margin-top: var(--sp-2);
}

.change__saved,
.change {
  justify-self: stretch;
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
