<script setup lang="ts">
/**
 * The last Actions row: deletes the account with everything it owns, in two clicks like an
 * upload's Delete, then goes back to the Users list, which says so. The superuser's own account
 * can't be deleted, so its row only says that.
 */
import { onBeforeUnmount, ref } from "vue";
import { useRouter } from "vue-router";
import { AdminRoutes } from "@/constants/admin";
import { useAdminDelete } from "@/composables/useAdminUserActions";
import type { AdminUser } from "@/types/api/admin";
import AppIcon from "@/components/ui/AppIcon.vue";
import BaseButton from "@/components/ui/BaseButton.vue";
import StatusMessage from "@/components/ui/StatusMessage.vue";
import AdminUserAction from "./AdminUserAction.vue";

const props = defineProps<{ user: AdminUser }>();

const router = useRouter();
const { isDeleting, deleteError, remove } = useAdminDelete();

/** Deleting takes two clicks; the armed state wears off if the admin moves on. */
const confirming = ref(false);
let confirmTimer: ReturnType<typeof setTimeout> | undefined;
const onDelete = async () => {
  clearTimeout(confirmTimer);
  if (!confirming.value) {
    confirming.value = true;
    confirmTimer = setTimeout(() => (confirming.value = false), 4000);
    return;
  }
  confirming.value = false;
  const { username } = props.user;
  if (await remove(props.user.id)) {
    await router.push({ name: AdminRoutes.users, state: { deletedUser: username } });
  }
};
onBeforeUnmount(() => clearTimeout(confirmTimer));
</script>

<template>
  <AdminUserAction title="Delete account" icon="trash">
    <template v-if="user.isSuperuser"> The superuser's own account can't be deleted. </template>
    <template v-else>
      Deletes {{ user.username }}'s account with its pastes, short links and uploads. It can't be
      undone.
    </template>
    <template v-if="!user.isSuperuser" #key>
      <!-- Armed, it turns solid red, like an upload's Delete. -->
      <BaseButton
        size="sm"
        :variant="confirming ? 'primary' : 'secondary'"
        :error="confirming"
        :loading="isDeleting"
        @click="onDelete"
      >
        <AppIcon name="trash" :size="16" />
        {{ isDeleting ? "Deleting" : confirming ? "Confirm delete" : "Delete account" }}
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
