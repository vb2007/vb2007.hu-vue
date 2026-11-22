<script setup lang="ts">
/**
 * The Actions row that revokes every API key of the account (vb2007/vb2007.hu-api#513), the
 * superuser's own too. Revoked keys can't come back and whatever used them stops working, so the
 * key arms first, like Delete. The session stays, which the note says. The key stays without any
 * keys listed too: the list is as the page loaded it, and the API answers how many it deleted.
 */
import { computed, nextTick, useTemplateRef } from "vue";
import { useAdminApiKeyRevoke, useArmedKey } from "@/composables/useAdminUserActions";
import { userId } from "@/scripts/authentication/authState";
import type { AdminUserDetails } from "@/types/api/admin";
import AppIcon from "@/components/ui/AppIcon.vue";
import BaseButton from "@/components/ui/BaseButton.vue";
import StatusMessage from "@/components/ui/StatusMessage.vue";
import AdminUserAction from "./AdminUserAction.vue";

const props = defineProps<{ user: AdminUserDetails }>();
/** The account without its API keys, for the page to take in. */
const emit = defineEmits<{ updated: [user: AdminUserDetails] }>();

const { isRevoking, revokeError, revoked, revoke } = useAdminApiKeyRevoke();
const { armed, press, disarm } = useArmedKey();
const key = useTemplateRef("key");
const isOwn = computed(() => props.user.id === userId.value);
/** "API key" or "2 API keys", and the pronoun that goes with it. */
const keys = computed(() => {
  const count = props.user.apiKeys.length;
  return count === 1
    ? { what: "API key", it: "it" }
    : { what: `${count.toLocaleString()} API keys`, it: "them" };
});

const onRevoke = async () => {
  if (!press()) return;
  // The API answers no account: every key is gone, the rest stays as shown.
  if (await revoke(props.user.id)) emit("updated", { ...props.user, apiKeys: [] });
  // The key was disabled while it worked, which dropped the focus.
  await nextTick();
  key.value?.$el.focus();
};
</script>

<template>
  <AdminUserAction title="Revoke API keys" icon="key">
    <!-- The list is as the page loaded it, so without keys listed the key still stays. -->
    <template v-if="!user.apiKeys.length">
      None listed. Revoking still deletes any made since the page loaded.
    </template>
    <template v-else-if="isOwn">
      Deletes your {{ keys.what }}, so whatever uses {{ keys.it }} stops working. This session
      stays.
    </template>
    <template v-else>
      Deletes {{ user.username }}'s {{ keys.what }}, so whatever uses {{ keys.it }} stops working,
      and mails their address a security notice, while today's notices last. Their session stays:
      log them out too if the account may be in the wrong hands.
    </template>
    <template #key>
      <!-- It arms first, turning solid red like Delete. -->
      <BaseButton
        ref="key"
        size="sm"
        :variant="armed ? 'primary' : 'secondary'"
        :error="armed"
        :loading="isRevoking"
        @click="onRevoke"
        @keydown.esc="disarm"
      >
        <AppIcon name="key" :size="16" />
        {{ isRevoking ? "Revoking" : armed ? "Confirm revoke" : "Revoke API keys" }}
      </BaseButton>
    </template>
    <template #panel>
      <StatusMessage v-if="revoked" class="outcome" tone="success">{{ revoked }}</StatusMessage>
      <StatusMessage v-if="revokeError" class="outcome" tone="error">{{
        revokeError
      }}</StatusMessage>
    </template>
  </AdminUserAction>
</template>

<style scoped>
.outcome {
  justify-self: stretch;
  margin-top: var(--sp-2);
}
</style>
