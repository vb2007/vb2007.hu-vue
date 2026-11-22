<script setup lang="ts">
/**
 * The account's API keys (vb2007/vb2007.hu-api#511), on a page of their own: the list, "Create an
 * API key" under it, and a new token at the top, shown once. Visitors get a gate once the session
 * is known, like the account page; a token on show stays above it until it's saved.
 */
import { nextTick, ref, useTemplateRef, watch } from "vue";
import { Endpoints } from "@/constants/endpoints";
import { Limits } from "@/constants/limits";
import { Messages } from "@/constants/messages";
import { useConfirmDelete } from "@/composables/useConfirmDelete";
import { useLatestRequest } from "@/composables/useLatestRequest";
import { apiRequest } from "@/scripts/api/client";
import { isLoggedIn, isSessionChecked, sessionEnded } from "@/scripts/authentication/authState";
import ApiKeyForm from "@/components/features/account/ApiKeyForm.vue";
import ApiKeyRow from "@/components/features/account/ApiKeyRow.vue";
import ApiKeyTokenPanel from "@/components/features/account/ApiKeyTokenPanel.vue";
import AppIcon from "@/components/ui/AppIcon.vue";
import BaseButton from "@/components/ui/BaseButton.vue";
import StationBoard from "@/components/ui/StationBoard.vue";
import StatusMessage from "@/components/ui/StatusMessage.vue";
import type { ApiKey, ApiKeyTokenResponse } from "@/types/api/apiKeys";

const apiKeys = ref<ApiKey[]>([]);
const loaded = ref(false);
const error = ref("");
const notice = ref<{ text: string; tone: "success" | "info" } | null>(null);
/** The token just made, shown once: kept here, above the list's reload and the logged-out gate. */
const token = ref<{ name: string; message: string; token: string } | null>(null);
const creating = ref(false);
const noticeMessage = useTemplateRef<InstanceType<typeof StatusMessage>>("noticeMessage");
const endedMessage = useTemplateRef<InstanceType<typeof StatusMessage>>("endedMessage");
const opener = useTemplateRef<InstanceType<typeof BaseButton>>("opener");
const latest = useLatestRequest();
const confirmDelete = useConfirmDelete();

const load = async () => {
  const signal = latest.next();
  error.value = "";
  const result = await apiRequest(Endpoints.User.apiKeys, {
    failure: Messages.ApiKeys.listFailed,
    signal
  });
  if (signal.aborted) return;
  loaded.value = true;
  if (result.ok) apiKeys.value = result.data.apiKeys;
  else error.value = result.error;
};

watch(
  isLoggedIn,
  (loggedIn) => {
    if (loggedIn) return load();
    latest.next();
    apiKeys.value = [];
    loaded.value = false;
    creating.value = false;
  },
  { immediate: true }
);

// The key that was pressed went with the board, so focus moves to why it went.
watch(sessionEnded, async (ended) => {
  // A token still on show keeps the focus its panel took: it matters more.
  if (!ended || token.value) return;
  await nextTick();
  endedMessage.value?.$el.focus();
});

const onStart = () => {
  notice.value = null;
};

/** Shows an outcome, focused, since the key it came from is gone; then the list catches up. */
const report = async (text: string, tone: "success" | "info") => {
  notice.value = { text, tone };
  await nextTick();
  noticeMessage.value?.$el.focus();
  await load();
};

/** The new token shows before the list reloads, so a slow or failed reload can't hold it back. */
const onToken = (data: ApiKeyTokenResponse) => {
  creating.value = false;
  notice.value = null;
  token.value = { name: data.apiKey.name, message: data.message, token: data.apiKey.token };
  return load();
};

const onTokenSaved = async () => {
  token.value = null;
  await nextTick();
  (opener.value?.$el ?? endedMessage.value?.$el)?.focus();
};

const startCreate = () => {
  creating.value = true;
  onStart();
};

const closeCreate = async () => {
  creating.value = false;
  await nextTick();
  opener.value?.$el.focus();
};
</script>

<template>
  <StationBoard v-if="isLoggedIn" title="API keys" as="h1">
    <template #aside>
      <BaseButton to="/account" size="sm" variant="ghost">Your account</BaseButton>
    </template>
    <ApiKeyTokenPanel
      v-if="token"
      :name="token.name"
      :message="token.message"
      :token="token.token"
      @done="onTokenSaved"
    />
    <p class="intro">
      For scripts and programs that use the API as you. A key can only do what its scopes allow, and
      creating, rotating or deleting one mails you a security notice.
    </p>
    <StatusMessage
      v-if="notice"
      ref="noticeMessage"
      class="notice"
      :tone="notice.tone"
      tabindex="-1"
      >{{ notice.text }}</StatusMessage
    >
    <StatusMessage v-if="error" tone="error">{{ error }}</StatusMessage>
    <ul v-if="apiKeys.length" class="api-keys" aria-label="Your API keys">
      <ApiKeyRow
        v-for="apiKey in apiKeys"
        :key="apiKey.id"
        :api-key="apiKey"
        :armed="confirmDelete.isArmed(apiKey.id)"
        @start="onStart"
        @press="confirmDelete.press(apiKey.id, $event)"
        @rotated="onToken"
        @deleted="report($event, 'success')"
        @changed="report($event, 'info')"
      />
    </ul>
    <p v-else-if="loaded && !error" class="intro">No API keys yet.</p>

    <ApiKeyForm v-if="creating" @done="onToken" @cancel="closeCreate" @full="load" />
    <p v-else-if="apiKeys.length >= Limits.ApiKeys.perAccount" class="intro">
      {{ Messages.ApiKeys.atCap(Limits.ApiKeys.perAccount) }}
    </p>
    <BaseButton v-else ref="opener" class="open" size="sm" @click="startCreate">
      <AppIcon name="key" :size="16" /> Create an API key
    </BaseButton>
  </StationBoard>

  <StationBoard v-else-if="isSessionChecked" title="API keys" as="h1">
    <!-- A token shown once stays until it's saved, even when the session ended meanwhile. -->
    <ApiKeyTokenPanel
      v-if="token"
      :name="token.name"
      :message="token.message"
      :token="token.token"
      @done="onTokenSaved"
    />
    <div class="gate">
      <StatusMessage
        v-if="sessionEnded"
        ref="endedMessage"
        class="notice"
        tone="info"
        tabindex="-1"
        >{{ Messages.Auth.sessionEnded }}</StatusMessage
      >
      <StatusMessage v-else tone="info">Log in to manage your API keys.</StatusMessage>
      <div class="gate__keys">
        <BaseButton to="/login">Log in</BaseButton>
        <BaseButton to="/register" variant="secondary">Register</BaseButton>
      </div>
    </div>
  </StationBoard>
</template>

<style scoped>
.notice {
  scroll-margin-top: calc(var(--nav-h) + var(--sp-4));
}

.intro {
  font-size: var(--fs-sm);
  color: var(--c-ink-soft);
}

.api-keys {
  display: grid;
  margin: 0;
  padding: 0;
  list-style: none;
}

.open {
  justify-self: start;
}

.gate {
  display: grid;
  justify-items: start;
  gap: var(--sp-4);
}

.gate__keys {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-3);
}
</style>
