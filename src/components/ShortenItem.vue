<script setup lang="ts">
import { ref } from "vue";
import { isLoggedIn } from "@/scripts/authentication/authState";

const originalUrl = ref<string>("");

const validateUrl = (originalUrl: string) => {
  try {
  } catch (error) {
    console.error("Error validating the url: ", error);
  }
};

const shortenUrl = async () => {
  try {
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
      return shortenData.url;
    } else {
      console.error("Failed to shorten url: ", shortenResponse.status);
    }
  } catch (error) {
    console.error("Error shortening url: ", error);
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
          placeholder="https://fos.hu"
          v-model="originalUrl"
          required
        />

        <button type="submit">Shorten</button>
      </form>
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

button:hover {
  background-color: #0056b3;
  transform: scale(1.05);
}

button:active {
  background-color: #004085;
  transform: scale(1);
}
</style>
