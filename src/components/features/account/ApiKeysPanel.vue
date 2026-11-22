<script setup lang="ts">
/**
 * The account's API keys (vb2007/vb2007.hu-api#511), on a page of their own: the list, "Create an
 * API key" under it, and new tokens at the top, each shown once. Visitors get a gate once the
 * session is known, like the account page; a token on show stays above it until it's saved.
 */
import { nextTick, ref, useTemplateRef, watch } from "vue";
import { Endpoints } from "@/constants/endpoints";
import { Limits } from "@/constants/limits";
import { Messages } from "@/constants/messages";
import { OauthQuery } from "@/constants/oauth";
import { useConfirmDelete } from "@/composables/useConfirmDelete";
import { useLatestRequest } from "@/composables/useLatestRequest";
import { useOauthError } from "@/composables/useOauthError";
import { useQueryNotice } from "@/composables/useQueryNotice";
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
// Back from GitHub, which "Confirm with GitHub" sent this page to (see `githubReturn`).
const oauthError = useOauthError();
const notice = ref<{ text: string; tone: "success" | "info" } | null>(
  useQueryNotice(OauthQuery.github) === OauthQuery.githubLinked
    ? { text: Messages.ApiKeys.githubConfirmed(Limits.Github.reauthMinutes), tone: "info" }
    : null
);
/**
 * Tokens just made, newest first, each shown once until it's saved: kept here, above the list's
 * reload and the logged-out gate. One per key: a newer token of the same key (rotated again)
 * replaces its panel, and a deleted key's goes, since its token no longer works. Another key's
 * token shows above it rather than replacing a token the API can't show again.
 */
const tokens = ref<
  { id: string; name: string; message: string; token: string; rotated: boolean }[]
>([]);
const creating = ref(false);
const noticeMessage = useTemplateRef<InstanceType<typeof StatusMessage>>("noticeMessage");
const endedMessage = useTemplateRef<InstanceType<typeof StatusMessage>>("endedMessage");
const gateMessage = useTemplateRef<InstanceType<typeof StatusMessage>>("gateMessage");
const opener = useTemplateRef<InstanceType<typeof BaseButton>>("opener");
const capLine = useTemplateRef("capLine");
const createForm = useTemplateRef<InstanceType<typeof ApiKeyForm>>("createForm");
const tokenList = useTemplateRef("tokenList");
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
  if (!ended || tokens.value.length) return;
  await nextTick();
  endedMessage.value?.$el.focus();
});

const onStart = () => {
  oauthError.value = "";
  notice.value = null;
};

/**
 * Where the focus goes once what had it is gone: the create key, or at the cap its line, or the
 * open create form, or on the gate its message.
 */
const focusCreateArea = () =>
  (
    opener.value?.$el ??
    capLine.value ??
    createForm.value?.$el.querySelector("input, select, button") ??
    endedMessage.value?.$el ??
    gateMessage.value?.$el
  )?.focus();

/** Shows an outcome, focused, since the key it came from is gone; then the list catches up. */
const report = async (text: string, tone: "success" | "info") => {
  notice.value = { text, tone };
  await nextTick();
  noticeMessage.value?.$el.focus();
  await load();
};

/** A key gone (deleted here or elsewhere, or rotated elsewhere): its token on show no longer works. */
const onGone = (id: string, text: string, tone: "success" | "info") => {
  tokens.value = tokens.value.filter((each) => each.id !== id);
  return report(text, tone);
};

/** The new token shows before the list reloads, so a slow or failed reload can't hold it back. */
const onToken = (data: ApiKeyTokenResponse, rotated = false) => {
  const { id, name, token } = data.apiKey;
  creating.value = false;
  onStart();
  tokens.value = [
    { id, name, message: data.message, token, rotated },
    ...tokens.value.filter((each) => each.id !== id)
  ];
  return load();
};

/** Saved: its panel goes, and the focus moves to the next one still on show, else on. */
const onTokenSaved = async (id: string) => {
  tokens.value = tokens.value.filter((each) => each.id !== id);
  await nextTick();
  const next = tokenList.value?.querySelector<HTMLElement>("h2");
  if (next) next.focus();
  else focusCreateArea();
};

