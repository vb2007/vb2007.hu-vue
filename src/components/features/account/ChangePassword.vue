<script setup lang="ts">
/** The Password row's key, which opens a form in place to change it. */
import { nextTick, ref, useTemplateRef } from "vue";
import { useChangePassword } from "@/composables/useChangePassword";
import { userEmail } from "@/scripts/authentication/authState";
import { passwordLengthError } from "@/scripts/authentication/register";
import BaseButton from "@/components/ui/BaseButton.vue";
import BaseInput from "@/components/ui/BaseInput.vue";
import StatusMessage from "@/components/ui/StatusMessage.vue";

const emit = defineEmits<{ open: [] }>();

const { isChanging, changeError, changed, change } = useChangePassword();

const open = ref(false);
const currentPassword = ref("");
const newPassword = ref("");
const confirmPassword = ref("");
const currentError = ref("");
const newError = ref("");
const confirmError = ref("");
const key = useTemplateRef("key");
const form = useTemplateRef("form");
const saveKey = useTemplateRef("saveKey");

const fields = () => form.value!.querySelectorAll<HTMLInputElement>("input[type=password]");

const start = async () => {
  changed.value = "";
  open.value = true;
  emit("open");
  await nextTick();
  fields()[0].focus();
};

const close = async () => {
  open.value = false;
  currentPassword.value = newPassword.value = confirmPassword.value = "";
  currentError.value = newError.value = confirmError.value = "";
  changeError.value = "";
  await nextTick();
  key.value?.$el.focus();
};

const cancel = () => {
  if (!isChanging.value) return close();
};

const save = async () => {
  currentError.value = currentPassword.value ? "" : "Enter your current password.";
  newError.value = passwordLengthError(newPassword.value) ?? "";
  confirmError.value =
    newPassword.value === confirmPassword.value ? "" : "The two passwords don't match.";

  const firstInvalid = [currentError, newError, confirmError].findIndex((error) => error.value);
  if (firstInvalid !== -1) return fields()[firstInvalid].focus();

  if (await change(currentPassword.value, newPassword.value)) return close();

  await nextTick();
  saveKey.value?.$el.focus();
};
</script>

<template>
  <StatusMessage v-if="changed" class="change__saved" tone="success">{{ changed }}</StatusMessage>

  <BaseButton
    v-if="!open"
    ref="key"
    class="change__key"
    size="sm"
    variant="secondary"
    @click="start"
  >
    Change password
  </BaseButton>

  <form v-else ref="form" class="change" novalidate @submit.prevent="save" @keydown.esc="cancel">
    <input type="email" autocomplete="username" :value="userEmail" readonly hidden />
    <BaseInput
      v-model="currentPassword"
      label="Current password"
      type="password"
      autocomplete="current-password"
      :error="currentError"
      required
      @update:model-value="currentError = ''"
    />
    <BaseInput
      v-model="newPassword"
      label="New password"
      type="password"
      autocomplete="new-password"
      hint="8 to 128 characters."
      :error="newError"
      required
      @update:model-value="newError = ''"
    />
    <BaseInput
      v-model="confirmPassword"
      label="Confirm new password"
      type="password"
      autocomplete="new-password"
      :error="confirmError"
      required
      @update:model-value="confirmError = ''"
    />
    <StatusMessage v-if="changeError" tone="error">{{ changeError }}</StatusMessage>
    <div class="change__actions">
      <BaseButton ref="saveKey" type="submit" size="sm" :loading="isChanging">
        {{ isChanging ? "Saving" : "Save password" }}
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
