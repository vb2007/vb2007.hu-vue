<script setup lang="ts">
import { computed } from "vue";
import { AdminPaths } from "@/constants/admin";
import type { UploadListing } from "@/composables/useUploads";
import AdminPage from "@/components/features/admin/AdminPage.vue";
import UploadList from "@/components/features/uploads/UploadList.vue";

const props = defineProps<{ id: string }>();

/**
 * The name the admin's "Browse uploads" key sends along in the history state. A direct visit has
 * none, so the list says "this user's" until the API names them.
 */
const ownerFromState = () => {
  const name: unknown = (window.history.state as { uploadsOwner?: unknown } | null)?.uploadsOwner;
  return typeof name === "string" && name ? name : undefined;
};

// Read again per user: by the time the id changes, the history state is the new entry's.
const listing = computed<UploadListing>(() => ({
  kind: "user",
  params: { id: props.id },
  ownerHint: ownerFromState()
}));
</script>

<template>
  <AdminPage width="medium" :back-to="AdminPaths.users" back-label="All users">
    <!-- A new list per user, so its listing is fixed for its lifetime. -->
    <UploadList :key="id" :listing="listing" as="h1" />
  </AdminPage>
</template>
