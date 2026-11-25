<script setup lang="ts">
import { ADMIN_SECTIONS } from "@/constants/admin";
import { Endpoints } from "@/constants/endpoints";
import { apiUrl } from "@/scripts/api/client";
import PageSection from "@/components/layout/PageSection.vue";
import AdminSiteBoard from "@/components/features/admin/AdminSiteBoard.vue";
import ToolDirectory from "@/components/features/home/ToolDirectory.vue";

// Named apart from the footer's "API docs": it leads elsewhere, with the superuser's session.
const adminDocs = apiUrl(Endpoints.Docs.admin);
</script>

<template>
  <PageSection width="medium" aria-labelledby="admin-title">
    <h1 id="admin-title" class="section-title">Admin</h1>
    <p class="section-lead">
      Look after the site's accounts and what they keep on it. The
      <a :href="adminDocs" target="_blank" rel="noopener"
        >admin API docs<span class="visually-hidden"> (opens in a new tab)</span></a
      >
      list every route, the admin ones included.
    </p>
    <!-- The site's figures are a board of their own, never rows of the directory. -->
    <AdminSiteBoard />
    <h2 id="admin-sections" class="sections-title">Sections</h2>
    <ToolDirectory :stops="ADMIN_SECTIONS" aria-labelledby="admin-sections" />
  </PageSection>
</template>

<style scoped>
.section-title {
  margin-bottom: var(--sp-2);
}

.section-lead {
  margin-bottom: var(--sp-6);
}

.sections-title {
  margin: var(--sp-7) 0 var(--sp-4);
}
</style>
