<script setup lang="ts">
import { TOOLS_LINE } from "@/constants/stops";
import BaseButton from "@/components/ui/BaseButton.vue";
import StationBoard from "@/components/ui/StationBoard.vue";
import ToolDirectory from "@/components/features/home/ToolDirectory.vue";
import PageSection from "@/components/layout/PageSection.vue";

defineProps<{ title: string }>();

// Home already has its own key on the board, and planned stops lead nowhere yet, so the way on is
// only the tools that work today.
const tools = TOOLS_LINE.stops.filter((stop) => stop.id !== "home" && stop.status === "open");
</script>

<template>
  <div>
    <PageSection width="medium">
      <StationBoard :title="title" as="h1">
        <!-- The sentence naming what's missing, with its address in a `.path` code element. -->
        <slot />
        <div class="actions">
          <BaseButton to="/">Back to home</BaseButton>
        </div>
      </StationBoard>
    </PageSection>
    <PageSection width="medium" aria-labelledby="not-found-tools-title">
      <h2 id="not-found-tools-title" class="section-title">Tools</h2>
      <p class="section-lead">Or go straight to one of the tools.</p>
      <ToolDirectory :stops="tools" />
    </PageSection>
  </div>
</template>

<style scoped>
/* Isolated, so no character in the address can reorder the sentence around it. */
:slotted(.path) {
  unicode-bidi: isolate;
  font-family: var(--font-code);
  font-size: 0.95rem;
  font-weight: 500;
  overflow-wrap: anywhere;
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-3);
}

.section-title {
  margin-bottom: var(--sp-2);
}

.section-lead {
  margin-bottom: var(--sp-6);
}
</style>
