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
</style>
