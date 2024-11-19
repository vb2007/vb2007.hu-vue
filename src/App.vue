<script setup lang="ts">
import NavbarItem from './components/NavbarItem.vue'
import FooterItem from './components/FooterItem.vue'
</script>

<template>
  <NavbarItem />

  <FooterItem />
</template>

<style scoped>
header {
  line-height: 1.5;
}

.logo {
  display: block;
  margin: 0 auto 2rem;
}

:deep(body) {
  position: relative;
  min-height: 100vh;
  padding-bottom: 60px; /* Same as footer height */
}

@media (min-width: 1024px) {
  header {
    display: flex;
    place-items: center;
    padding-right: calc(var(--section-gap) / 2);
  }

  .logo {
    margin: 0 2rem 0 0;
  }

  header .wrapper {
    display: flex;
    place-items: flex-start;
    flex-wrap: wrap;
  }
}
</style>
