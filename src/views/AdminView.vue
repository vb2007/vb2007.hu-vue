<script setup lang="ts">
import { isSuperuser } from "@/scripts/authentication/authState";
import PageSection from "@/components/layout/PageSection.vue";
import AdminGate from "@/components/features/admin/AdminGate.vue";
import AdminUserList from "@/components/features/admin/AdminUserList.vue";
</script>

<template>
  <PageSection :width="isSuperuser ? 'wide' : 'narrow'">
    <AdminGate>
      <AdminUserList as="h1" />
    </AdminGate>
  </PageSection>
</template>
