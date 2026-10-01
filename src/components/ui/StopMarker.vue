<script setup lang="ts">
import type { StopStatus } from "@/constants/stops";

defineProps<{ status: StopStatus; current?: boolean }>();
</script>

<template>
  <span
    class="marker"
    :class="[`marker--${status}`, { 'marker--here': current }]"
    aria-hidden="true"
  />
</template>

<style scoped>
.marker {
  position: relative;
  flex: none;
  width: 1.125rem;
  height: 1.125rem;
  border: 4px solid var(--c-line);
  border-radius: 50%;
  background: var(--marker-bg, var(--c-panel));
  transition:
    transform var(--dur-base) var(--ease-out),
    background-color var(--dur-quick) ease;
}

.marker--planned {
  border: 3px dashed var(--c-ink-soft);
}

.marker--here {
  background: var(--c-action);
  border-color: var(--c-action);
  transform: scale(1.2);
}

.marker--here::after {
  content: "";
  position: absolute;
  inset: -0.5rem;
  border: 2px solid var(--c-line);
  border-radius: 50%;
  animation: here 2.4s var(--ease-out) infinite;
}

@keyframes here {
  from {
    transform: scale(0.55);
    opacity: 0.9;
  }
  to {
    transform: scale(1.15);
    opacity: 0;
  }
}
</style>
