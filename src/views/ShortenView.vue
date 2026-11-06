<script setup lang="ts">
import { useTemplateRef } from "vue";
import { isLoggedIn } from "@/scripts/authentication/authState";
import ShortLinkList from "@/components/features/shorten/ShortLinkList.vue";
import ShortenPanel from "@/components/features/shorten/ShortenPanel.vue";
import PageSection from "@/components/layout/PageSection.vue";

const list = useTemplateRef("list");

// The list is there while the panel's form is, but a logout during the request takes it away.
const onCreated = () => list.value?.refresh();
</script>

<template>
  <!-- Logged in it's a workspace (shorten on the left, your links on the right); otherwise just the gate. -->
  <PageSection :width="isLoggedIn ? 'wide' : 'narrow'">
    <div class="workspace" :class="{ 'workspace--split': isLoggedIn }">
      <div class="workspace__shorten">
        <ShortenPanel as="h1" @created="onCreated" />
      </div>
      <ShortLinkList v-if="isLoggedIn" ref="list" />
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

  /* Keep the form in reach while scrolling a long list. */
  .workspace--split .workspace__shorten {
    position: sticky;
    top: calc(var(--nav-h) + var(--sp-5));
  }
}
</style>
