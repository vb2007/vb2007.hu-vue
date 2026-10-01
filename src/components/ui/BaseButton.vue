<script setup lang="ts">
import { RouterLink } from "vue-router";

withDefaults(
  defineProps<{
    variant?: "primary" | "secondary" | "ghost";
    size?: "md" | "sm";
    to?: string;
    type?: "button" | "submit";
    loading?: boolean;
    disabled?: boolean;
    error?: boolean;
    block?: boolean;
  }>(),
  { variant: "primary", size: "md", type: "button" }
);
</script>

<template>
  <component
    :is="to ? RouterLink : 'button'"
    v-bind="to ? { to } : { type, disabled: disabled || loading }"
    class="btn"
    :class="[
      `btn--${variant}`,
      `btn--${size}`,
      { 'btn--block': block, 'btn--loading': loading, 'btn--error': error }
    ]"
    :aria-busy="loading || undefined"
  >
    <span class="btn__label"><slot /></span>
  </component>
</template>

<style scoped>
.btn {
  --btn-bg: var(--c-action);
  --btn-fg: var(--c-on-action);
  --btn-depth: var(--c-action-deep);
  --lift: 0.25rem;

  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--sp-2);
  min-height: 2.875rem;
  padding: 0 var(--sp-5);
  border: var(--edge) solid transparent;
  border-radius: var(--radius-sm);
  background: var(--btn-bg);
  color: var(--btn-fg);
  font-family: var(--font-board);
  font-size: 1.25rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  text-decoration: none;
  white-space: nowrap;
  cursor: pointer;
  box-shadow: 0 var(--lift) 0 var(--btn-depth);
  transform: translateY(0);
  transition:
    transform var(--dur-quick) var(--ease-out),
    box-shadow var(--dur-quick) var(--ease-out),
    background-color var(--dur-quick) ease;
}

.btn--sm {
  min-height: 2.25rem;
  padding: 0 var(--sp-4);
  font-size: 1.0625rem;
  --lift: 0.1875rem;
}

.btn--block {
  display: flex;
  width: 100%;
}

.btn--secondary {
  --btn-bg: var(--c-panel);
  --btn-fg: var(--c-ink);
  --btn-depth: var(--c-edge);
  border-color: var(--c-edge);
}

.btn--ghost {
  --btn-bg: transparent;
  --btn-fg: var(--c-ink);
  --btn-depth: transparent;
  box-shadow: none;
}

.btn:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 calc(var(--lift) + 2px) 0 var(--btn-depth);
}

.btn--ghost:hover:not(:disabled) {
  transform: none;
  background: var(--c-field-deep);
}

.btn:active:not(:disabled) {
  transform: translateY(var(--lift));
  box-shadow: 0 0 0 var(--btn-depth);
  transition-duration: 60ms;
}

.btn--ghost:active:not(:disabled) {
  transform: translateY(1px);
}

.btn:disabled {
  --btn-bg: var(--c-panel-sunk);
  --btn-fg: var(--c-ink-soft);
  --btn-depth: var(--c-hairline);
  border-color: var(--c-hairline);
  cursor: not-allowed;
}

.btn__label {
  display: inline-flex;
  align-items: center;
  gap: var(--sp-2);
}

.btn--loading {
  cursor: progress;
}

.btn--loading .btn__label::after {
  content: "";
  display: inline-block;
  width: 0.9em;
  height: 0.9em;
  margin-left: var(--sp-2);
  vertical-align: -0.1em;
  border: 2px solid currentColor;
  border-right-color: transparent;
  border-radius: 50%;
  animation: spin 700ms linear infinite;
}

.btn--error {
  animation: shake 360ms var(--ease-out);
  --btn-bg: var(--c-danger);
  --btn-fg: var(--c-panel);
  --btn-depth: color-mix(in oklch, var(--c-danger), black 35%);
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

@keyframes shake {
  20% {
    transform: translateX(-5px);
  }
  45% {
    transform: translateX(4px);
  }
  70% {
    transform: translateX(-2px);
  }
}
</style>
