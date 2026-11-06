<script setup lang="ts">
import { AdminPaths } from "@/constants/admin";
import AdminPage from "@/components/features/admin/AdminPage.vue";
import AdminUserPanel from "@/components/features/admin/AdminUserPanel.vue";

defineProps<{ id: string }>();
</script>

<template>
  <AdminPage width="medium" :back-to="AdminPaths.users" back-label="All users">
    <AdminUserPanel :id="id" />
  </AdminPage>
</template>
