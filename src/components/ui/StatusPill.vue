<script setup lang="ts">
/**
 * The badge pill: a 2px pill in condensed uppercase, with an optional icon. `ok` is Confirm Wash
 * in Signal Forest, `danger` the Fault Red wash in Fault Red, `muted` sunk enamel in Soft Ink.
 */
import AppIcon, { type IconName } from "./AppIcon.vue";

withDefaults(defineProps<{ tone?: "ok" | "danger" | "muted"; icon?: IconName }>(), {
  tone: "muted",
  icon: undefined
});
</script>

<template>
  <span class="pill" :class="`pill--${tone}`">
    <AppIcon v-if="icon" :name="icon" :size="14" />
    <slot />
  </span>
</template>

<style scoped>
.pill {
  display: inline-flex;
  align-items: center;
  gap: var(--sp-1);
  padding: 0.125rem var(--sp-2);
  border: var(--edge) solid currentColor;
  border-radius: 999px;
  font-family: var(--font-board);
  font-size: 0.9375rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  white-space: nowrap;
  vertical-align: middle;
}

.pill--ok {
  background: var(--c-ok-wash);
  color: var(--c-action);
}

.pill--danger {
  background: var(--c-danger-wash);
  color: var(--c-danger);
}

.pill--muted {
  background: var(--c-panel-sunk);
  color: var(--c-ink-soft);
}
</style>
