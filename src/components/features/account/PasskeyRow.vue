<script setup lang="ts">
/**
 * One passkey of the account (vb2007/vb2007.hu-api#446): its name, when it was added and last
 * used, and Rename (a field in place, no password) and Delete (`ReauthForm`), one open at a time.
 */
import { computed, nextTick, ref, useTemplateRef } from "vue";
import { Endpoints } from "@/constants/endpoints";
import { HttpStatus } from "@/constants/http";
import { Messages } from "@/constants/messages";
import { useFormValidation } from "@/composables/useFormValidation";
import { apiRequest } from "@/scripts/api/client";
import { passkeyNameEarlyError, passkeyNameError } from "@/scripts/authentication/passkeys";
import { formatDate } from "@/scripts/utility/dateUtil";
import ReauthForm from "@/components/features/account/ReauthForm.vue";
import AppIcon from "@/components/ui/AppIcon.vue";
import BaseButton from "@/components/ui/BaseButton.vue";
import BaseInput from "@/components/ui/BaseInput.vue";
import type { MfaPasswordBody } from "@/types/api/mfa";
import type { MessageResponse } from "@/types/api/common";
import type { Passkey } from "@/types/api/passkeys";

const props = defineProps<{ passkey: Passkey }>();
const emit = defineEmits<{
  /** A form opened: older notices go. */
  start: [];
  /** The API's message; `gone` when the passkey is no longer there (deleted, or a 404). */
  done: [message: string, gone: boolean];
}>();

const open = ref<"" | "rename" | "delete">("");
const keys = useTemplateRef("keys");

const used = computed(() =>
  props.passkey.lastUsedAt ? `Last used ${formatDate(props.passkey.lastUsedAt)}` : "Never used"
);

/** Back to the row's keys, focusing the one that opened the form. */
const close = async () => {
  const was = open.value;
  open.value = "";
  await nextTick();
  keys.value?.querySelector<HTMLElement>(`[data-key="${was}"]`)?.focus();
};

/* Rename: the name turns into a field; Enter saves, Escape puts it back. */
const draftName = ref("");
const isRenaming = ref(false);
const renameForm = useTemplateRef("renameForm");
const { errors, isValid, leave, validate, setError, reset } = useFormValidation({
  name: {
    value: draftName,
    check: () => passkeyNameError(draftName.value),
    early: () => passkeyNameEarlyError(draftName.value)
  }
});

const startRename = async () => {
  open.value = "rename";
  draftName.value = props.passkey.name;
  reset();
  emit("start");
  await nextTick();
  const input = renameForm.value?.querySelector("input");
  input?.focus();
  input?.select();
};

const saveRename = async () => {
  if (isRenaming.value || !(await validate(renameForm.value))) return;
  if (draftName.value.trim() === props.passkey.name) return close();
  isRenaming.value = true;
  const result = await apiRequest(Endpoints.User.renamePasskey, {
    params: { id: props.passkey.id },
    body: { name: draftName.value },
    failure: Messages.Passkeys.renameFailed,
    // A name the API refuses is the field's own error.
    quietStatuses: [HttpStatus.BadRequest, HttpStatus.NotFound]
  });
  isRenaming.value = false;
  if (result.ok) emit("done", result.data.message, false);
  else if (result.status === HttpStatus.NotFound) emit("done", result.error, true);
  else {
    setError("name", result.error);
    renameForm.value?.querySelector("input")?.focus();
  }
};

/* Delete: confirmed like every MFA setting. */
const startDelete = () => {
  open.value = "delete";
  emit("start");
};

const remove = (body: MfaPasswordBody) =>
  apiRequest(Endpoints.User.removePasskey, {
    params: { id: props.passkey.id },
    body,
    failure: Messages.Passkeys.deleteFailed
  });

const onDeleted = (data: MessageResponse) => emit("done", data.message, true);
</script>

<template>
  <li class="passkey">
    <span class="passkey__mark"><AppIcon name="passkey" :size="22" /></span>
    <div class="passkey__main">
      <h3 class="passkey__name">{{ passkey.name }}</h3>
      <p class="passkey__dates">
        Added {{ formatDate(passkey.createdAt) }}<span aria-hidden="true"> · </span
        ><span class="visually-hidden">, </span>{{ used }}
      </p>

      <form
        v-if="open === 'rename'"
        ref="renameForm"
        class="passkey__form"
        novalidate
        @submit.prevent="saveRename"
        @keydown.esc="close"
      >
        <BaseInput
          v-model="draftName"
          label="New name"
          :error="errors.name"
          required
          @blur="leave('name')"
        />
        <div class="passkey__keys">
          <BaseButton type="submit" size="sm" :loading="isRenaming" :blocked="!isValid">
            {{ isRenaming ? "Saving" : "Save name" }}
          </BaseButton>
          <BaseButton size="sm" variant="ghost" :disabled="isRenaming" @click="close">
            Cancel
          </BaseButton>
        </div>
      </form>

      <ReauthForm
        v-else-if="open === 'delete'"
        :send="remove"
        submit-label="Delete"
        busy-label="Deleting"
        hint="Confirms it's you. The passkey can't log in afterwards, but your browser or password manager keeps its copy until you remove it there."
        danger
        @done="onDeleted"
        @cancel="close"
      />

      <div v-else ref="keys" class="passkey__keys">
        <BaseButton data-key="rename" size="sm" variant="secondary" @click="startRename">
          <AppIcon name="pencil" :size="16" /> Rename<span class="visually-hidden">
            {{ passkey.name }}</span
          >
        </BaseButton>
        <BaseButton data-key="delete" size="sm" variant="secondary" @click="startDelete">
          <AppIcon name="trash" :size="16" /> Delete<span class="visually-hidden">
            {{ passkey.name }}</span
          >
        </BaseButton>
      </div>
    </div>
  </li>
</template>

<style scoped>
.passkey {
  display: flex;
  align-items: flex-start;
  gap: var(--sp-4);
  padding: var(--sp-3) 0;
  border-bottom: var(--edge) solid var(--c-hairline);
}

/* The account rows' tile, a size down: these sit inside the Passkeys section, not beside it. */
.passkey__mark {
  flex: none;
  display: grid;
  place-items: center;
  width: 2.75rem;
  height: 2.75rem;
  border: var(--edge) solid var(--c-edge);
  border-radius: var(--radius-sm);
  background: var(--c-panel-sunk);
  color: var(--c-action);
}

.passkey__main {
  flex: 1;
  min-width: 0;
  display: grid;
  justify-items: start;
  gap: var(--sp-1);
}

/* A name the user chose: kept as typed, not uppercased like the section's own names. */
.passkey__name {
  font-size: 1.0625rem;
  font-weight: 600;
  line-height: 1.25;
  overflow-wrap: anywhere;
}

.passkey__dates {
  font-size: var(--fs-sm);
  color: var(--c-ink-soft);
}

.passkey__form {
  justify-self: stretch;
  display: grid;
  gap: var(--sp-4);
  margin-top: var(--sp-2);
}

.passkey__keys {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-2);
  margin-top: var(--sp-2);
}

.passkey__form .passkey__keys {
  margin-top: 0;
}
</style>
