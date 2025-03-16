<script lang="ts" setup>
import { ref, onMounted, watch } from "vue";
import { isLoggedIn } from "@/scripts/authentication/authState";

const username = ref("");
const email = ref("");
const password = ref("");
const registerStatus = ref("");
const autologin = ref();

const checkAuthCookie = () => {
  const cookies = document.cookie.split("; ");
  const authCookie = cookies.find((cookie) => cookie.startsWith("VB-AUTH="));
  if (authCookie) {
    registerStatus.value = "success";
    isLoggedIn.value = true;
  }
};

const handleSubmit = async (event: Event) => {
  event.preventDefault();

  try {
    const registerResponse = await fetch("http://localhost:3000/auth/register", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        username: username.value,
        email: email.value,
        password: password.value
      })
    });

    switch (registerResponse.status) {
      case 200:
        const data = await registerResponse.json();
        console.log("Response data: ", data);
        registerStatus.value = "success";

        if (autologin.value) {
          try {
            const loginResponse = await fetch("http://localhost:3000/auth/login", {
              method: "POST",
              headers: {
                "Content-Type": "application/json"
              },
              body: JSON.stringify({
                email: email.value,
                password: password.value
              })
            });

            if (loginResponse.status === 200) {
              const loginData = await loginResponse.json();
              document.cookie = `VB-AUTH=${loginData.authentication.sessionToken}; path=/`;
              isLoggedIn.value = true;
              email.value = loginData.email;
            } else {
              console.error("Auto-login failed after successful registration");
            }
          } catch (loginError) {
            console.error("Error while trying to auto-login:", loginError);
          }
        }
        break;
      case 403:
        registerStatus.value = "username-exists";
        break;
      case 400:
        registerStatus.value = "missing-fields";
        break;
      default:
        registerStatus.value = "error";
        throw new Error(`HTTP error! status: ${registerResponse.status}`);
    }
  } catch (error) {
    console.error("Error while trying to register user: ", error);
    registerStatus.value = "error";
  }
};

onMounted(() => {
  checkAuthCookie();
});

watch(isLoggedIn, (newVal) => {
  if (!newVal) {
    registerStatus.value = "";
  }
});
</script>

<template>
  <div class="register--container">
    <h1>Register</h1>
    <div v-if="registerStatus === 'success'">
      <p>Registration successful!</p>
    </div>
    <div v-else>
      <form @submit="handleSubmit">
        <label for="email">E-mail</label>
        <input type="email" id="email" name="email" v-model="email" />

        <label for="username">Username</label>
        <input type="text" id="username" name="username" v-model="username" />

        <label for="password">Password</label>
        <input type="password" id="password" name="password" v-model="password" />

        <label for="confirm-password">Confirm password</label>
        <input type="password" id="confirm-password" name="confirm-password" />

        <label for="autologin">Log me in automatically after registration</label>
        <input type="checkbox" id="autologin" name="autologin" v-model="autologin" checked />

        <button type="submit">Register</button>
      </form>
    </div>
    <div v-if="registerStatus === 'missing-fields'">
      <p>Please fill out all required input fields.</p>
    </div>
    <div v-if="registerStatus === 'username-exists'">
      <p>This username is already taken.</p>
    </div>
    <div v-if="registerStatus === 'error'">
      <p>Registration failed. Please try again.</p>
    </div>
  </div>
</template>

<style lang="css" scoped>
.register--container {
  display: flex;
  flex-direction: column;
  height: auto;
  width: 100%;
  gap: 20px;
  align-items: center;
}

h1 {
  color: #333;
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
