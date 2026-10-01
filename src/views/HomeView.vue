<script setup lang="ts">
import { TOOLS_LINE } from "@/constants/stops";
import HomeHero from "@/components/features/home/HomeHero.vue";
import RouteMap from "@/components/features/home/RouteMap.vue";
import PageSection from "@/components/layout/PageSection.vue";
</script>

<template>
  <div>
    <PageSection>
      <HomeHero />
    </PageSection>
    <PageSection aria-labelledby="route-map-title">
      <h2 id="route-map-title" class="map-title">Route map</h2>
      <p class="map-lead">Shorten is open today. More stops are planned along the line.</p>
      <RouteMap :line="TOOLS_LINE" here-id="home" initial-id="paste" />
    </PageSection>
  </div>
</template>

<style scoped>
.map-title {
  margin-bottom: var(--sp-2);
}

.map-lead {
  margin-bottom: var(--sp-6);
}
</style>
