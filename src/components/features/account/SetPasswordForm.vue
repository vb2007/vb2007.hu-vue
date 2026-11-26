<script setup lang="ts">
/**
 * Sets a first password on an account made with GitHub; the API may want GitHub to confirm it's
 * them first. It hides itself once the account has a password but stays mounted to tell the panel.
 */
import { computed, nextTick, ref, useId, useTemplateRef } from "vue";
import { Limits } from "@/constants/limits";
import { Messages } from "@/constants/messages";
import { hasPassword, userEmail } from "@/scripts/authentication/authState";
import { clearDeleteIntent } from "@/scripts/authentication/deleteIntent";
import {
  passwordEarlyError,
  passwordError,
  passwordMatchEarlyError,
  passwordMatchError
} from "@/scripts/authentication/register";
import { useFormValidation } from "@/composables/useFormValidation";
import { useGithubLink } from "@/composables/useGithubLink";
import { useSetPassword } from "@/composables/useSetPassword";
import AppIcon from "@/components/ui/AppIcon.vue";
import BaseButton from "@/components/ui/BaseButton.vue";
import BaseInput from "@/components/ui/BaseInput.vue";
import StatusMessage from "@/components/ui/StatusMessage.vue";

const passwordHint = Messages.Auth.lengthHint(Limits.Password.minLength, Limits.Password.maxLength);

const emit = defineEmits<{ set: [] }>();

const password = ref("");
const confirmPassword = ref("");
const errorId = useId();
const githubKey = useTemplateRef<InstanceType<typeof BaseButton>>("githubKey");
/** The relink that has GitHub confirm it's them, back to this form rather than a delete left unconfirmed. */
const {
  isLinking,
  isStalled,
  linkError,
  link,
  stop,
  hold: linkHold
} = useGithubLink((url) => {
  clearDeleteIntent();
  window.location.assign(url);
});
/** A start that hasn't stalled: one that should have left by now may be tried again. */
const isLeaving = computed(() => isLinking.value && !isStalled.value);
const isLinkHeld = computed(() => linkHold.isHeld());
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
  linkError.value = "";

  if (await setPassword(password.value)) {
    emit("set");
  } else if (needsGithub.value) {
    await nextTick();
    githubKey.value?.$el.focus();
  }
};

const confirmWithGithub = async () => {
  // A start that stalled is given up on first, so this one can begin.
  stop();
  if (await link()) return;
  // The key disabled while it worked, which dropped the focus; a held key stays disabled.
  await nextTick();
  if (isLinkHeld.value)
    form.value?.querySelector<HTMLInputElement>("input[type=password]")?.focus();
  else githubKey.value?.$el.focus();
};
</script>

<template>
  <section v-if="!hasPassword" class="password" aria-labelledby="password-title">
    <h2 id="password-title" class="password__title">Password</h2>
    <p class="password__note">
      This account has no password yet: you log in with GitHub. Set one to also log in with your
      e-mail address, and to be able to unlink GitHub.
      {{ Messages.Account.githubReauthNote(Limits.Github.reauthMinutes) }}
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
      <StatusMessage
        v-if="needsGithub && linkHold.shown()"
        tone="error"
        :spoken="linkHold.spokenFor()"
        >{{ linkHold.shown() }}</StatusMessage
      >
      <BaseButton
        v-if="needsGithub"
        ref="githubKey"
        class="password__key"
        :aria-label="isLinkHeld ? linkHold.name.value : undefined"
        :aria-describedby="errorId"
        :loading="isLeaving"
        :disabled="isLinkHeld"
        @click="confirmWithGithub"
      >
        <template v-if="isLinkHeld">{{ linkHold.label.value }}</template>
        <template v-else>
          <AppIcon name="github" :size="20" />
          {{ isLeaving ? "Opening GitHub" : "Confirm with GitHub" }}
        </template>
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
