<script setup lang="ts">
import { nextTick, onMounted, ref, watch, computed, useId, useTemplateRef } from "vue";
import { RouterLink } from "vue-router";
import { LoginStatus } from "@/constants/auth";
import { Messages } from "@/constants/messages";
import { isLoggedIn, userEmail } from "@/scripts/authentication/authState";
import { passwordResetNotice } from "@/scripts/authentication/passwordReset";
import { emailShapeError, normalizeEmail, requiredError } from "@/scripts/authentication/register";
import {
  forgetLogin,
  login,
  loginStatus,
  logout,
  restoreSession
} from "@/scripts/authentication/user";
import { useFormValidation } from "@/composables/useFormValidation";
import { useOauthError } from "@/composables/useOauthError";
import { useRetryHold } from "@/composables/useRetryHold";
import GithubLogin from "@/components/features/auth/GithubLogin.vue";
import BaseButton from "@/components/ui/BaseButton.vue";
import BaseInput from "@/components/ui/BaseInput.vue";
import StationBoard from "@/components/ui/StationBoard.vue";
import StatusMessage from "@/components/ui/StatusMessage.vue";
import { statusTextId } from "@/components/ui/statusMessage";

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
// The last attempt's outcome is kept by the module, but a hold only by this form: kept from an
// earlier visit, or landing from a login sent then, a lockout would outlive its hold, over a key
// that no longer waits.
forgetLogin();
// The login limiter counts per address, so another address may be tried during the hold.
const hold = useRetryHold(loginStatus);
const heldId = computed(() => normalizeEmail(email.value));
const isHeld = computed(() => hold.isHeld(heldId.value));
/** The address the last attempt was for, normalized: its outcome says nothing about another. */
const triedId = ref("");
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
  // The answer is about the address sent, whatever the field reads once it lands.
  const id = (triedId.value = heldId.value);
  isLoading.value = true;
  let wait: number | undefined;
  try {
    wait = await login(email.value, password.value);
  } finally {
    isLoading.value = false;
  }
  if (wait) hold.start(wait, id);
  // The key was disabled while it loaded, which drops the focus: after a refusal it goes back to
  // the key, or to the password while the key waits. Logged in, the form is gone.
  await nextTick();
  if (form.value && !form.value.querySelector(":focus:not(:disabled)")) {
    (
      form.value.querySelector<HTMLButtonElement>("button[type=submit]:not(:disabled)") ??
      form.value.querySelector<HTMLInputElement>("input[type=password]")
    )?.focus();
  }
};

/**
 * Why the typed address can't log in: while it's held, the hold's reason, since `loginStatus` may
 * be another address's outcome by then; otherwise the last attempt's, if it was for this address.
 */
const status = computed(() => {
  if (isHeld.value) return hold.note.value;
  return triedId.value === heldId.value ? loginStatus.value : "";
});
const failure = computed(() => {
  if (!status.value || status.value === LoginStatus.Success) return "";
  if (status.value === LoginStatus.UnknownError) {
    return Messages.Auth.loginUnknownError;
  }
  return status.value;
});

onMounted(() => {
  restoreSession();
});

watch(isLoggedIn, (loggedIn) => {
  if (loggedIn) {
    // The password has done its job: logging out here, maybe on a shared machine, doesn't bring it
    // back. The address stays, to log in again with.
    password.value = "";
  } else {
    forgetLogin();
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
        <StatusMessage
          v-if="failure"
          :id="failureId"
          tone="error"
          :spoken="hold.spokenFor(heldId, status)"
          >{{ failure }}</StatusMessage
        >
        <BaseButton
          type="submit"
          block
          :loading="isLoading"
          :disabled="isHeld"
          :aria-label="isHeld ? hold.name.value : undefined"
          :aria-describedby="isHeld && failure ? statusTextId(failureId) : undefined"
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
