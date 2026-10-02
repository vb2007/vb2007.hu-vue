<script setup lang="ts">
import { onMounted, ref, watch, computed } from "vue";
import { RouterLink } from "vue-router";
import { isLoggedIn } from "@/scripts/authentication/authState";
import { register, registerStatus, validateRegisterData } from "@/scripts/authentication/register";
import { restoreSession } from "@/scripts/authentication/user";
import BaseButton from "@/components/ui/BaseButton.vue";
import BaseCheckbox from "@/components/ui/BaseCheckbox.vue";
import BaseInput from "@/components/ui/BaseInput.vue";
import StationBoard from "@/components/ui/StationBoard.vue";
import StatusMessage from "@/components/ui/StatusMessage.vue";

const username = ref("");
const email = ref("");
const password = ref("");
const confirmPassword = ref("");
const autologin = ref(true);
const isLoading = ref(false);
const isButtonError = ref(false);

const MESSAGES: Record<string, string> = {
  "missing-fields": "Please fill out all required input fields.",
  "invalid-email": "Please enter a valid email address.",
  "invalid-username": "Your username's length must be between 2 and 16 characters.",
  "invalid-password": "Your password's length must be between 6 and 30 characters.",
  "unmatched-passwords": "The two passwords don't match.",
  error: "Registration failed. Please try again."
};

const failure = computed(() => {
  const status = registerStatus.value;
  if (!status || status === "success") return "";
  return MESSAGES[status] ?? status;
});

const flagError = () => {
  isButtonError.value = true;
  setTimeout(() => {
    isButtonError.value = false;
  }, 1000);
};

const handleSubmit = async () => {
  const problem = validateRegisterData(
    username.value,
    email.value,
    password.value,
    confirmPassword.value
  );
  if (problem) {
    registerStatus.value = problem;
    flagError();
    return;
  }

  isLoading.value = true;
  try {
    const created = await register(username.value, email.value, password.value, autologin.value);
    if (!created) flagError();
  } finally {
    isLoading.value = false;
  }
};

onMounted(async () => {
  registerStatus.value = "";
  await restoreSession();
  if (isLoggedIn.value) {
    registerStatus.value = "success";
  }
});

watch(isLoggedIn, (newVal) => {
  if (!newVal) {
    registerStatus.value = "";
  }
});
</script>

<template>
  <StationBoard title="Register" as="h1">
    <div v-if="registerStatus === 'success'" class="form">
      <StatusMessage tone="success">Registration successful!</StatusMessage>
      <BaseButton to="/shorten">Go to Shorten</BaseButton>
    </div>

    <form v-else class="form" novalidate @submit.prevent="handleSubmit">
      <BaseInput v-model="email" label="E-mail" type="email" autocomplete="email" required />
      <BaseInput v-model="username" label="Username" autocomplete="username" required />
      <BaseInput
        v-model="password"
        label="Password"
        type="password"
        autocomplete="new-password"
        required
      />
      <BaseInput
        v-model="confirmPassword"
        label="Confirm password"
        type="password"
        autocomplete="new-password"
        required
      />
      <BaseCheckbox v-model="autologin" label="Log me in automatically after registration" />
      <StatusMessage v-if="failure" tone="error">{{ failure }}</StatusMessage>
      <BaseButton type="submit" block :loading="isLoading" :error="isButtonError">
        {{ isLoading ? "Registering" : "Register" }}
      </BaseButton>
      <p class="alt">Already registered? <RouterLink to="/login">Log in</RouterLink></p>
    </form>
  </StationBoard>
</template>

<style scoped>
.form {
  display: grid;
  gap: var(--sp-4);
}

.alt {
  font-size: var(--fs-sm);
}
</style>
