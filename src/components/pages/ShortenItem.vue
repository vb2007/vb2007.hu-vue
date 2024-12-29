<template>
  <div class="shorten-container">
    <h1>URL Shortener</h1>
    <input v-model="longUrl" placeholder="Enter URL here" />
    <button @click="shortenUrl">Shorten</button>
    <div v-if="shortUrl">
      <p>
        Shortened URL: <a :href="shortUrl" target="_blank">{{ shortUrl }}</a>
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import axios from 'axios'

const longUrl = ref('')
const shortUrl = ref('')

const shortenUrl = async () => {
  try {
    const response = await axios.post('endpoint', { url: longUrl.value })
    shortUrl.value = response.data.shortUrl
  } catch (error) {
    console.error(`Error while trying to shorten URL: ${error}`)
  }
}
</script>
