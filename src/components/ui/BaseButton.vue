<script setup lang="ts">
import { RouterLink, type RouteLocationRaw } from "vue-router";

withDefaults(
  defineProps<{
    variant?: "primary" | "secondary" | "ghost";
    size?: "md" | "sm";
    /** A path, or a full location, e.g. with history state for the page it opens. */
    to?: RouteLocationRaw;
    href?: string;
    type?: "button" | "submit";
    loading?: boolean;
    disabled?: boolean;
    /**
     * Looks disabled but stays focusable and clickable, e.g. a submit key while the form has a
     * problem: pressing it shows what's missing, which a disabled key couldn't.
     */
    blocked?: boolean;
    error?: boolean;
    block?: boolean;
  }>(),
  { variant: "primary", size: "md", type: "button" }
);
</script>

<template>
  <component
    :is="to ? RouterLink : href ? 'a' : 'button'"
    v-bind="to ? { to } : href ? { href } : { type, disabled: disabled || loading }"
    class="btn"
    :class="[
      `btn--${variant}`,
      `btn--${size}`,
      {
        'btn--block': block,
        'btn--blocked': blocked,
        'btn--loading': loading,
        'btn--error': error
      }
    ]"
    :aria-disabled="(blocked && !to && !href) || undefined"
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
  /* The label stays on one line wherever it fits: a key never shrinks below it in a flex row or a
     grid track. Only in a narrower container does the key take the container's width, and the label
     wraps, within a word too if one alone is wider (a long host). */
  min-width: fit-content;
  max-width: 100%;
  min-height: 2.875rem;
  padding: var(--sp-2) var(--sp-5);
  border: var(--edge) solid transparent;
  border-radius: var(--radius-sm);
  background: var(--btn-bg);
  color: var(--btn-fg);
  font-family: var(--font-board);
  font-size: 1.25rem;
  font-weight: 700;
  line-height: 1.15;
  letter-spacing: 0.04em;
  text-align: center;
  text-transform: uppercase;
  text-decoration: none;
  text-wrap: balance;
  overflow-wrap: anywhere;
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
  padding: var(--sp-1) var(--sp-4);
  font-size: 1.0625rem;
  line-height: 1.2;
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

.btn:hover:not(:disabled, .btn--blocked) {
  transform: translateY(-2px);
  box-shadow: 0 calc(var(--lift) + 2px) 0 var(--btn-depth);
}

.btn--ghost:hover:not(:disabled, .btn--blocked) {
  transform: none;
  background: var(--c-field-deep);
}

.btn:active:not(:disabled, .btn--blocked) {
  transform: translateY(var(--lift));
  box-shadow: 0 0 0 var(--btn-depth);
  transition-duration: 60ms;
}

.btn--ghost:active:not(:disabled, .btn--blocked) {
  transform: translateY(1px);
}

.btn:disabled,
.btn--blocked {
  --btn-bg: var(--c-panel-sunk);
  --btn-fg: var(--c-ink-soft);
  --btn-depth: var(--c-hairline);
  border-color: var(--c-hairline);
  cursor: not-allowed;
}

.btn__label {
  display: inline;
}

/* The icon is part of the text, so it stays with the first line when the label wraps. Its margin,
   less the space after it (about 0.19em in the label face, plus the letter spacing), leaves the 0.5rem
   gap; the negative block margins keep it from growing the line, and the nudge centres it on the
   capitals' line. */
.btn__label > :deep(svg) {
  display: inline-block;
  position: relative;
  top: -0.13em;
  margin-block: -1em;
  margin-right: calc(var(--sp-2) - 0.23em);
  vertical-align: middle;
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
