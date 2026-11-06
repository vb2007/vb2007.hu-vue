<script setup lang="ts">
/**
 * The Actions row that ends every session of the account. On the superuser's own account that's
 * this one too, which the note says; the page then logs out.
 */
import { computed } from "vue";
import { useAdminLogout } from "@/composables/useAdminUserActions";
import { userId } from "@/scripts/authentication/authState";
import type { AdminUser } from "@/types/api/admin";
import BaseButton from "@/components/ui/BaseButton.vue";
import StatusMessage from "@/components/ui/StatusMessage.vue";
import AdminUserAction from "./AdminUserAction.vue";

const props = defineProps<{ user: AdminUser }>();

const { isLoggingOut, logoutError, loggedOut, logOut } = useAdminLogout();
const isOwn = computed(() => props.user.id === userId.value);
</script>

<template>
  <AdminUserAction title="Log out everywhere" icon="logout">
    <template v-if="isOwn">
      This is your account: it ends this session too, so you'll have to log in again.
    </template>
    <template v-else>
      Ends {{ user.username }}'s session on every device. They can log in again.
    </template>
    <template #key>
      <BaseButton size="sm" variant="secondary" :loading="isLoggingOut" @click="logOut(user.id)">
        {{ isLoggingOut ? "Logging out" : "Log out everywhere" }}
      </BaseButton>
    </template>
    <template #panel>
      <StatusMessage v-if="loggedOut" class="logout__status" tone="success">{{
        loggedOut
      }}</StatusMessage>
      <StatusMessage v-if="logoutError" class="logout__status" tone="error">{{
        logoutError
      }}</StatusMessage>
    </template>
  </AdminUserAction>
</template>

<style scoped>
.logout__status {
  justify-self: stretch;
  margin-top: var(--sp-2);
}
</style>
