<script lang="ts" setup>
import { ref, onMounted, watch } from 'vue'
import { isLoggedIn } from '@/states/loginState'

const username = ref('')
const email = ref('')
const password = ref('')
const registerStatus = ref('')

const checkAuthCookie = () => {
  const cookies = document.cookie.split('; ')
  const authCookie = cookies.find((cookie) => cookie.startsWith('VB-AUTH='))
  if (authCookie) {
    registerStatus.value = 'success'
    isLoggedIn.value = true
  }
}

const handleSubmit = async (event: Event) => {
  event.preventDefault()

  try {
    const response = await fetch('http://localhost:3000/auth/register', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        username: username.value,
        email: email.value,
        password: password.value
      })
    })

    switch (response.status) {
      case 200:
        const data = await response.json()
        console.log('Response data: ', data)
        registerStatus.value = 'success'
        break
      case 400:
        registerStatus.value = 'username-exists'
        break
      default:
        throw new Error(`HTTP error! status: ${response.status}`)
    }
  } catch (error) {
    console.error('Error while trying to register user: ', error)
    registerStatus.value = 'error'
  }
}

onMounted(() => {
  checkAuthCookie()
})

watch(isLoggedIn, (newVal) => {
  if (!newVal) {
    registerStatus.value = ''
  }
})
</script>

<template>
  <div class="register--container">
    <h1>Register</h1>
    <div>
      <form @submit="handleSubmit">
        <label for="email">Email</label>
        <input type="email" id="email" name="email" v-model="email" />

        <label for="username">Username</label>
        <input type="text" id="username" name="username" v-model="username" />

        <label for="password">Password</label>
        <input type="password" id="password" name="password" v-model="password" />

        <label for="confirm-password">Password</label>
        <input type="password" id="confirm-password" name="confirm-password" />

        <label for="autologin">Log me in automatically after registration</label>
        <input type="checkbox" id="autologin" name="autologin" checked />

        <button type="submit">Login</button>
      </form>
    </div>
  </div>
</template>

<style lang="css" scoped></style>
