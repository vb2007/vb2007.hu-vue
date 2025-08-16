<script setup lang="ts">
import { ref } from "vue";
import { RouterLink } from "vue-router";
import { isLoggedIn } from "@/scripts/authentication/authState";
import { validateUrl } from "@/scripts/utility/text";

const originalUrl = ref<string>("");
const shortenedUrl = ref<string>("");
const isLoading = ref<boolean>(false);
const errorMessage = ref<string>("");

const shortenUrl = async (event: Event) => {
  event.preventDefault();

  if (!validateUrl(originalUrl.value)) {
    return (errorMessage.value = "Invalid URL / URI format.");
  }

  try {
    isLoading.value = true;
    errorMessage.value = "";

    const shortenResponse = await fetch("http://localhost:3000/shortenUrl/create", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        url: originalUrl.value
      }),
      credentials: "include"
    });

    if (shortenResponse.ok) {
      const shortenData = await shortenResponse.json();
      shortenedUrl.value = shortenData.shortenedUrl;
      originalUrl.value = "";
    } else {
      errorMessage.value = `Failed to shorten URL: ${shortenResponse.statusText}`;
      console.error("Failed to shorten url: ", shortenResponse.status);
    }
  } catch (error) {
    errorMessage.value = "Error connecting to server";
    console.error("Error shortening url: ", error);
  } finally {
    isLoading.value = false;
  }
};

const copyToClipboard = () => {
  if (shortenedUrl.value) {
    navigator.clipboard
      .writeText("http://localhost:3000/r/" + shortenedUrl.value)
      .catch((error) => {
        console.error("Failed to copy to clipboard: ", error);
      });
  }
};
</script>

<template>
  <div class="shorten--container">
    <h1>Shorten</h1>
    <div>
      <form v-if="isLoggedIn === true" @submit="shortenUrl">
        <label for="originalUrl">URL</label>
        <input
          type="text"
          id="originalUrl"
          name="originalUrl"
          placeholder="https://fos.hu/"
          v-model="originalUrl"
          required
        />

        <button type="submit" :disabled="isLoading">
          {{ isLoading ? "Shortening..." : "Shorten" }}
        </button>
      </form>

      <div v-else class="login-notification-container">
        <p class="login-text">
          Sorry, currently only logged-in users can shorten links. This will change in the future.
        </p>
        <p class="login-text">
          <RouterLink class="login-link" to="/register">Create a new account</RouterLink> or
          <RouterLink class="login-link" to="/login">Log in</RouterLink>
        </p>
      </div>

      <div v-if="errorMessage" class="error-message">
        {{ errorMessage }}
      </div>

      <div v-if="shortenedUrl" class="result-container">
        <h3>Shortened URL:</h3>
        <p class="shortened-url">
          <a :href="'http://localhost:3000/r/' + shortenedUrl" target="_blank">
            {{ "http://localhost:3000/r/" + shortenedUrl }}
          </a>
        </p>
        <button class="copy-button" @click="copyToClipboard">Copy to clipboard</button>
      </div>
    </div>
  </div>
</template>

<style scoped lang="css">
.shorten--container {
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

button:hover:not(:disabled) {
  background-color: #0056b3;
  transform: scale(1.05);
}

button:active:not(:disabled) {
  background-color: #004085;
  transform: scale(1);
}

button:disabled {
  background-color: #cccccc;
  cursor: not-allowed;
}

.login-notification-container {
  margin-top: 20px;
  padding: 15px;
  border-radius: 5px;
  background-color: #222222;
  text-align: center;
}

.login-text {
  font-size: 1.2em;
  margin: 10px 0;
  word-break: break-all;
}

.login-link {
  color: #007bff;
  text-decoration: none;
}

.result-container {
  margin-top: 20px;
  padding: 15px;
  border-radius: 5px;
  background-color: #222222;
  text-align: center;
}

.shortened-url {
  font-size: 1.2em;
  margin: 10px 0;
  word-break: break-all;
}

.shortened-url a {
  color: #007bff;
  text-decoration: none;
}

.shortened-url a:hover {
  text-decoration: underline;
}

.copy-button {
  margin-top: 10px;
  background-color: #28a745;
}

.copy-button:hover {
  background-color: #218838;
}

.error-message {
  color: #dc3545;
  margin-top: 10px;
  text-align: center;
}
</style>
