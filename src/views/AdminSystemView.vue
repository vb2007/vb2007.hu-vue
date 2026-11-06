<script setup lang="ts">
import AdminPage from "@/components/features/admin/AdminPage.vue";
import AdminPendingRegistrations from "@/components/features/admin/AdminPendingRegistrations.vue";
import AdminRateLimits from "@/components/features/admin/AdminRateLimits.vue";
</script>

<template>
  <AdminPage>
    <div>
      <h1 class="section-title">System</h1>
      <p class="section-lead">Sign-ups still waiting for their code, and the API's rate limits.</p>
    </div>
    <div class="tools">
      <AdminPendingRegistrations />
      <AdminRateLimits />
    </div>
  </AdminPage>
</template>

<style scoped>
.section-title {
  margin-bottom: var(--sp-2);
}

.tools {
  display: grid;
  gap: var(--sp-6);
}

/* The list takes the wider column; the form sits beside it. */
@media (min-width: 62rem) {
  .tools {
    grid-template-columns: minmax(0, 1.35fr) minmax(0, 1fr);
    align-items: start;
  }
}
</style>
