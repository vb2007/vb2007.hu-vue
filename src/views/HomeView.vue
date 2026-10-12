<script setup lang="ts">
import { TOOLS_LINE } from "@/constants/stops";
import HomeHero from "@/components/features/home/HomeHero.vue";
import ToolDirectory from "@/components/features/home/ToolDirectory.vue";
import PageSection from "@/components/layout/PageSection.vue";

// Home is where the visitor already is, so the directory lists only where they can go from here.
const destinations = TOOLS_LINE.stops.filter((stop) => stop.id !== "home");
</script>

<template>
  <div>
    <PageSection>
      <HomeHero />
    </PageSection>
    <PageSection aria-labelledby="tools-title">
      <h2 id="tools-title" class="section-title">Tools</h2>
      <p class="section-lead">Open tools work today. Planned ones are on their way.</p>
      <ToolDirectory :stops="destinations" />
    </PageSection>
  </div>
</template>

<style scoped>
.section-title {
  margin-bottom: var(--sp-2);
}

.section-lead {
  margin-bottom: var(--sp-6);
}
</style>
