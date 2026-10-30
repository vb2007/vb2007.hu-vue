<script setup lang="ts">
/** Deletes the account once the user confirms with their password, or their username if it has none. */
import { computed, nextTick, ref, useTemplateRef } from "vue";
import { useRouter } from "vue-router";
import { hasPassword, username } from "@/scripts/authentication/authState";
import { clearSession } from "@/scripts/authentication/user";
import { useAccountDelete } from "@/composables/useAccountDelete";
import AppIcon from "@/components/ui/AppIcon.vue";
import BaseButton from "@/components/ui/BaseButton.vue";
import BaseInput from "@/components/ui/BaseInput.vue";
import StatusMessage from "@/components/ui/StatusMessage.vue";

const router = useRouter();
const { isDeleting, deleteError, deleteAccount } = useAccountDelete();

const confirming = ref(false);
const confirmation = ref("");
const field = useTemplateRef("field");
const opener = useTemplateRef("opener");

const ready = computed(() =>
  hasPassword.value ? confirmation.value !== "" : confirmation.value === username.value
);

const open = async () => {
  confirming.value = true;
  await nextTick();
  field.value!.$el.querySelector("input").focus();
};

const cancel = async () => {
  if (isDeleting.value) return;
  confirming.value = false;
  confirmation.value = "";
  deleteError.value = "";
  await nextTick();
  opener.value!.$el.focus();
};

const submit = async () => {
  if (!ready.value) return;
  if (!(await deleteAccount(confirmation.value))) return;
  await router.push("/");
  clearSession();
};
</script>

<template>
  <section class="delete" aria-labelledby="delete-title">
    <h2 id="delete-title" class="delete__title">Delete account</h2>
    <p class="delete__note">
      Deleting your account also deletes your pastes, short links and uploads. It can't be undone.
    </p>

    <form
      v-if="confirming"
      class="confirm"
      novalidate
      @submit.prevent="submit"
      @keydown.esc="cancel"
    >
      <BaseInput
        v-if="hasPassword"
        ref="field"
        v-model="confirmation"
        label="Password"
        type="password"
        autocomplete="current-password"
        required
      />
      <BaseInput
        v-else
        ref="field"
        v-model="confirmation"
        label="Username"
        :hint="`Type “${username}” to confirm.`"
        autocomplete="off"
        autocapitalize="off"
        spellcheck="false"
        required
      />
      <StatusMessage v-if="deleteError" tone="error">{{ deleteError }}</StatusMessage>
      <div class="confirm__actions">
        <BaseButton type="submit" size="sm" :error="ready" :disabled="!ready" :loading="isDeleting">
          {{ isDeleting ? "Deleting" : "Delete account" }}
        </BaseButton>
        <BaseButton size="sm" variant="ghost" :disabled="isDeleting" @click="cancel">
          Cancel
        </BaseButton>
      </div>
    </form>

    <BaseButton v-else ref="opener" size="sm" variant="secondary" @click="open">
      <AppIcon name="trash" :size="16" />
      Delete account
    </BaseButton>
  </section>
</template>

<style scoped>
.delete {
  display: grid;
  justify-items: start;
  gap: var(--sp-3);
}

.delete__title {
  font-size: 1.25rem;
  letter-spacing: 0.04em;
  line-height: 1.1;
  text-transform: uppercase;
}

.delete__note {
  font-size: var(--fs-sm);
  color: var(--c-ink-soft);
}

.confirm {
  justify-self: stretch;
  display: grid;
  gap: var(--sp-4);
  padding: var(--sp-4);
  border: var(--edge) solid var(--c-edge);
  border-radius: var(--radius-md);
  background: var(--c-panel-sunk);
  animation: open var(--dur-base) var(--ease-out);
}

.confirm__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-2);
}

@keyframes open {
  from {
    opacity: 0;
    transform: translateY(-4px);
  }
}
</style>
