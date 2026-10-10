<script setup lang="ts">
import { useTemplateRef } from "vue";
import { isLoggedIn } from "@/scripts/authentication/authState";
import PasteComposer from "@/components/features/pastebin/PasteComposer.vue";
import PasteList from "@/components/features/pastebin/PasteList.vue";
import PageSection from "@/components/layout/PageSection.vue";

const list = useTemplateRef("list");

// The composer only renders its form for logged-in users, so the list is there to refresh.
const onCreated = () => list.value!.refresh();
</script>

<template>
  <PageSection width="narrow">
    <div class="stack">
      <PasteComposer as="h1" @created="onCreated" />
      <PasteList v-if="isLoggedIn" ref="list" />
    </div>
  </PageSection>
</template>

<style scoped>
.stack {
  display: grid;
  gap: var(--sp-6);
}
</style>
