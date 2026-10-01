<script setup lang="ts">
withDefaults(defineProps<{ title: string; as?: "h1" | "h2" | "h3" }>(), { as: "h2" });
</script>

<template>
  <section class="board">
    <header class="board__head">
      <component :is="as" class="board__title">{{ title }}</component>
      <div v-if="$slots.aside" class="board__aside"><slot name="aside" /></div>
    </header>
    <div class="board__body"><slot /></div>
  </section>
</template>

<style scoped>
.board {
  overflow: hidden;
  border: var(--edge) solid var(--c-edge);
  border-radius: var(--radius-lg);
  background: var(--c-panel);
  box-shadow:
    inset 0 2px 0 light-dark(oklch(1 0 0 / 0.75), oklch(1 0 0 / 0.08)),
    var(--shadow-panel);
}

.board__head {
  position: relative;
  display: flex;
  padding-bottom: calc(var(--sp-3) + 0.4rem);
  align-items: center;
  justify-content: space-between;
  gap: var(--sp-4);
  padding: var(--sp-3) var(--sp-5);
  background: linear-gradient(to bottom, oklch(1 0 0 / 0.16), transparent 60%), var(--c-action);
  color: var(--c-on-action);
}

/* Kerb stripe under the header, the same hatch that marks planned stops */
.board__head::after {
  content: "";
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 0.4rem;
  background: repeating-linear-gradient(-45deg, var(--c-works) 0 7px, var(--c-on-works) 7px 14px);
}

.board__title {
  font-size: var(--fs-lg);
  line-height: 1.1;
  text-transform: uppercase;
}

.board__body {
  display: grid;
  gap: var(--sp-5);
  padding: var(--sp-5);
}

@media (min-width: 40rem) {
  .board__body {
    padding: var(--sp-6);
  }
}
</style>
