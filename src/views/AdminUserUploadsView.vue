<script setup lang="ts">
import { computed } from "vue";
import { Endpoints } from "@/constants/endpoints";
import type { UploadListing } from "@/composables/useUploads";
import { isSuperuser } from "@/scripts/authentication/authState";
import PageSection from "@/components/layout/PageSection.vue";
import AdminGate from "@/components/features/admin/AdminGate.vue";
import UploadList from "@/components/features/uploads/UploadList.vue";
import BaseButton from "@/components/ui/BaseButton.vue";

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
  endpoint: Endpoints.Admin.userUploads,
  params: { id: props.id },
  ownerHint: ownerFromState()
}));
</script>

<template>
  <PageSection :width="isSuperuser ? 'medium' : 'narrow'">
    <AdminGate>
      <div class="moderate">
        <BaseButton class="moderate__back" size="sm" variant="ghost" to="/admin">
          All users
        </BaseButton>
        <!-- A new list per user, so its listing is fixed for its lifetime. -->
        <UploadList :key="id" :listing="listing" as="h1" />
      </div>
    </AdminGate>
  </PageSection>
</template>

<style scoped>
.moderate {
  display: grid;
  gap: var(--sp-4);
}

.moderate__back {
  justify-self: start;
}
</style>
