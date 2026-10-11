<script setup lang="ts">
import ShortLinkResolver from "@/components/features/redirect/ShortLinkResolver.vue";
import PageSection from "@/components/layout/PageSection.vue";

defineProps<{ code: string; preview?: boolean }>();
</script>

<template>
  <PageSection width="narrow">
    <ShortLinkResolver :code="code" :preview="preview" />
  </PageSection>
</template>
