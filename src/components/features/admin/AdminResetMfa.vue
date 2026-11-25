<script setup lang="ts">
/**
 * The account page's Reset MFA row, for a user who lost their second factor. The reset turns
 * every method and recovery code off, deletes the API keys and ends their session, so it asks first, in place, like
 * Suspend. With nothing on there's nothing to reset, and the row only says so (not right after a
 * reset, whose own message says what happened). On the superuser's
 * own account, which the API refuses (409), the row only says where that MFA is managed.
 */
import { computed, nextTick, ref, useId, useTemplateRef } from "vue";
import { Messages } from "@/constants/messages";
import { useAdminMfaReset } from "@/composables/useAdminUserActions";
import type { AdminUserDetails } from "@/types/api/admin";
import AppIcon from "@/components/ui/AppIcon.vue";
import BaseButton from "@/components/ui/BaseButton.vue";
import StatusMessage from "@/components/ui/StatusMessage.vue";
import AdminUserAction from "./AdminUserAction.vue";

const props = defineProps<{ user: AdminUserDetails }>();
/** The account with its MFA as the reset left it, for the page to take in. */
const emit = defineEmits<{ updated: [user: AdminUserDetails] }>();

const { isResetting, resetError, reset } = useAdminMfaReset();

const hasMfa = computed(() => {
  const { email, totp, recoveryCodesLeft } = props.user.mfa;
  return email || totp || recoveryCodesLeft > 0;
});
const canReset = computed(() => !props.user.isSuperuser && hasMfa.value);
const confirming = ref(false);
const done = ref("");
const key = useTemplateRef<InstanceType<typeof BaseButton>>("key");
const confirmKey = useTemplateRef<InstanceType<typeof BaseButton>>("confirmKey");
const doneMessage = useTemplateRef<InstanceType<typeof StatusMessage>>("doneMessage");
const errorId = useId();

const open = async () => {
  resetError.value = "";
  done.value = "";
  confirming.value = true;
  await nextTick();
  confirmKey.value!.$el.focus();
};

const cancel = async () => {
  if (isResetting.value) return;
  confirming.value = false;
  resetError.value = "";
  await nextTick();
  key.value?.$el.focus();
};

const confirm = async () => {
  if (await reset(props.user.id)) {
    confirming.value = false;
    done.value = Messages.Admin.mfaReset(props.user.username);
    // The API turned everything off, deleted the API keys and keeps the passkeys, so it answers
    // no account to take in.
    emit("updated", {
      ...props.user,
      mfa: { ...props.user.mfa, email: false, totp: false, recoveryCodesLeft: 0 },
      apiKeys: []
    });
  }
  // A reset leaves nothing to reset, so its key goes: the focus moves to what it did.
  await nextTick();
  (done.value ? doneMessage : confirmKey).value?.$el.focus();
};
</script>

<template>
  <AdminUserAction title="Reset MFA" icon="shield">
    <template v-if="user.isSuperuser">{{ Messages.Admin.superuserMfaNotResettable }}</template>
    <!-- After a reset the row still says what it does: the success message below says it's done. -->
    <template v-else-if="hasMfa || done">
      For when {{ user.username }} lost their second factor: turns off every MFA method and recovery
      code, deletes their API keys and ends their session. Their passkeys stay.
    </template>
    <template v-else
      >{{ user.username }} has no MFA method on, so there's nothing to reset.</template
    >

    <template v-if="canReset && !confirming" #key>
      <BaseButton ref="key" size="sm" variant="secondary" @click="open">
        <AppIcon name="shield" :size="16" />
        Reset MFA
      </BaseButton>
    </template>

    <template #panel>
      <form
        v-if="confirming"
        class="confirm"
        novalidate
        @submit.prevent="confirm"
        @keydown.esc="cancel"
      >
        <p class="confirm__text">
          Reset <strong>{{ user.username }}</strong>'s MFA? Every method and recovery code is turned
          off, their API keys are deleted, and they're logged out at once and mailed a security
          notice. They log in without a second step (password, GitHub or a passkey) and can turn MFA
          on again.
        </p>
        <StatusMessage v-if="resetError" :id="errorId" tone="error">{{ resetError }}</StatusMessage>
        <div class="confirm__actions">
          <BaseButton
            ref="confirmKey"
            type="submit"
            size="sm"
            error
            :loading="isResetting"
            :aria-describedby="resetError ? errorId : undefined"
          >
            {{ isResetting ? "Resetting" : `Reset ${user.username}'s MFA` }}
          </BaseButton>
          <BaseButton size="sm" variant="ghost" :disabled="isResetting" @click="cancel">
            Cancel
          </BaseButton>
        </div>
      </form>
      <StatusMessage v-if="done" ref="doneMessage" class="outcome" tone="success" tabindex="-1">{{
        done
      }}</StatusMessage>
    </template>
  </AdminUserAction>
</template>

<style scoped>
/* Like the Suspend row's confirmation: sunk enamel, stretched to the row's width. */
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
