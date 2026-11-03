<script setup lang="ts">
/** The Password row's key, which opens a form in place to change it. */
import { nextTick, ref, useTemplateRef } from "vue";
import { Limits } from "@/constants/limits";
import { Messages } from "@/constants/messages";
import { useChangePassword } from "@/composables/useChangePassword";
import { userEmail } from "@/scripts/authentication/authState";
import {
  passwordEarlyError,
  passwordError,
  passwordMatchEarlyError,
  passwordMatchError,
  requiredError
} from "@/scripts/authentication/register";
import { useFormValidation } from "@/composables/useFormValidation";
import BaseButton from "@/components/ui/BaseButton.vue";
import BaseInput from "@/components/ui/BaseInput.vue";
import StatusMessage from "@/components/ui/StatusMessage.vue";

const passwordHint = Messages.Auth.passwordHint(
  Limits.Password.minLength,
  Limits.Password.maxLength
);

const emit = defineEmits<{ start: [] }>();

const { isChanging, changeError, changed, change } = useChangePassword();

const open = ref(false);
const currentPassword = ref("");
const newPassword = ref("");
const confirmPassword = ref("");
const { errors, isValid, leave, validate, reset } = useFormValidation({
  current: {
    value: currentPassword,
    check: () => requiredError(currentPassword.value, "Enter your current password.")
  },
  new: {
    value: newPassword,
    check: () => passwordError(newPassword.value),
    early: () => passwordEarlyError(newPassword.value)
  },
  confirm: {
    value: confirmPassword,
    check: () => passwordMatchError(newPassword.value, confirmPassword.value),
    early: () => passwordMatchEarlyError(newPassword.value, confirmPassword.value)
  }
});
const key = useTemplateRef("key");
const form = useTemplateRef("form");
const saveKey = useTemplateRef("saveKey");

const fields = () => form.value!.querySelectorAll<HTMLInputElement>("input[type=password]");

const start = async () => {
  changed.value = "";
  open.value = true;
  emit("start");
  await nextTick();
  fields()[0].focus();
};

const close = async () => {
  open.value = false;
  currentPassword.value = newPassword.value = confirmPassword.value = "";
  reset();
  changeError.value = "";
  await nextTick();
  key.value?.$el.focus();
};

const cancel = () => {
  if (!isChanging.value) return close();
};

const save = async () => {
  if (!(await validate(form.value))) return;

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
      :error="errors.current"
      required
      @blur="leave('current')"
    />
    <BaseInput
      v-model="newPassword"
      label="New password"
      type="password"
      autocomplete="new-password"
      :hint="passwordHint"
      :error="errors.new"
      required
      @blur="leave('new')"
    />
    <BaseInput
      v-model="confirmPassword"
      label="Confirm new password"
      type="password"
      autocomplete="new-password"
      :error="errors.confirm"
      required
      @blur="leave('confirm')"
    />
    <StatusMessage v-if="changeError" tone="error">{{ changeError }}</StatusMessage>
    <div class="change__actions">
      <BaseButton ref="saveKey" type="submit" size="sm" :loading="isChanging" :blocked="!isValid">
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
