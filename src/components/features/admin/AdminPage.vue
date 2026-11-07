<script setup lang="ts">
/** An admin page below the overview: a ghost key back up the admin area above the page's boards. */
import { AdminPaths } from "@/constants/admin";
import PageSection from "@/components/layout/PageSection.vue";
import BaseButton from "@/components/ui/BaseButton.vue";

withDefaults(
  defineProps<{
    width?: "wide" | "medium";
    /** Where the back key leads, and what it says: the overview's "All sections" by default. */
    backTo?: string;
    backLabel?: string;
  }>(),
  { width: "wide", backTo: AdminPaths.overview, backLabel: "All sections" }
);
</script>

<template>
  <PageSection :width="width">
    <div class="admin-page">
      <BaseButton class="admin-page__back" size="sm" variant="ghost" :to="backTo">
        {{ backLabel }}
      </BaseButton>
      <slot />
    </div>
  </PageSection>
</template>

<style scoped>
.admin-page {
  display: grid;
  gap: var(--sp-4);
}

.admin-page__back {
  justify-self: start;
}
</style>
