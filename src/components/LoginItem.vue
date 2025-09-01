<script lang="ts" setup>
import { ref, onMounted, watch } from "vue";
import { isLoggedIn } from "@/scripts/authentication/authState";
import { checkAuthCookie, login, loginStatus } from "@/scripts/authentication/user";

const email = ref("");
const password = ref("");

const handleSubmit = async (event: Event) => {
  event.preventDefault();

  login(email.value, password.value);
};

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
  <div class="login--container">
    <h1>Login</h1>
    <div v-if="loginStatus === 'success'">
      <p>Login successful!</p>
    </div>
    <div v-else>
      <form @submit="handleSubmit">
        <label for="email">E-mail</label>
        <input type="email" id="email" name="email" v-model="email" />

        <label for="password">Password</label>
        <input type="password" id="password" name="password" v-model="password" />
        <button type="submit">Login</button>
      </form>
    </div>
    <div v-if="loginStatus === 'unknown-error'">
      <p>User with that email address doesn't exists.</p>
    </div>
    <div v-else>
      <p>{{ loginStatus }}</p>
    </div>
  </div>
</template>

<style lang="css" scoped>
.login--container {
  display: flex;
  flex-direction: column;
  height: auto;
  width: 100%;
  gap: 20px;
  align-items: center;
}

h1 {
  color: #ffffff;
  font-size: 2em;
}

form {
  width: 100%;
  max-width: auto;
  min-width: 400px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

input {
  width: 100%;
  padding: 10px;
  border-radius: 5px;
  border: 1px solid #ccc;
  transition:
    border-color 0.3s,
    box-shadow 0.3s;
}

input:focus {
  border-color: #007bff;
  box-shadow: 0 0 5px rgba(0, 123, 255, 0.5);
  outline: none;
}

label {
  font-weight: bold;
  color: #555;
}

button {
  padding: 10px;
  border: none;
  border-radius: 5px;
  background-color: #007bff;
  color: white;
  font-size: 1em;
  cursor: pointer;
  transition:
    background-color 0.3s,
    transform 0.3s;
}

button:hover {
  background-color: #0056b3;
  transform: scale(1.05);
}

button:active {
  background-color: #004085;
  transform: scale(1);
}
</style>
