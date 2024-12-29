<script setup>
import { createRouter, createWebHistory } from 'vue-router'
import NavbarItem from './components/NavbarItem.vue'
import WelcomeItem from './components/WelcomeItem.vue'
import FooterItem from './components/FooterItem.vue'
import ShortenItem from './components/pages/ShortenItem.vue'

const routes = [
  { path: '/', component: WelcomeItem },
  { path: '/shorten', component: ShortenItem }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})
</script>

<template>
  <div class="app-container">
    <NavbarItem />
    <div class="content">
      <WelcomeItem />
    </div>
    <FooterItem />
  </div>
</template>

<style scoped>
@import './assets/main.css';

.app-container {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
}

.content {
  flex: 1;
}
</style>
