<script setup lang="ts">
/**
 * Sets a first password on an account made with GitHub; the API may want GitHub to confirm it's
 * them first. It hides itself once the account has a password but stays mounted to tell the panel.
 */
import { nextTick, ref, useId, useTemplateRef } from "vue";
import { Endpoints } from "@/constants/endpoints";
import { Limits } from "@/constants/limits";
import { Messages } from "@/constants/messages";
import { apiUrl } from "@/scripts/api/client";
import { hasPassword, userEmail } from "@/scripts/authentication/authState";
import {
  passwordEarlyError,
  passwordError,
  passwordMatchEarlyError,
  passwordMatchError
} from "@/scripts/authentication/register";
import { useFormValidation } from "@/composables/useFormValidation";
import { useSetPassword } from "@/composables/useSetPassword";
import AppIcon from "@/components/ui/AppIcon.vue";
import BaseButton from "@/components/ui/BaseButton.vue";
import BaseInput from "@/components/ui/BaseInput.vue";
import StatusMessage from "@/components/ui/StatusMessage.vue";

const passwordHint = Messages.Auth.passwordHint(
  Limits.Password.minLength,
  Limits.Password.maxLength
);

const emit = defineEmits<{ set: [] }>();

const password = ref("");
const confirmPassword = ref("");
const errorId = useId();
const githubKey = useTemplateRef<InstanceType<typeof BaseButton>>("githubKey");
const githubLink = apiUrl(Endpoints.Auth.githubLink);
const { isSetting, setError, needsGithub, setPassword } = useSetPassword();

const form = useTemplateRef("form");
const { errors, isValid, leave, validate } = useFormValidation({
  password: {
    value: password,
    check: () => passwordError(password.value),
    early: () => passwordEarlyError(password.value)
  },
  confirmPassword: {
    value: confirmPassword,
    check: () => passwordMatchError(password.value, confirmPassword.value),
    early: () => passwordMatchEarlyError(password.value, confirmPassword.value)
  }
});

const onSubmit = async () => {
  if (!(await validate(form.value))) return;

  if (await setPassword(password.value)) {
    emit("set");
  } else if (needsGithub.value) {
    await nextTick();
    githubKey.value?.$el.focus();
  }
};
</script>

<template>
  <section v-if="!hasPassword" class="password" aria-labelledby="password-title">
    <h2 id="password-title" class="password__title">Password</h2>
    <p class="password__note">
      This account has no password yet: you log in with GitHub. Set one to also log in with your
      e-mail address, and to be able to unlink GitHub. If you logged in more than
      {{ Limits.Github.reauthMinutes }} minutes ago, GitHub confirms it's you first.
    </p>
    <form ref="form" class="password__form" novalidate @submit.prevent="onSubmit">
      <!-- Tells password managers which account the new password belongs to. -->
      <input
        class="visually-hidden"
        type="email"
        autocomplete="username"
        :value="userEmail"
        readonly
        tabindex="-1"
        aria-hidden="true"
      />
      <BaseInput
        v-model="password"
        label="New password"
        type="password"
        autocomplete="new-password"
        :hint="passwordHint"
        :error="errors.password"
        required
        @blur="leave('password')"
      />
      <BaseInput
        v-model="confirmPassword"
        label="Confirm password"
        type="password"
        autocomplete="new-password"
        :error="errors.confirmPassword"
        required
        @blur="leave('confirmPassword')"
      />
      <StatusMessage v-if="setError" :id="errorId" :tone="needsGithub ? 'info' : 'error'">{{
        setError
      }}</StatusMessage>
      <BaseButton
        v-if="needsGithub"
        ref="githubKey"
        class="password__key"
        :aria-describedby="errorId"
        :href="githubLink"
      >
        <AppIcon name="github" :size="20" />
        Confirm with GitHub
      </BaseButton>
      <BaseButton
        v-else
        class="password__key"
        type="submit"
        :loading="isSetting"
        :blocked="!isValid"
      >
        {{ isSetting ? "Setting password" : "Set password" }}
      </BaseButton>
    </form>
  </section>
</template>

<style scoped>
.password {
  display: grid;
  gap: var(--sp-3);
}

.password__title {
  font-size: 1.25rem;
  letter-spacing: 0.04em;
  line-height: 1.1;
  text-transform: uppercase;
}

.password__note {
  font-size: var(--fs-sm);
  color: var(--c-ink-soft);
}

.password__form {
  display: grid;
  gap: var(--sp-4);
  margin-top: var(--sp-2);
}

.password__key {
  justify-self: start;
}
</style>
