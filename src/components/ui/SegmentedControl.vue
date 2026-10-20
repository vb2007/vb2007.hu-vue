<script setup lang="ts" generic="T extends string">
import { useId } from "vue";
import AppIcon, { type IconName } from "./AppIcon.vue";

export interface Segment<V extends string> {
  value: V;
  label: string;
  icon?: IconName;
}

/** A radio group drawn as joined keys: one choice at a time, arrow keys move between them. */
defineProps<{ legend: string; options: Segment<T>[]; size?: "md" | "sm"; hideLegend?: boolean }>();
const model = defineModel<T>({ required: true });
const name = useId();
</script>

<template>
  <fieldset class="segments" :class="`segments--${size ?? 'md'}`">
    <legend class="segments__legend" :class="{ 'visually-hidden': hideLegend }">
      {{ legend }}
    </legend>
    <div class="segments__row">
      <label v-for="option in options" :key="option.value" class="segment">
        <input
          v-model="model"
          class="segment__input"
          type="radio"
          :name="name"
          :value="option.value"
        />
        <span class="segment__key">
          <AppIcon v-if="option.icon" :name="option.icon" :size="size === 'sm' ? 16 : 18" />
          {{ option.label }}
        </span>
      </label>
    </div>
  </fieldset>
</template>

<style scoped>
.segments {
  display: grid;
  gap: var(--sp-2);
  min-width: 0;
  margin: 0;
  padding: 0;
  border: 0;
}

.segments__legend {
  padding: 0;
  margin-bottom: var(--sp-2);
  font-size: var(--fs-sm);
  font-weight: 600;
  letter-spacing: 0.02em;
}

.segments__row {
  display: flex;
  border: var(--edge) solid var(--c-edge);
  border-radius: var(--radius-sm);
  background: var(--c-panel-sunk);
  box-shadow: 0 0.1875rem 0 var(--c-edge);
}

.segment {
  position: relative;
  display: flex;
  /* Share the width, but never squeeze a label against its edges. */
  flex: 1 1 auto;
}

.segment + .segment {
  border-left: var(--edge) solid var(--c-edge);
}

.segment__input {
  position: absolute;
  opacity: 0;
  width: 1px;
  height: 1px;
}

.segment__key {
  display: inline-flex;
  flex: 1;
  align-items: center;
  justify-content: center;
  gap: var(--sp-2);
  min-height: 2.625rem;
  padding: 0 var(--sp-3);
  font-family: var(--font-board);
  font-size: 1.125rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  white-space: nowrap;
  color: var(--c-ink-soft);
  cursor: pointer;
  transition:
    background-color var(--dur-quick) ease,
    color var(--dur-quick) ease;
}

.segment__key svg {
  flex: none;
}

.segments--sm .segment__key {
  min-height: 2.125rem;
  font-size: 1.0625rem;
}

.segment:first-child .segment__key {
  border-radius: calc(var(--radius-sm) - var(--edge)) 0 0 calc(var(--radius-sm) - var(--edge));
}

.segment:last-child .segment__key {
  border-radius: 0 calc(var(--radius-sm) - var(--edge)) calc(var(--radius-sm) - var(--edge)) 0;
}

.segment:hover .segment__key {
  background: var(--c-panel);
  color: var(--c-ink);
}

/* The chosen key is pressed in: Signal Forest, like the current stop. */
.segment__input:checked + .segment__key {
  background: var(--c-action);
  color: var(--c-on-action);
}

.segment__input:focus-visible + .segment__key {
  outline: 3px solid var(--c-line);
  outline-offset: 3px;
  position: relative;
  z-index: 1;
}
</style>
