<script setup lang="ts">
import { onMounted, ref, watch, computed } from "vue";
import { RouterLink } from "vue-router";
import { isLoggedIn, userEmail } from "@/scripts/authentication/authState";
import { passwordResetNotice } from "@/scripts/authentication/passwordReset";
import { login, loginStatus, logout, restoreSession } from "@/scripts/authentication/user";
import { useOauthError } from "@/composables/useOauthError";
import GithubLogin from "@/components/features/auth/GithubLogin.vue";
import BaseButton from "@/components/ui/BaseButton.vue";
import BaseInput from "@/components/ui/BaseInput.vue";
import StationBoard from "@/components/ui/StationBoard.vue";
import StatusMessage from "@/components/ui/StatusMessage.vue";

const email = ref("");
const password = ref("");
const isLoading = ref(false);
const oauthError = useOauthError();
// Shown once: a reset sends the user here with the API's message.
const resetNotice = passwordResetNotice.value;
passwordResetNotice.value = "";

const handleSubmit = async () => {
  isLoading.value = true;
  try {
    await login(email.value, password.value);
  } finally {
    isLoading.value = false;
  }
};

const failure = computed(() => {
  if (!loginStatus.value || loginStatus.value === "success") return "";
  if (loginStatus.value === "unknown-error") {
    return "An unknown error occurred. Please try again later.";
  }
  return loginStatus.value;
});

onMounted(() => {
  restoreSession();
});

watch(isLoggedIn, (newVal) => {
  if (!newVal) {
    loginStatus.value = "";
  }
});
</script>

<template>
  <StationBoard title="Log in" as="h1">
    <template v-if="!isLoggedIn">
      <form class="form" @submit.prevent="handleSubmit">
        <StatusMessage v-if="oauthError" tone="error">{{ oauthError }}</StatusMessage>
        <StatusMessage v-if="resetNotice" tone="success">{{ resetNotice }}</StatusMessage>
        <BaseInput v-model="email" label="E-mail" type="email" autocomplete="email" required />
        <div class="password">
          <BaseInput
            v-model="password"
            label="Password"
            type="password"
            autocomplete="current-password"
            required
          />
          <RouterLink class="forgot" to="/reset-password">Forgot password?</RouterLink>
        </div>
        <StatusMessage v-if="failure" tone="error">{{ failure }}</StatusMessage>
        <BaseButton type="submit" block :loading="isLoading">
          {{ isLoading ? "Logging in" : "Log in" }}
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
