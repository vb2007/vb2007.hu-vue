<script setup lang="ts">
import { Messages } from "@/constants/messages";
import AdminPage from "@/components/features/admin/AdminPage.vue";
import AdminUserList from "@/components/features/admin/AdminUserList.vue";

/**
 * The name an account's page sends along in the history state once it deleted the account. It's
 * dropped from the entry right away, so a reload doesn't say it again.
 */
const deletedFromState = () => {
  const state = window.history.state as { deletedUser?: unknown } | null;
  const name = state?.deletedUser;
  if (typeof name !== "string" || !name) return "";
  window.history.replaceState({ ...state, deletedUser: undefined }, "");
  return Messages.Admin.userDeleted(name);
};
const notice = deletedFromState();
</script>

<template>
  <AdminPage>
    <AdminUserList as="h1" :notice="notice" />
  </AdminPage>
</template>
