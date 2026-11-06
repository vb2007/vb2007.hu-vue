<script setup lang="ts">
/**
 * One row of the account page's Actions: a tile with its mark, the name, a note on what it does,
 * then its key (`#key`). A form or confirmation that opens in place goes in `#panel`, under the key
 * and stretched to the row's width, like the Account board's rows.
 */
import AppIcon, { type IconName } from "@/components/ui/AppIcon.vue";

defineProps<{ title: string; icon: IconName }>();
</script>

<template>
  <div class="action">
    <span class="action__mark"><AppIcon :name="icon" :size="26" /></span>
    <div class="action__main">
      <h3 class="action__name">{{ title }}</h3>
      <p class="action__note"><slot /></p>
      <div v-if="$slots.key" class="action__keys"><slot name="key" /></div>
      <slot name="panel" />
    </div>
  </div>
</template>

<style scoped>
.action {
  display: flex;
  align-items: flex-start;
  gap: var(--sp-4);
  padding: var(--sp-3) 0;
  border-bottom: var(--edge) solid var(--c-hairline);
}

.action__mark {
  flex: none;
  display: grid;
  place-items: center;
  width: 3.25rem;
  height: 3.25rem;
  border: var(--edge) solid var(--c-edge);
  border-radius: var(--radius-sm);
  background: var(--c-panel-sunk);
  color: var(--c-action);
}

.action__main {
  flex: 1;
  min-width: 0;
  display: grid;
  justify-items: start;
  gap: var(--sp-1);
}

.action__name {
  font-family: var(--font-board);
  font-size: 1.125rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  line-height: 1.1;
  text-transform: uppercase;
}

.action__note {
  font-size: var(--fs-sm);
  color: var(--c-ink-soft);
}

.action__keys {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-2);
  margin-top: var(--sp-2);
}
</style>
