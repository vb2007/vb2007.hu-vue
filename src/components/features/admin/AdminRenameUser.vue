<script setup lang="ts">
/** The Actions row that renames the account, in a form that opens in place under its key. */
import { computed, nextTick, ref, useTemplateRef } from "vue";
import { Limits } from "@/constants/limits";
import { Messages } from "@/constants/messages";
import { useAdminRename } from "@/composables/useAdminUserActions";
import { useFormValidation } from "@/composables/useFormValidation";
import { usernameEarlyError, usernameError } from "@/scripts/authentication/register";
import type { AdminUser } from "@/types/api/admin";
import BaseButton from "@/components/ui/BaseButton.vue";
import BaseInput from "@/components/ui/BaseInput.vue";
import StatusMessage from "@/components/ui/StatusMessage.vue";
import AdminUserAction from "./AdminUserAction.vue";

const props = defineProps<{ user: AdminUser }>();
/** The renamed account, as the API answered it. */
const emit = defineEmits<{ updated: [user: AdminUser] }>();

const hint = Messages.Auth.usernameHint(Limits.Username.minLength, Limits.Username.maxLength);

const { isRenaming, fieldError, renameError, rename } = useAdminRename();

const open = ref(false);
const name = ref("");
const saved = ref("");
const { errors, isValid, leave, validate, setError, reset } = useFormValidation({
  name: {
    value: name,
    check: () => usernameError(name.value),
    early: () => usernameEarlyError(name.value)
  }
});
/** Saving wants another name, or the same in another case: the API keeps it trimmed, as typed. */
const isUnchanged = computed(() => name.value.trim() === props.user.username);

const key = useTemplateRef("key");
const form = useTemplateRef("form");
const field = () => form.value!.querySelector("input")!;

const start = async () => {
  saved.value = "";
  name.value = props.user.username;
  reset();
  open.value = true;
  await nextTick();
  field().focus();
  field().select();
};

const close = async () => {
  open.value = false;
  renameError.value = "";
  await nextTick();
  key.value?.$el.focus();
};

const cancel = () => {
  if (!isRenaming.value) return close();
};

const save = async () => {
  if (!(await validate(form.value))) return;
  const renamed = await rename(props.user.id, name.value);
  if (renamed) {
    emit("updated", renamed);
    saved.value = Messages.Admin.renamed(renamed.username);
    return close();
  }
  if (!fieldError.value) return;
  // The API's refusal shows under the field until it's edited.
  setError("name", fieldError.value);
  await nextTick();
  field().focus();
};
</script>

<template>
  <AdminUserAction title="Rename" icon="pencil">
    Changes the name {{ user.username }} goes by on the site. A name another account uses is taken,
    whatever its case.
    <template v-if="!open" #key>
      <BaseButton ref="key" size="sm" variant="secondary" @click="start">Rename</BaseButton>
    </template>
    <template #panel>
      <StatusMessage v-if="saved" class="rename__saved" tone="success">{{ saved }}</StatusMessage>
      <form
        v-if="open"
        ref="form"
        class="rename"
        novalidate
        @submit.prevent="save"
        @keydown.esc="cancel"
      >
        <BaseInput
          v-model="name"
          label="New username"
          autocomplete="off"
          autocapitalize="off"
          :hint="hint"
          :error="errors.name"
          required
          @blur="leave('name')"
        />
        <StatusMessage v-if="renameError" tone="error">{{ renameError }}</StatusMessage>
        <div class="rename__actions">
          <BaseButton
            type="submit"
            size="sm"
            :loading="isRenaming"
            :disabled="isUnchanged"
            :blocked="!isValid"
          >
            {{ isRenaming ? "Saving" : "Save username" }}
          </BaseButton>
          <BaseButton size="sm" variant="ghost" :disabled="isRenaming" @click="cancel">
            Cancel
          </BaseButton>
        </div>
      </form>
    </template>
  </AdminUserAction>
</template>

<style scoped>
.rename__saved,
.rename {
  justify-self: stretch;
  margin-top: var(--sp-2);
}

/* A username is at most 16 characters: the field doesn't need the row's whole width. */
.rename {
  display: grid;
  gap: var(--sp-4);
  max-width: 26rem;
}

.rename__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-2);
}
</style>
