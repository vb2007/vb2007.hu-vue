<script setup lang="ts">
import { ADMIN_SECTIONS } from "@/constants/admin";
import PageSection from "@/components/layout/PageSection.vue";
import ToolDirectory from "@/components/features/home/ToolDirectory.vue";
</script>

<template>
  <PageSection width="medium" aria-labelledby="admin-title">
    <h1 id="admin-title" class="section-title">Admin</h1>
    <p class="section-lead">Where the site is run from. Only the admin can open these sections.</p>
    <!-- Site figures (#146) go here, as a board of their own above the sections. -->
    <ToolDirectory :stops="ADMIN_SECTIONS" />
  </PageSection>
</template>

<style scoped>
.section-title {
  margin-bottom: var(--sp-2);
}

.section-lead {
  margin-bottom: var(--sp-6);
}
</style>