const startCreate = () => {
  creating.value = true;
  onStart();
};

const closeCreate = async () => {
  creating.value = false;
  await nextTick();
  focusCreateArea();
};
</script>

<template>
  <StationBoard v-if="isLoggedIn" title="API keys" as="h1">
    <template #aside>
      <BaseButton to="/account" size="sm" variant="secondary">Your account</BaseButton>
    </template>
    <div ref="tokenList" class="tokens">
      <ApiKeyTokenPanel
        v-for="shown in tokens"
        :key="shown.token"
        :name="shown.name"
        :message="shown.message"
        :token="shown.token"
        :rotated="shown.rotated"
        @done="onTokenSaved(shown.id)"
      />
    </div>
    <p class="intro">
      For scripts and programs that use the API as you. A key can only do what its scopes allow.
      Creating or rotating one mails you a security notice, and so does deleting one while today's
      notices last.
    </p>
    <StatusMessage v-if="oauthError" tone="error">{{ oauthError }}</StatusMessage>
    <StatusMessage
      v-if="notice"
      ref="noticeMessage"
      class="notice"
      :tone="notice.tone"
      tabindex="-1"
      >{{ notice.text }}</StatusMessage
    >
    <h2 class="list-title">Your keys</h2>
    <StatusMessage v-if="error" tone="error">{{ error }}</StatusMessage>
    <ul v-if="apiKeys.length" class="api-keys" aria-label="Your API keys">
      <ApiKeyRow
        v-for="apiKey in apiKeys"
        :key="apiKey.id"
        :api-key="apiKey"
        :armed="confirmDelete.isArmed(apiKey.id)"
        @start="onStart"
        @press="confirmDelete.press(apiKey.id, $event)"
        @rotated="onToken($event, true)"
        @deleted="onGone(apiKey.id, $event, 'success')"
        @changed="onGone(apiKey.id, $event, 'info')"
      />
    </ul>
    <p v-else-if="loaded && !error" class="intro">No API keys yet.</p>

    <ApiKeyForm
      v-if="creating"
      ref="createForm"
      @done="onToken"
      @cancel="closeCreate"
      @full="load"
    />
    <p
      v-else-if="apiKeys.length >= Limits.ApiKeys.perAccount"
      ref="capLine"
      class="intro"
      tabindex="-1"
    >
      {{ Messages.ApiKeys.atCap(Limits.ApiKeys.perAccount) }}
    </p>
    <BaseButton v-else ref="opener" class="open" size="sm" @click="startCreate">
      <AppIcon name="key" :size="16" /> Create an API key
    </BaseButton>
  </StationBoard>

  <StationBoard v-else-if="isSessionChecked" title="API keys" as="h1">
    <!-- A token shown once stays until it's saved, even when the session ended meanwhile. -->
    <div ref="tokenList" class="tokens">
      <ApiKeyTokenPanel
        v-for="shown in tokens"
        :key="shown.token"
        :name="shown.name"
        :message="shown.message"
        :token="shown.token"
        :rotated="shown.rotated"
        @done="onTokenSaved(shown.id)"
      />
    </div>
    <div class="gate">
      <StatusMessage
        v-if="sessionEnded"
        ref="endedMessage"
        class="notice"
        tone="info"
        tabindex="-1"
        >{{ Messages.Auth.sessionEnded }}</StatusMessage
      >
      <StatusMessage v-else ref="gateMessage" tone="info" tabindex="-1"
        >Log in to manage your API keys.</StatusMessage
      >
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

/* The panels are the board's own rows; the wrapper only lets the page find them. */
.tokens {
  display: contents;
}

.intro {
  font-size: var(--fs-sm);
  color: var(--c-ink-soft);
}

/* The account board's section headings. */
.list-title {
  font-size: 1.25rem;
  letter-spacing: 0.04em;
  line-height: 1.1;
  text-transform: uppercase;
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
