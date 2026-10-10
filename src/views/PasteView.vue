<script setup lang="ts">
import PasteViewer from "@/components/features/pastebin/PasteViewer.vue";
import PageSection from "@/components/layout/PageSection.vue";

defineProps<{ id: string }>();
</script>

<template>
  <PageSection width="medium">
    <PasteViewer :id="id" as="h1" />
  </PageSection>
</template>
