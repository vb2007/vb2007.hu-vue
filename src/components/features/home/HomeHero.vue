<script setup lang="ts">
import ShortenPanel from "@/components/features/shorten/ShortenPanel.vue";
</script>

<template>
  <div class="hero">
    <div class="hero__copy">
      <h1 class="hero__title">Welcome home</h1>
      <p class="hero__lead">Meet a feature-rich site with tools for your various needs!</p>
    </div>
    <div class="hero__tool">
      <ShortenPanel />
    </div>
  </div>
</template>

<style scoped>
.hero {
  display: grid;
  gap: var(--sp-6);
  align-items: center;
}

.hero__title {
  font-size: clamp(3rem, 1.5rem + 7vw, 6rem);
  line-height: 0.92;
  letter-spacing: -0.005em;
}

.hero__lead {
  margin-top: var(--sp-5);
  font-size: var(--fs-md);
  line-height: 1.4;
  max-width: 24ch;
}

.hero__tool {
  animation: arrive var(--dur-slow) var(--ease-out) 200ms backwards;
}

@media (min-width: 62rem) {
  .hero {
    grid-template-columns: 1.05fr 1fr;
    gap: var(--sp-8);
  }
}

@keyframes arrive {
  from {
    opacity: 0;
    transform: translateY(1.25rem);
  }
}
</style>
