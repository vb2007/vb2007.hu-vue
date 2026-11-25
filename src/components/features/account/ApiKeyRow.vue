<script setup lang="ts">
/**
 * One API key of the account (vb2007/vb2007.hu-api#511): its name, the token's last characters,
 * its scopes and dates, and Rotate (`ApiKeyForm`, confirmed) and Delete (two clicks, no password).
 */
import { computed, nextTick, ref, useTemplateRef } from "vue";
import { Endpoints } from "@/constants/endpoints";
import { HttpStatus } from "@/constants/http";
import { Messages } from "@/constants/messages";
import { apiRequest } from "@/scripts/api/client";
import { apiKeyDates } from "@/scripts/authentication/apiKeys";
import ApiKeyForm from "@/components/features/account/ApiKeyForm.vue";
import AppIcon from "@/components/ui/AppIcon.vue";
import BaseButton from "@/components/ui/BaseButton.vue";
import ConfirmDeleteButton from "@/components/ui/ConfirmDeleteButton.vue";
import StatusMessage from "@/components/ui/StatusMessage.vue";
import StatusPill from "@/components/ui/StatusPill.vue";
import type { ApiKey, ApiKeyTokenResponse } from "@/types/api/apiKeys";

const props = defineProps<{
  apiKey: ApiKey;
  /** Its delete key waits for the second click (the list's one `useConfirmDelete`). */
  armed: boolean;
}>();
const emit = defineEmits<{
  /** A form opened: older notices go. */
  start: [];
  /** Delete pressed: arms it, or once armed, `remove` deletes it. */
  press: [remove: () => Promise<void>];
  rotated: [data: ApiKeyTokenResponse];
  deleted: [message: string];
  /** The API's 404 or a rotate's 409: deleted or rotated elsewhere meanwhile. */
  changed: [message: string];
}>();

const rotating = ref(false);
const deleting = ref(false);
const error = ref("");
const rotateKey = useTemplateRef<InstanceType<typeof BaseButton>>("rotateKey");

const dates = computed(() => apiKeyDates(props.apiKey));
const expired = computed(() => dates.value[1].expired);

const startRotate = () => {
  error.value = "";
  rotating.value = true;
  emit("start");
};

const closeRotate = async () => {
  rotating.value = false;
  await nextTick();
  rotateKey.value?.$el.focus();
};

const onRotated = (data: ApiKeyTokenResponse) => {
  rotating.value = false;
  emit("rotated", data);
};

const onChanged = (message: string) => {
  rotating.value = false;
  emit("changed", message);
};

const remove = async () => {
  deleting.value = true;
  error.value = "";
  const result = await apiRequest(Endpoints.User.removeApiKey, {
    params: { id: props.apiKey.id },
    failure: Messages.ApiKeys.deleteFailed,
    quietStatuses: [HttpStatus.NotFound]
  });
  deleting.value = false;
  if (result.ok) emit("deleted", result.data.message);
  else if (result.status === HttpStatus.NotFound) emit("changed", result.error);
  else error.value = result.error;
};
</script>

<template>
  <li class="api-key">
    <span class="api-key__mark"><AppIcon name="key" :size="22" /></span>
    <div class="api-key__main">
      <div class="api-key__head">
        <h3 class="api-key__name">{{ apiKey.name }}</h3>
        <StatusPill v-if="expired" tone="danger" icon="alert">Expired</StatusPill>
      </div>
      <p class="api-key__hint">
        <span class="visually-hidden">Token ending in </span><span aria-hidden="true">…</span
        >{{ apiKey.hint }}
      </p>
      <ul class="api-key__scopes" :aria-label="`Scopes of ${apiKey.name}`">
        <li v-for="scope in apiKey.scopes" :key="scope" class="api-key__scope">{{ scope }}</li>
      </ul>
      <!-- The dots are hidden from screen readers, which hear commas instead; a no-break space
           keeps each with the fact after it, never alone at a line's end. -->
      <p class="api-key__dates">
        <template v-for="(fact, index) in dates" :key="index"
          ><template v-if="index"
            ><span class="visually-hidden">, </span
            ><span aria-hidden="true"> ·&nbsp;</span></template
          >{{ fact.text }}</template
        >
      </p>

      <ApiKeyForm
        v-if="rotating"
        :api-key="apiKey"
        @done="onRotated"
        @cancel="closeRotate"
        @changed="onChanged"
      />
      <template v-else>
        <StatusMessage v-if="error" class="api-key__error" tone="error">{{ error }}</StatusMessage>
        <div class="api-key__keys">
          <BaseButton
            ref="rotateKey"
            size="sm"
            variant="secondary"
            :aria-label="`Rotate ${apiKey.name}`"
            @click="startRotate"
          >
            <AppIcon name="key" :size="16" /> Rotate
          </BaseButton>
          <ConfirmDeleteButton :armed="armed" :busy="deleting" icon @click="emit('press', remove)">
            <span class="visually-hidden"> {{ apiKey.name }}</span>
          </ConfirmDeleteButton>
        </div>
      </template>
    </div>
  </li>
</template>

<style scoped>
.api-key {
  display: flex;
  align-items: flex-start;
  gap: var(--sp-4);
  padding: var(--sp-3) 0;
  border-bottom: var(--edge) solid var(--c-hairline);
}

/* The passkey rows' tile. */
.api-key__mark {
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

.api-key__main {
  flex: 1;
  min-width: 0;
  display: grid;
  justify-items: start;
  gap: var(--sp-1);
}

.api-key__head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--sp-2) var(--sp-3);
}

/* A name the user chose: kept as typed, like a passkey's. */
.api-key__name {
  font-size: 1.0625rem;
  font-weight: 600;
  line-height: 1.25;
  overflow-wrap: anywhere;
}

.api-key__hint {
  font-family: var(--font-code);
  font-size: var(--fs-sm);
  color: var(--c-ink-soft);
}

/* The API's own scope names, as its 403 names a missing one. */
.api-key__scopes {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-1);
  margin: 0;
  padding: 0;
  list-style: none;
}

.api-key__scope {
  padding: 0 var(--sp-2);
  border: var(--edge) solid var(--c-hairline);
  border-radius: var(--radius-sm);
  background: var(--c-panel-sunk);
  font-family: var(--font-code);
  font-size: var(--fs-sm);
  line-height: 1.6;
}

.api-key__dates {
  font-size: var(--fs-sm);
  color: var(--c-ink-soft);
}

.api-key__error {
  justify-self: stretch;
  margin-top: var(--sp-2);
}

.api-key__keys {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-2);
  margin-top: var(--sp-2);
}
</style>
