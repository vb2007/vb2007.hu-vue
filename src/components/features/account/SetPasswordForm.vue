<script setup lang="ts">
/** Sets a first password on an account made with GitHub; the API may want GitHub to confirm it's them first. */
import { computed, ref } from "vue";
import { UserManagement } from "@/constants/api";
import { userEmail } from "@/scripts/authentication/authState";
import { useSetPassword } from "@/composables/useSetPassword";
import AppIcon from "@/components/ui/AppIcon.vue";
import BaseButton from "@/components/ui/BaseButton.vue";
import BaseInput from "@/components/ui/BaseInput.vue";
import StatusMessage from "@/components/ui/StatusMessage.vue";

const emit = defineEmits<{ set: [] }>();

const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_MAX_LENGTH = 128;

const password = ref("");
const confirmPassword = ref("");
const checked = ref(false);
const { isSetting, setError, needsGithub, setPassword } = useSetPassword();

const passwordError = computed(() => {
  const length = [...password.value].length;
  if (!checked.value) return "";
  if (length < PASSWORD_MIN_LENGTH)
    return `Too short: use at least ${PASSWORD_MIN_LENGTH} characters.`;
  if (length > PASSWORD_MAX_LENGTH)
    return `Too long: use at most ${PASSWORD_MAX_LENGTH} characters.`;
  return "";
});
const confirmError = computed(() =>
  checked.value && confirmPassword.value !== password.value ? "The two passwords don't match." : ""
);

const onSubmit = async () => {
  checked.value = true;
  if (passwordError.value || confirmError.value) return;
  if (await setPassword(password.value)) emit("set");
};
</script>

<template>
  <section class="password" aria-labelledby="password-title">
    <h2 id="password-title" class="password__title">Password</h2>
    <p class="password__note">
      This account has no password yet: you log in with GitHub. Set one to also log in with your
      e-mail address, and to be able to unlink GitHub. If you logged in more than 10 minutes ago,
      GitHub confirms it's you first.
    </p>
    <form class="password__form" novalidate @submit.prevent="onSubmit">
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
        :hint="`${PASSWORD_MIN_LENGTH} to ${PASSWORD_MAX_LENGTH} characters.`"
        :error="passwordError"
        required
      />
      <BaseInput
        v-model="confirmPassword"
        label="Confirm password"
        type="password"
        autocomplete="new-password"
        :error="confirmError"
        required
      />
      <StatusMessage v-if="setError" tone="error">{{ setError }}</StatusMessage>
      <BaseButton
        v-if="needsGithub"
        class="password__key"
        :href="UserManagement.Authentication.githubLink"
      >
        <AppIcon name="github" :size="20" />
        Confirm with GitHub
      </BaseButton>
      <BaseButton v-else class="password__key" type="submit" :loading="isSetting">
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
