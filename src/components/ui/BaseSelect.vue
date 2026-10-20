<script setup lang="ts" generic="T extends string">
import { useId } from "vue";
import AppIcon from "./AppIcon.vue";

defineProps<{ label: string; options: { value: T; label: string }[]; size?: "md" | "sm" }>();
const model = defineModel<T>({ required: true });
const id = useId();
</script>

<template>
  <div class="field" :class="`field--${size ?? 'md'}`">
    <label class="field__label" :for="id">{{ label }}</label>
    <div class="field__control">
      <select :id="id" v-model="model" class="field__select">
        <option v-for="option in options" :key="option.value" :value="option.value">
          {{ option.label }}
        </option>
      </select>
      <AppIcon name="chevron" :size="18" />
    </div>
  </div>
</template>

<style scoped>
.field {
  display: grid;
  gap: var(--sp-2);
}

.field__label {
  font-weight: 600;
  font-size: var(--fs-sm);
  letter-spacing: 0.02em;
}

.field__control {
  position: relative;
  display: grid;
  align-items: center;
}

.field__control svg {
  position: absolute;
  right: var(--sp-3);
  pointer-events: none;
}

.field__select {
  width: 100%;
  min-height: 2.875rem;
  padding: 0 calc(var(--sp-4) + 1.5rem) 0 var(--sp-4);
  border: var(--edge) solid var(--c-edge);
  border-radius: var(--radius-sm);
  background: var(--c-panel-sunk);
  color: var(--c-ink);
  appearance: none;
  cursor: pointer;
  transition:
    border-color var(--dur-quick) ease,
    box-shadow var(--dur-base) var(--ease-out),
    background-color var(--dur-quick) ease;
}

.field--sm .field__select {
  min-height: 2.375rem;
}

.field__select:hover {
  background: var(--c-panel);
}

.field__select:focus {
  outline: none;
  background: var(--c-panel);
  border-color: var(--c-action);
  box-shadow: 0 0 0 4px color-mix(in oklch, var(--c-line) 45%, transparent);
}
</style>
