<script setup lang="ts">
import { RouterView } from 'vue-router'
import NavbarItem from './components/NavbarItem.vue'
import FooterItem from './components/FooterItem.vue'
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

.app-container {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
}

.content {
  flex: 1;
  margin: 20px 12%;
  position: relative;
  z-index: 1;
}
</style>
