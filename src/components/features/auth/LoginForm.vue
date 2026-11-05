<script setup lang="ts">
import { nextTick, onMounted, ref, watch, computed, useId, useTemplateRef } from "vue";
import { RouterLink } from "vue-router";
import { LoginStatus } from "@/constants/auth";
import { Messages } from "@/constants/messages";
import { isLoggedIn, userEmail } from "@/scripts/authentication/authState";
import { passwordResetNotice } from "@/scripts/authentication/passwordReset";
import { emailShapeError, normalizeEmail, requiredError } from "@/scripts/authentication/register";
import { login, loginStatus, logout, restoreSession } from "@/scripts/authentication/user";
import { useFormValidation } from "@/composables/useFormValidation";
import { useOauthError } from "@/composables/useOauthError";
import { useRetryHold } from "@/composables/useRetryHold";
import GithubLogin from "@/components/features/auth/GithubLogin.vue";
import BaseButton from "@/components/ui/BaseButton.vue";
import BaseInput from "@/components/ui/BaseInput.vue";
import StationBoard from "@/components/ui/StationBoard.vue";
import StatusMessage from "@/components/ui/StatusMessage.vue";

const email = ref("");
const password = ref("");
const isLoading = ref(false);
const isButtonError = ref(false);
const form = useTemplateRef("form");
const { errors, isValid, leave, validate, reset } = useFormValidation({
  email: { value: email, check: () => emailShapeError(email.value) },
  password: {
    value: password,
    check: () => requiredError(password.value, Messages.Auth.passwordMissing)
  }
});
const oauthError = useOauthError();
// Shown once: a reset sends the user here with the API's message. It's about the session at the
// time of the reset, so logging in here drops it.
const resetNotice = ref(passwordResetNotice.value);
passwordResetNotice.value = "";
// The login limiter counts per address, so another address may be tried during the hold.
const hold = useRetryHold(loginStatus);
const heldId = computed(() => normalizeEmail(email.value));
const isHeld = computed(() => hold.isHeld(heldId.value));
const failureId = useId();

let flagTimer: ReturnType<typeof setTimeout> | undefined;
/** Flashes the submit key red for a second. */
const flagError = () => {
  clearTimeout(flagTimer);
  isButtonError.value = true;
  flagTimer = setTimeout(() => (isButtonError.value = false), 1000);
};

const handleSubmit = async () => {
  if (isHeld.value) return;
  if (!(await validate(form.value))) {
    flagError();
    return;
  }
  resetNotice.value = "";
  isLoading.value = true;
  let wait: number | undefined;
  try {
    wait = await login(email.value, password.value);
  } finally {
    isLoading.value = false;
  }
  if (wait) {
    hold.start(wait, heldId.value);
    // The key is disabled for the wait, which can't keep the focus; the password is what's left.
    await nextTick();
    if (!form.value?.querySelector(":focus:not(:disabled)")) {
      form.value?.querySelector<HTMLInputElement>("input[type=password]")?.focus();
    }
  }
};

const failure = computed(() => {
  if (!loginStatus.value || loginStatus.value === LoginStatus.Success) return "";
  if (loginStatus.value === LoginStatus.UnknownError) {
    return Messages.Auth.loginUnknownError;
  }
  return loginStatus.value;
});

onMounted(() => {
  restoreSession();
});

watch(isLoggedIn, (newVal) => {
  if (!newVal) {
    loginStatus.value = "";
    reset();
  }
});
</script>

<template>
  <StationBoard title="Log in" as="h1">
    <template v-if="!isLoggedIn">
      <form ref="form" class="form" novalidate @submit.prevent="handleSubmit">
        <StatusMessage v-if="oauthError" tone="error">{{ oauthError }}</StatusMessage>
        <StatusMessage v-if="resetNotice" tone="success">{{ resetNotice }}</StatusMessage>
        <BaseInput
          v-model="email"
          label="E-mail"
          type="email"
          autocomplete="email"
          :error="errors.email"
          required
          @blur="leave('email')"
        />
        <div class="password">
          <BaseInput
            v-model="password"
            label="Password"
            type="password"
            autocomplete="current-password"
            :error="errors.password"
            required
            @blur="leave('password')"
          />
          <RouterLink class="forgot" to="/reset-password">Forgot password?</RouterLink>
        </div>
        <!-- The lockout's message says its wait in words already, so the hold adds no spoken one. -->
        <StatusMessage v-if="failure" :id="failureId" tone="error">{{ failure }}</StatusMessage>
        <BaseButton
          type="submit"
          block
          :loading="isLoading"
          :disabled="isHeld"
          :aria-label="isHeld ? hold.name.value : undefined"
          :aria-describedby="isHeld && failure ? failureId : undefined"
          :blocked="!isValid"
          :error="isButtonError"
        >
          {{ isLoading ? "Logging in" : isHeld ? hold.label.value : "Log in" }}
        </BaseButton>
      </form>
      <GithubLogin label="Log in with GitHub" />
      <p class="alt">No account yet? <RouterLink to="/register">Register</RouterLink></p>
    </template>

    <!-- Linking GitHub to a logged-in account also reports its errors here (vb2007/vb2007.hu-api#132). -->
    <div v-else-if="oauthError" class="done">
      <StatusMessage tone="error">{{ oauthError }}</StatusMessage>
      <BaseButton to="/account">Go to your account</BaseButton>
    </div>

    <!-- Resetting another account's password leaves this one logged in. -->
    <div v-else-if="resetNotice" class="done">
      <StatusMessage tone="success">{{ resetNotice }}</StatusMessage>
      <p>
        You're still logged in as <strong class="who">{{ userEmail }}</strong
        >. Log out to log in with the new password.
      </p>
      <BaseButton @click="logout">Log out</BaseButton>
    </div>

    <div v-else class="done">
      <StatusMessage tone="success">Login successful!</StatusMessage>
      <BaseButton to="/shorten">Go to Shorten</BaseButton>
    </div>
  </StationBoard>
</template>

<style scoped>
.form,
.done {
  display: grid;
  gap: var(--sp-4);
}

.password {
  display: grid;
  gap: var(--sp-2);
}

.forgot {
  justify-self: end;
  font-size: var(--fs-sm);
}

.alt {
  font-size: var(--fs-sm);
}

.who {
  font-weight: 600;
  overflow-wrap: anywhere;
}
</style>
