<script setup lang="ts">
/**
 * The account page's Suspend row. Suspending ends the user's session, so it asks first, in place;
 * lifting it doesn't. The superuser's own account can't be suspended, so its row only says so.
 */
import { nextTick, ref, useTemplateRef } from "vue";
import { Messages } from "@/constants/messages";
import { useAdminSuspension } from "@/composables/useAdminSuspension";
import type { AdminUser } from "@/types/api/admin";
import AppIcon from "@/components/ui/AppIcon.vue";
import BaseButton from "@/components/ui/BaseButton.vue";
import StatusMessage from "@/components/ui/StatusMessage.vue";
import AdminUserAction from "./AdminUserAction.vue";

const props = defineProps<{ user: AdminUser }>();
/** The account as the API answered the change, for the page to take in. */
const emit = defineEmits<{ updated: [user: AdminUser] }>();

const { isSaving, error, saved, setSuspension } = useAdminSuspension();

const confirming = ref(false);
const key = useTemplateRef<InstanceType<typeof BaseButton>>("key");
const confirmKey = useTemplateRef<InstanceType<typeof BaseButton>>("confirmKey");

/** The row's key goes with each change: focus moves to the key that takes its place. */
const focusKey = async () => {
  await nextTick();
  key.value?.$el.focus();
};

const open = async () => {
  error.value = "";
  saved.value = "";
  confirming.value = true;
  await nextTick();
  confirmKey.value!.$el.focus();
};

const cancel = () => {
  if (isSaving.value) return;
  confirming.value = false;
  error.value = "";
  focusKey();
};

const change = async (suspended: boolean) => {
  const updated = await setSuspension(props.user.id, suspended);
  if (!updated) return;
  confirming.value = false;
  emit("updated", updated);
  focusKey();
};
</script>

<template>
  <AdminUserAction :title="user.suspendedAt ? 'Lift suspension' : 'Suspend account'" icon="lock">
    <template v-if="user.isSuperuser">{{ Messages.Admin.superuserNotSuspendable }}</template>
    <template v-else-if="user.suspendedAt">
      {{ user.username }} can't log in while suspended. Lifting it lets them log in again, with
      their password or GitHub.
    </template>
    <template v-else>
      Ends {{ user.username }}'s session and stops them logging in until you lift it. Their pastes,
      short links and uploads stay up.
    </template>

    <template v-if="!user.isSuperuser && !confirming" #key>
      <BaseButton
        v-if="user.suspendedAt"
        ref="key"
        size="sm"
        variant="secondary"
        :loading="isSaving"
        @click="change(false)"
      >
        {{ isSaving ? "Lifting" : "Lift suspension" }}
      </BaseButton>
      <BaseButton v-else ref="key" size="sm" variant="secondary" @click="open">
        <AppIcon name="lock" :size="16" />
        Suspend
      </BaseButton>
    </template>

    <template #panel>
      <form
        v-if="confirming"
        class="confirm"
        novalidate
        @submit.prevent="change(true)"
        @keydown.esc="cancel"
      >
        <p class="confirm__text">
          Suspend <strong>{{ user.username }}</strong
          >? They're logged out at once, and can't log in again until you lift the suspension.
        </p>
        <StatusMessage v-if="error" tone="error">{{ error }}</StatusMessage>
        <div class="confirm__actions">
          <BaseButton ref="confirmKey" type="submit" size="sm" error :loading="isSaving">
            {{ isSaving ? "Suspending" : `Suspend ${user.username}` }}
          </BaseButton>
          <BaseButton size="sm" variant="ghost" :disabled="isSaving" @click="cancel">
            Cancel
          </BaseButton>
        </div>
      </form>
      <StatusMessage v-else-if="error" class="outcome" tone="error">{{ error }}</StatusMessage>
      <StatusMessage v-if="saved" class="outcome" tone="success">{{ saved }}</StatusMessage>
    </template>
  </AdminUserAction>
</template>

<style scoped>
/* Like the Account board's delete confirmation: sunk enamel, stretched to the row's width. */
.confirm {
  justify-self: stretch;
  display: grid;
  gap: var(--sp-3);
  margin-top: var(--sp-2);
  padding: var(--sp-4);
  border: var(--edge) solid var(--c-edge);
  border-radius: var(--radius-md);
  background: var(--c-panel-sunk);
  animation: open var(--dur-base) var(--ease-out);
}

.confirm__text {
  max-width: 60ch;
}

.confirm__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-2);
}

.outcome {
  justify-self: stretch;
  margin-top: var(--sp-2);
}

@keyframes open {
  from {
    opacity: 0;
    transform: translateY(-4px);
  }
}
</style>
