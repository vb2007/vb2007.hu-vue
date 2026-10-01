<script setup lang="ts">
import { onMounted, ref, watch, computed } from "vue";
import { RouterLink } from "vue-router";
import { isLoggedIn } from "@/scripts/authentication/authState";
import { checkAuthCookie, login, loginStatus } from "@/scripts/authentication/user";
import BaseButton from "@/components/ui/BaseButton.vue";
import BaseInput from "@/components/ui/BaseInput.vue";
import StationBoard from "@/components/ui/StationBoard.vue";
import StatusMessage from "@/components/ui/StatusMessage.vue";

const email = ref("");
const password = ref("");
const isLoading = ref(false);

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
  checkAuthCookie();
});

watch(isLoggedIn, (newVal) => {
  if (!newVal) {
    loginStatus.value = "";
  }
});
</script>

<template>
  <StationBoard title="Log in" as="h1">
    <form v-if="!isLoggedIn" class="form" @submit.prevent="handleSubmit">
      <BaseInput v-model="email" label="E-mail" type="email" autocomplete="email" required />
      <BaseInput
        v-model="password"
        label="Password"
        type="password"
        autocomplete="current-password"
        required
      />
      <StatusMessage v-if="failure" tone="error">{{ failure }}</StatusMessage>
      <BaseButton type="submit" block :loading="isLoading">
        {{ isLoading ? "Logging in" : "Log in" }}
      </BaseButton>
      <p class="alt">No account yet? <RouterLink to="/register">Register</RouterLink></p>
    </form>

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

.alt {
  font-size: var(--fs-sm);
}
</style>
