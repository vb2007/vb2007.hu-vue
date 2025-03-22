<script lang="ts" setup>
import { ref, onMounted, watch, type Ref, computed } from "vue";
import { isLoggedIn, userEmail } from "@/scripts/authentication/authState";

const username: Ref<string, string> = ref("");
const email: Ref<string, string> = ref("");
const password: Ref<string, string> = ref("");
const confirmPassword: Ref<string, string> = ref("");
const registerStatus: Ref<string, string> = ref("");
const autologin: Ref<boolean, boolean> = ref(true);

const checkAuthCookie = () => {
  const cookies = document.cookie.split("; ");
  const authCookie = cookies.find((cookie) => cookie.startsWith("VB-AUTH="));
  if (authCookie) {
    registerStatus.value = "success";
    isLoggedIn.value = true;
  }
};

const validateRegisterData = (
  username: string,
  email: string,
  password: string,
  confirmPassword: string
) => {
  try {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return "invalid-email";
    }

    if (username.length < 2 || username.length > 16) {
      return "invalid-username";
    }

    if (password.length < 6 || password.length > 30) {
      return "invalid-password";
    }

    if (password !== confirmPassword) {
      return "unmatched-passwords";
    }

    return;
  } catch (error) {
    console.error("Error validating the registration data: ", error);
  }
};

const errorCounter = ref(0);
const buttonClass = computed(() => {
  if (registerStatus.value && registerStatus.value !== "success") {
    return `error-button-${errorCounter.value}`;
  }
  return "";
});

const isLoading: Ref<boolean, boolean> = ref(false);

const handleSubmit = async (event: Event) => {
  event.preventDefault();
  registerStatus.value = "";

  const registerDataValidation = validateRegisterData(
    username.value,
    email.value,
    password.value,
    confirmPassword.value
  );
  if (registerDataValidation) {
    registerStatus.value = registerDataValidation;
    errorCounter.value++;
    return;
  }

  isLoading.value = true;

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
          setTimeout(async () => {
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
                userEmail.value = loginData.email;
              } else {
                console.error("Auto-login failed after successful registration");
              }
            } catch (loginError) {
              console.error("Error while trying to auto-login:", loginError);
            }
          }, 1000);
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
    errorCounter.value++;
  } finally {
    isLoading.value = false;
  }
};

onMounted(() => {
  checkAuthCookie();
});

watch(isLoggedIn, (newVal) => {
  if (!newVal) {
    registerStatus.value = "";
  }
  //avoids the button error animation trigger on load
  setTimeout(() => {
    errorCounter.value = 1;
  }, 500);
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
        <input type="email" id="email" name="email" v-model="email" required />

        <label for="username">Username</label>
        <input type="text" id="username" name="username" v-model="username" required />

        <label for="password">Password</label>
        <input type="password" id="password" name="password" v-model="password" required />

        <label for="confirmPassword">Confirm password</label>
        <input
          type="password"
          id="confirmPassword"
          name="confirmPassword"
          v-model="confirmPassword"
          required
        />

        <div class="checkbox-container">
          <input type="checkbox" id="autologin" name="autologin" v-model="autologin" checked />
          <label for="autologin" class="checkbox-label"
            >Log me in automatically after registration</label
          >
        </div>

        <button type="submit" :disabled="isLoading" :class="buttonClass">
          {{ isLoading ? "Registering..." : "Register" }}
        </button>
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
    <div v-if="registerStatus === 'invalid-email'">
      <p>Please enter a valid email address.</p>
    </div>
    <div v-if="registerStatus === 'invalid-username'">
      <p>Your username's length must be between 2 and 16 characters.</p>
    </div>
    <div v-if="registerStatus === 'invalid-password'">
      <p>Your password's length must be between 6 and 30 characters.</p>
    </div>
    <div v-if="registerStatus === 'unmatched-passwords'">
      <p>The two passowrds don't match.</p>
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

.checkbox-container {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 5px 0;
}

.checkbox-label {
  margin: 0;
}

input[type="checkbox"] {
  width: auto;
  margin: 0;
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

[class^="error-button-"] {
  animation: flashError 1s;
}

@keyframes flashError {
  0% {
    background-color: #dc3545;
  }
  100% {
    background-color: #007bff;
  }
}
</style>
