<script setup lang="ts">
import { provide } from 'vue'
import { RouterView } from 'vue-router'
import NavbarItem from './components/NavbarItem.vue'
import FooterItem from './components/FooterItem.vue'
import { isLoggedIn, userEmail } from '@/states/loginState'

provide('isLoggedIn', isLoggedIn)
provide('userEmail', userEmail)
</script>

<template>
  <div class="app-container">
    <NavbarItem />
    <div class="content">
      <RouterView />
    </div>
    <FooterItem />
  </div>
</template>

<style scoped>
@import './assets/main.css';
</style>
