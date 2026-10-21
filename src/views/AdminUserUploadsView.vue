<script setup lang="ts">
import { computed } from "vue";
import { Admin } from "@/constants/api";
import { isSuperuser } from "@/scripts/authentication/authState";
import PageSection from "@/components/layout/PageSection.vue";
import AdminGate from "@/components/features/admin/AdminGate.vue";
import UploadList from "@/components/features/uploads/UploadList.vue";
import BaseButton from "@/components/ui/BaseButton.vue";

const props = defineProps<{ id: string }>();

const listUrl = computed(() => Admin.userUploads.replace(":id", encodeURIComponent(props.id)));
</script>

<template>
  <PageSection :width="isSuperuser ? 'medium' : 'narrow'">
    <AdminGate>
      <div class="moderate">
        <BaseButton class="moderate__back" size="sm" variant="ghost" to="/admin">
          All users
        </BaseButton>
        <!-- A new list per user, so its listing endpoint is fixed for its lifetime. -->
        <UploadList :key="listUrl" :list-url="listUrl" as="h1" />
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
