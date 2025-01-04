<script setup lang="ts">
import { onMounted } from 'vue'
import { RouterLink } from 'vue-router'
import navbarDrodownLight from '../assets/navbarDropdownLight.svg'
import { isLoggedIn, userEmail } from '@/scripts/authentication/authState'

const checkAuthCookie = () => {
  const cookies = document.cookie.split('; ')
  const authCookie = cookies.find((cookie) => cookie.startsWith('VB-AUTH='))
  if (authCookie) {
    isLoggedIn.value = true
    fetchUserDetails()
  }
}

const fetchUserDetails = async () => {
  try {
    const response = await fetch('http://localhost:3000/user', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      },
      credentials: 'include'
    })

    if (response.ok) {
      const data = await response.json()
      userEmail.value = data.email
    } else {
      console.error('Failed to fetch user details')
    }
  } catch (error) {
    console.error('Error fetching user details:', error)
  }
}

const handleLogout = () => {
  document.cookie = 'VB-AUTH=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;'
  userEmail.value = ''
  isLoggedIn.value = false
}

onMounted(() => {
  checkAuthCookie()
})
</script>

<template>
  <nav>
    <div class="nav--box">
      <a class="nav--title" href="/index.html">vb2007.hu</a>
      <button class="nav--toggler">
        <img
          :src="navbarDrodownLight"
          alt="Navbar dropdown menu toggler"
          class="nav--toggler-icon"
        />
      </button>
      <div class="nav--collapse">
        <ul class="nav--list">
          <li id="nav--home" class="nav--item">
            <RouterLink to="/" class="nav--link">Home</RouterLink>
          </li>
          <li class="nav--item">
            <RouterLink to="/shorten" class="nav--link">Shorten</RouterLink>
          </li>
          <li class="nav--item">
            <RouterLink to="/pastebin" class="nav--link">Pastebin</RouterLink>
          </li>
          <li class="nav--item">
            <RouterLink to="/upload" class="nav--link">Upload</RouterLink>
          </li>
          <li class="nav--item">
            <RouterLink to="/contact" class="nav--link">Contact</RouterLink>
          </li>
        </ul>
        <ul v-if="isLoggedIn" class="nav--list">
          <li class="nav--item">
            <span class="nav--link">{{ userEmail }}</span>
          </li>
          <li class="nav--item nav--item-button">
            <button @click="handleLogout" class="nav--link nav--button">Logout</button>
          </li>
        </ul>
        <ul v-else class="nav--list">
          <li class="nav--item nav--item-button">
            <RouterLink to="/login" class="nav--link nav--button">Login</RouterLink>
          </li>
          <li class="nav--item nav--item-button">
            <RouterLink to="/register" class="nav--link nav--button">Register</RouterLink>
          </li>
        </ul>
      </div>
    </div>
  </nav>
</template>

<style scoped>
nav {
  position: relative;
  top: 0;
  background-color: rgba(219, 219, 219, 0.8);
  box-shadow: 0 2px 10px rgb(253, 251, 251);
  border-radius: 0 0 15px 15px;
  z-index: 1000;
  margin: 0 12%;
  font-family: Inter, sans-serif;
}

.nav--box {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 20px;
}

.nav--title {
  margin-right: 8%;
  font-size: 1.5rem;
  font-weight: bold;
  text-decoration: none;
  color: #333;
  transition: 0.3s;
}

.nav--title:hover {
  color: #0056b3;
  transition: 0.3s;
}

.nav--collapse {
  display: flex;
  align-items: center;
  flex-grow: 1;
  justify-content: space-between;
  height: auto;
}

.nav--list {
  display: flex;
  list-style: none;
  padding: 0;
  margin: 0;
}

.nav--item {
  /* space between the items */
  margin-right: 20px;
}

.nav--link {
  text-decoration: none;
  color: #333;
  font-size: 1rem;
  transition: 0.3s;
}

.nav--link:hover {
  color: #007bff;
  font-weight: 400;
  text-decoration: dotted;
  transition: 0.3s;
}

.nav--buttons {
  display: flex;
  gap: 10px;
  margin-left: auto;
}

.nav--button {
  background-color: #007bff;
  color: white;
  border-color: #ffffff00;
  border-style: solid;
  border-width: 2px;
  padding: 10px 15px;
  border: none;
  border-radius: 25px;
  text-align: center;
  cursor: pointer;
  transition: background-color 0.3s;
}

.nav--button--disabled {
  background-color: #ffffff;
  color: black;
  border-color: #007bff;
  border-style: solid;
  border-width: 2px;
  padding: 10px 15px;
  border-radius: 25px;
  text-align: center;
  cursor: pointer;
  transition: background-color 0.3s;
}

.nav--button:hover {
  color: white;
  background-color: #0056b3;
  cursor: crosshair;
  transition: 0.3s;
}

.nav--button--disabled:hover {
  color: black;
  background-color: #b4b4b4;
  cursor: crosshair;
  transition: 0.3s;
}

.nav--toggler {
  background: transparent;
  border: none;
  cursor: pointer;
  display: none;
}

.nav--toggler-icon {
  font-size: 1.5rem;
}

@media screen and (max-width: 990px) {
  .nav--box {
    flex-wrap: wrap;
  }

  .nav--toggler {
    display: block;
  }

  .nav--collapse {
    position: absolute;
    top: 100%;
    left: 0;
    width: 100%;
    background-color: rgba(219, 219, 219, 0.95);
    z-index: 1001;
    box-shadow: 0 2px 10px rgb(253, 251, 251);
    border-radius: 15px;
    padding: 10px;
    flex-direction: column;
    align-items: flex-start;
    max-height: 0;
    overflow: hidden;
    transition: all 0.3s ease-in-out;
    opacity: 0;
    visibility: hidden;
    transform: translateY(-10px);

    margin-top: 20px;
  }

  .nav--collapse.show {
    max-height: 500px;
    opacity: 1;
    visibility: visible;
    transform: translateY(0);
  }

  .nav--list {
    flex-direction: column;
    width: 100%;
  }

  .nav--item {
    margin-right: 0;
    margin-bottom: 10px;
    width: 100%;
  }

  .nav--link {
    display: block;
    padding: 10px 0;
  }
}
</style>
