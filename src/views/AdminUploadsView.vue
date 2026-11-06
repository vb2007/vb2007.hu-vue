<script setup lang="ts">
import type { UploadListing } from "@/composables/useUploads";
import AdminPage from "@/components/features/admin/AdminPage.vue";
import UploadList from "@/components/features/uploads/UploadList.vue";

/** Every user's uploads, each row naming its owner. */
const listing: UploadListing = { kind: "site" };
</script>

<template>
  <AdminPage width="medium">
    <UploadList :listing="listing" as="h1" />
  </AdminPage>
</template>
