<script setup lang="ts">
/**
 * The Actions row that ends every session of the account. On the superuser's own account that's
 * this one too, which the note says, so its key takes two clicks there; the page then logs out.
 */
import { computed, nextTick, useTemplateRef } from "vue";
import { useAdminLogout, useArmedKey } from "@/composables/useAdminUserActions";
import { userId } from "@/scripts/authentication/authState";
import type { AdminUser } from "@/types/api/admin";
import BaseButton from "@/components/ui/BaseButton.vue";
import StatusMessage from "@/components/ui/StatusMessage.vue";
import AdminUserAction from "./AdminUserAction.vue";

const props = defineProps<{ user: AdminUser }>();

const { isLoggingOut, logoutError, loggedOut, logOut } = useAdminLogout();
const isOwn = computed(() => props.user.id === userId.value);
const { armed, press, disarm } = useArmedKey();
const key = useTemplateRef("key");

const onLogOut = async () => {
  if (isOwn.value && !press()) return;
  await logOut(props.user.id);
  // The key was disabled while it worked, which dropped the focus. On the admin's own account
  // the page has logged out, and the key went with it.
  await nextTick();
  key.value?.$el.focus();
};
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
      <!-- On the admin's own account it arms first, turning solid red like Delete. -->
      <BaseButton
        ref="key"
        size="sm"
        :variant="armed ? 'primary' : 'secondary'"
        :error="armed"
        :loading="isLoggingOut"
        @click="onLogOut"
        @keydown.esc="disarm"
      >
        {{ isLoggingOut ? "Logging out" : armed ? "Confirm log out" : "Log out everywhere" }}
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
