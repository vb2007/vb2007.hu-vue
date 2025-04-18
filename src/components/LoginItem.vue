<script lang="ts" setup>
import { ref, onMounted, watch } from 'vue'
import { isLoggedIn, userEmail } from '@/states/loginState'

const email = ref('')
const password = ref('')
const loginStatus = ref('')

const checkAuthCookie = () => {
  const cookies = document.cookie.split('; ')
  const authCookie = cookies.find((cookie) => cookie.startsWith('VB-AUTH='))
  if (authCookie) {
    loginStatus.value = 'success'
    isLoggedIn.value = true
  }
}

const handleSubmit = async (event: Event) => {
  event.preventDefault()

  try {
    const response = await fetch('http://localhost:3000/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email: email.value,
        password: password.value
      })
    })

    switch (response.status) {
      case 200:
        const data = await response.json()
        console.log('Response data:', data)
        document.cookie = `VB-AUTH=${data.authentication.sessionToken}; path=/`
        loginStatus.value = 'success'
        isLoggedIn.value = true
        userEmail.value = data.email
        break
      case 400:
        loginStatus.value = 'user-not-found'
        break
      case 403:
        loginStatus.value = 'incorrect-password'
        break
      default:
        throw new Error(`HTTP error! status: ${response.status}`)
    }
  } catch (error) {
    console.error('Error:', error)
    loginStatus.value = 'error'
  }
}

onMounted(() => {
  checkAuthCookie()
})

watch(isLoggedIn, (newVal) => {
  if (!newVal) {
    loginStatus.value = ''
  }
})
</script>

<template>
  <div class="login--container">
    <h1>Login</h1>
    <div v-if="loginStatus === 'success'">
      <p>Login successful!</p>
    </div>
    <div v-else>
      <form @submit="handleSubmit">
        <label for="email">Email</label>
        <input type="email" id="email" name="email" v-model="email" />
        <label for="password">Password</label>
        <input type="password" id="password" name="password" v-model="password" />
        <button type="submit">Login</button>
      </form>
    </div>
    <div v-if="loginStatus === 'user-not-found'">
      <p>User with that email address doesn't exists.</p>
    </div>
    <div v-if="loginStatus === 'incorrect-password'">
      <p>Incorrect password. Please try again.</p>
    </div>
    <div v-if="loginStatus === 'error'">
      <p>Login failed. Please try again.</p>
    </div>
  </div>
</template>

<style lang="css" scoped>
.login--container {
  display: flex;
  flex-direction: column;
  height: auto;
  gap: 20px;
  align-items: center;
  /* background-color: #f9f9f9; */
  padding: 40px;
  border-radius: 10px;
  /* box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1); */
}

h1 {
  color: #333;
  font-size: 2em;
}

form {
  width: 100%;
  max-width: 400px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

input {
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
