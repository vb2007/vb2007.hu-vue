<script setup lang="ts">
import { useId } from "vue";
import AppIcon from "./AppIcon.vue";

defineProps<{ label: string }>();
const model = defineModel<boolean>({ default: false });
const id = useId();
</script>

<template>
  <label class="check" :for="id">
    <input :id="id" v-model="model" class="check__input" type="checkbox" />
    <span class="check__box"><AppIcon name="check" :size="16" /></span>
    <span class="check__label">{{ label }}</span>
  </label>
</template>

<style scoped>
.check {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  cursor: pointer;
  font-size: var(--fs-sm);
}

.check__input {
  position: absolute;
  opacity: 0;
  width: 1px;
  height: 1px;
}

.check__box {
  display: grid;
  place-items: center;
  flex: none;
  width: 1.5rem;
  height: 1.5rem;
  border: var(--edge) solid var(--c-edge);
  border-radius: 0.375rem;
  background: var(--c-panel-sunk);
  color: transparent;
  transition:
    background-color var(--dur-quick) ease,
    color var(--dur-quick) ease,
    transform var(--dur-quick) var(--ease-out);
}

.check:hover .check__box {
  transform: translateY(-1px);
}

.check__input:checked + .check__box {
  background: var(--c-action);
  border-color: var(--c-action);
  color: var(--c-on-action);
}

.check__input:focus-visible + .check__box {
  outline: 3px solid var(--c-line);
  outline-offset: 3px;
}
</style>
