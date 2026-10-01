<script setup lang="ts">
withDefaults(defineProps<{ width?: "wide" | "narrow" }>(), { width: "wide" });
</script>

<template>
  <section class="page" :class="`page--${width}`">
    <slot />
  </section>
</template>

<style scoped>
.page {
  width: 100%;
  margin: 0 auto;
  padding: var(--sp-7) var(--page-gutter) 0;
}

.page--wide {
  max-width: var(--page-max);
}

.page--narrow {
  max-width: 34rem;
}
</style>
