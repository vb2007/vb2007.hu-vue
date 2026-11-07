<script setup lang="ts">
import AppIcon from "./AppIcon.vue";
import BaseButton from "./BaseButton.vue";

/**
 * The delete key of a two-click delete (see `useConfirmDelete`): quiet until armed, then solid
 * red asking for the second click, then busy while the delete runs. Armed, it's a primary key
 * rather than a ghost one, whose hover fill would wash the red out. The default slot goes after
 * the label, e.g. visually hidden text naming what gets deleted.
 */
defineProps<{
  /** Waiting for the second click. */
  armed: boolean;
  /** The delete is running. */
  busy?: boolean;
  /** Leads with a trash icon, for action rows whose other keys have icons too. */
  icon?: boolean;
}>();
const emit = defineEmits<{ click: [] }>();
</script>

<template>
  <BaseButton
    size="sm"
    :variant="armed ? 'primary' : 'ghost'"
    :error="armed"
    :loading="busy"
    @click="emit('click')"
  >
    <AppIcon v-if="icon" name="trash" :size="16" />
    {{ busy ? "Deleting" : armed ? "Confirm delete" : "Delete" }}
    <slot />
  </BaseButton>
</template>
