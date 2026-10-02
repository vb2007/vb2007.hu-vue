<script setup lang="ts">
import AppIcon from "./AppIcon.vue";

defineProps<{ tone: "success" | "error" | "info" }>();
</script>

<template>
  <div class="status" :class="`status--${tone}`" :role="tone === 'error' ? 'alert' : 'status'">
    <AppIcon
      :name="tone === 'success' ? 'check' : tone === 'error' ? 'alert' : 'info'"
      :size="22"
    />
    <p class="status__text"><slot /></p>
  </div>
</template>

<style scoped>
.status {
  display: flex;
  align-items: flex-start;
  gap: var(--sp-3);
  padding: var(--sp-3) var(--sp-4);
  border: var(--edge) solid currentColor;
  border-radius: var(--radius-sm);
  font-weight: 500;
  animation: arrive var(--dur-base) var(--ease-out);
}

.status svg {
  flex: none;
  margin-top: 0.15rem;
}

.status__text {
  max-width: none;
  color: var(--c-ink);
}

.status--success {
  background: var(--c-ok-wash);
  color: var(--c-action);
}

.status--error {
  background: var(--c-danger-wash);
  color: var(--c-danger);
}

.status--info {
  background: var(--c-panel-sunk);
  color: var(--c-ink-soft);
}

@keyframes arrive {
  from {
    opacity: 0;
    transform: translateY(-6px);
  }
}
</style>
