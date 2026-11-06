<script setup lang="ts" generic="SortBy extends string">
import { computed } from "vue";
import type { SortOrder } from "@/types/api/common";
import BaseSelect from "./BaseSelect.vue";

export interface SortOption<SortBy extends string> {
  by: SortBy;
  order: SortOrder;
  label: string;
}

/** A list's sort as one select: each option is a field and a direction. */
const props = withDefaults(
  defineProps<{
    options: SortOption<SortBy>[];
    sortBy: SortBy;
    sortOrder: SortOrder;
    label?: string;
    size?: "md" | "sm";
  }>(),
  { label: "Sort", size: "md" }
);
const emit = defineEmits<{ change: [by: SortBy, order: SortOrder] }>();

type SortKey = `${SortBy}:${SortOrder}`;
const keyOf = (by: SortBy, order: SortOrder): SortKey => `${by}:${order}`;

const choices = computed(() =>
  props.options.map((option) => ({ value: keyOf(option.by, option.order), label: option.label }))
);
const selected = computed<SortKey>({
  get: () => keyOf(props.sortBy, props.sortOrder),
  set: (key) => {
    const option = props.options.find((item) => keyOf(item.by, item.order) === key)!;
    emit("change", option.by, option.order);
  }
});
</script>

<template>
  <BaseSelect v-model="selected" :label="label" :options="choices" :size="size" />
</template>
