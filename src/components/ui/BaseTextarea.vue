<script setup lang="ts">
import { computed, useId } from "vue";

const props = defineProps<{
  label: string;
  placeholder?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  mono?: boolean;
  rows?: number;
  /** Shows a live "used / max" character count. Not enforced: the parent validates. */
  maxCount?: number;
}>();

const model = defineModel<string>({ default: "" });

const id = useId();
const describedBy = computed(() => {
  const ids = [];
  if (props.hint) ids.push(`${id}-hint`);
  if (props.error) ids.push(`${id}-error`);
  return ids.join(" ") || undefined;
});
const isOverCount = computed(() => !!props.maxCount && model.value.length > props.maxCount);
</script>

<template>
  <div class="field" :class="{ 'field--invalid': error }">
    <div class="field__top">
      <label class="field__label" :for="id">{{ label }}</label>
      <span v-if="maxCount" class="field__count" :class="{ 'field__count--over': isOverCount }">
        {{ model.length }} / {{ maxCount }}
      </span>
    </div>
    <textarea
      :id="id"
      v-model="model"
      class="field__input"
      :class="{ 'field__input--mono': mono }"
      :rows="rows ?? 8"
      :placeholder="placeholder"
      :required="required"
      :aria-invalid="error ? true : undefined"
      :aria-describedby="describedBy"
    />
    <p v-if="hint" :id="`${id}-hint`" class="field__hint">{{ hint }}</p>
    <p v-if="error" :id="`${id}-error`" class="field__error">{{ error }}</p>
  </div>
</template>

<style scoped>
.field {
  display: grid;
  gap: var(--sp-2);
}

.field__top {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--sp-3);
}

.field__label {
  font-weight: 600;
  font-size: var(--fs-sm);
  letter-spacing: 0.02em;
}

.field__count {
  font-family: var(--font-code);
  font-size: var(--fs-sm);
  color: var(--c-ink-soft);
  font-variant-numeric: tabular-nums;
}

.field__count--over {
  font-weight: 600;
  color: var(--c-danger);
}

.field__input {
  width: 100%;
  min-height: 10rem;
  padding: var(--sp-3) var(--sp-4);
  border: var(--edge) solid var(--c-edge);
  border-radius: var(--radius-sm);
  background: var(--c-panel-sunk);
  color: var(--c-ink);
  line-height: 1.5;
  resize: vertical;
  transition:
    border-color var(--dur-quick) ease,
    box-shadow var(--dur-base) var(--ease-out),
    background-color var(--dur-quick) ease;
}

.field__input--mono {
  font-family: var(--font-code);
  font-size: 0.95rem;
}

.field__input::placeholder {
  color: var(--c-ink-soft);
  opacity: 0.75;
}

.field__input:hover {
  background: var(--c-panel);
}

.field__input:focus {
  outline: none;
  background: var(--c-panel);
  border-color: var(--c-action);
  box-shadow: 0 0 0 4px color-mix(in oklch, var(--c-line) 45%, transparent);
}

.field--invalid .field__input {
  border-color: var(--c-danger);
}

.field__hint {
  font-size: var(--fs-sm);
  color: var(--c-ink-soft);
}

.field__error {
  font-size: var(--fs-sm);
  font-weight: 600;
  color: var(--c-danger);
}
</style>
