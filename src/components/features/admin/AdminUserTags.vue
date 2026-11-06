<script setup lang="ts">
/** An account's status pills: Admin, Suspended and Custom quota, each only when it applies. */
import type { AdminUser } from "@/types/api/admin";

defineProps<{ user: AdminUser }>();
</script>

<template>
  <p v-if="user.isSuperuser || user.suspendedAt || user.uploads.hasCustomQuota" class="tags">
    <span v-if="user.isSuperuser" class="tag tag--admin">Admin</span>
    <span v-if="user.suspendedAt" class="tag tag--suspended">Suspended</span>
    <span v-if="user.uploads.hasCustomQuota" class="tag tag--custom">Custom quota</span>
  </p>
</template>

<style scoped>
.tags {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-2);
}

/* Same pill as the upload badges; Admin in forest, Suspended in fault red, a custom quota on sunk enamel. */
.tag {
  display: inline-flex;
  align-items: center;
  padding: 0.125rem var(--sp-2);
  border: var(--edge) solid currentColor;
  border-radius: 999px;
  font-family: var(--font-board);
  font-size: 0.9375rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  white-space: nowrap;
}

.tag--admin {
  background: var(--c-ok-wash);
  color: var(--c-action);
}

.tag--suspended {
  background: var(--c-danger-wash);
  color: var(--c-danger);
}

.tag--custom {
  background: var(--c-panel-sunk);
  color: var(--c-ink-soft);
}
</style>
