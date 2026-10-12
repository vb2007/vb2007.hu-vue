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
  <!-- Logged in it's a workspace (write on the left, your pastes on the right); otherwise just the gate. -->
  <PageSection :width="isLoggedIn ? 'wide' : 'narrow'">
    <div class="workspace" :class="{ 'workspace--split': isLoggedIn }">
      <div class="workspace__compose">
        <PasteComposer as="h1" @created="onCreated" />
      </div>
      <PasteList v-if="isLoggedIn" ref="list" />
    </div>
  </PageSection>
</template>

<style scoped>
.workspace {
  display: grid;
  gap: var(--sp-6);
}

@media (min-width: 62rem) {
  .workspace--split {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1.15fr);
    align-items: start;
  }

  /* Keep the composer in reach while scrolling a long list. */
  .workspace--split .workspace__compose {
    position: sticky;
    top: calc(var(--nav-h) + var(--sp-5));
  }
}
</style>
