<script setup lang="ts">
/**
 * The last Actions row: deletes the account with everything it owns, in two clicks like an
 * upload's Delete, then goes back to the Users list, which says so. The superuser's own account
 * can't be deleted, so its row only says that.
 */
import { nextTick, onBeforeUnmount, useTemplateRef } from "vue";
import { useRoute, useRouter } from "vue-router";
import { AdminRoutes } from "@/constants/admin";
import { useAdminDelete, useArmedKey } from "@/composables/useAdminUserActions";
import type { AdminUser } from "@/types/api/admin";
import AppIcon from "@/components/ui/AppIcon.vue";
import BaseButton from "@/components/ui/BaseButton.vue";
import StatusMessage from "@/components/ui/StatusMessage.vue";
import AdminUserAction from "./AdminUserAction.vue";

const props = defineProps<{ user: AdminUser }>();

const route = useRoute();
const router = useRouter();
const { isDeleting, deleteError, remove } = useAdminDelete();
const { armed, press, disarm } = useArmedKey();
const key = useTemplateRef("key");

let isGone = false;
onBeforeUnmount(() => (isGone = true));

const onDelete = async () => {
  if (!press()) return;
  const { id, username } = props.user;
  if (await remove(id)) {
    // Only from this account's page: the admin may have gone elsewhere while it worked.
    const isStillHere = !isGone && route.name === AdminRoutes.user && route.params.id === id;
    if (isStillHere) {
      await router.push({ name: AdminRoutes.users, state: { deletedUser: username } });
    }
    return;
  }
  // The key was disabled while it worked, which dropped the focus.
  await nextTick();
  key.value?.$el.focus();
};
</script>

<template>
  <AdminUserAction title="Delete account" icon="trash">
    <template v-if="user.isSuperuser"> The superuser's own account can't be deleted. </template>
    <template v-else>
      Deletes {{ user.username }}'s account with its pastes, short links and uploads. It can't be
      undone.
    </template>
    <template v-if="!user.isSuperuser" #key>
      <!-- Armed, it turns solid red, like an upload's Delete; Escape disarms it. -->
      <BaseButton
        ref="key"
        size="sm"
        :variant="armed ? 'primary' : 'secondary'"
        :error="armed"
        :loading="isDeleting"
        @click="onDelete"
        @keydown.esc="disarm"
      >
        <AppIcon name="trash" :size="16" />
        {{ isDeleting ? "Deleting" : armed ? "Confirm delete" : "Delete account" }}
      </BaseButton>
    </template>
    <template #panel>
      <StatusMessage v-if="deleteError" class="delete__error" tone="error">{{
        deleteError
      }}</StatusMessage>
    </template>
  </AdminUserAction>
</template>

<style scoped>
.delete__error {
  justify-self: stretch;
  margin-top: var(--sp-2);
}
</style>
