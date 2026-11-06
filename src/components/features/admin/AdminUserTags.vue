<script setup lang="ts">
/** An account's status pills: Admin, Suspended and Custom quota, each only when it applies. */
import type { AdminUser } from "@/types/api/admin";
import StatusPill from "@/components/ui/StatusPill.vue";

defineProps<{ user: AdminUser }>();
</script>

<template>
  <p v-if="user.isSuperuser || user.suspendedAt || user.uploads.hasCustomQuota" class="tags">
    <StatusPill v-if="user.isSuperuser" class="tag tag--admin" tone="ok">Admin</StatusPill>
    <StatusPill v-if="user.suspendedAt" class="tag tag--suspended" tone="danger">
      Suspended
    </StatusPill>
    <StatusPill v-if="user.uploads.hasCustomQuota" class="tag tag--custom">Custom quota</StatusPill>
  </p>
</template>

<style scoped>
.tags {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-2);
}
</style>
