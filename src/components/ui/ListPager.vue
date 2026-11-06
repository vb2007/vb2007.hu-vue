<script setup lang="ts">
import BaseButton from "./BaseButton.vue";

/** Previous and Next under a list, hidden while everything fits on one page. */
defineProps<{
  page: number;
  /** The list's `pagination.pages`. */
  pages: number;
  /** E.g. while a page loads. */
  disabled?: boolean;
}>();
const emit = defineEmits<{ go: [page: number] }>();
</script>

<template>
  <nav v-if="pages > 1" class="pager" aria-label="Pages">
    <BaseButton
      size="sm"
      variant="secondary"
      :disabled="disabled || page <= 1"
      @click="emit('go', page - 1)"
    >
      Previous
    </BaseButton>
    <p class="pager__label">Page {{ page }} of {{ pages }}</p>
    <BaseButton
      size="sm"
      variant="secondary"
      :disabled="disabled || page >= pages"
      @click="emit('go', page + 1)"
    >
      Next
    </BaseButton>
  </nav>
</template>

<style scoped>
.pager {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp-3);
}

.pager__label {
  color: var(--c-ink-soft);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
</style>
