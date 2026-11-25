<script setup lang="ts">
/**
 * ShareX in one step (vb2007/vb2007.hu-api#573): "Set up ShareX" confirms it's the user
 * (`ReauthForm`), loads the API's three custom uploaders, creates a key with only the scopes they
 * need, and downloads each file with the key's token in place of the placeholder. The files load
 * first, so a failure there costs no key, nor a security notice. The token shows once, like a new
 * key's, and lives only here and in the files' Blob URLs: never stored, put in a URL or logged.
 */
import { nextTick, onBeforeUnmount, ref, useTemplateRef, watch } from "vue";
import { Endpoints } from "@/constants/endpoints";
import { ContentType, HttpStatus, REAUTH_QUIET_STATUSES } from "@/constants/http";
import { Limits } from "@/constants/limits";
import { Messages } from "@/constants/messages";
import { OauthQuery } from "@/constants/oauth";
import { Sharex, type SharexUploaderId } from "@/constants/sharex";
import { useOauthError } from "@/composables/useOauthError";
import { useQueryNotice } from "@/composables/useQueryNotice";
import { apiRequest, type ApiResult } from "@/scripts/api/client";
import { isLoggedIn, isSessionChecked, sessionEnded } from "@/scripts/authentication/authState";
import ApiKeyTokenPanel from "@/components/features/account/ApiKeyTokenPanel.vue";
import ReauthForm from "@/components/features/account/ReauthForm.vue";
import AppIcon from "@/components/ui/AppIcon.vue";
import BaseButton from "@/components/ui/BaseButton.vue";
import StationBoard from "@/components/ui/StationBoard.vue";
import StatusMessage from "@/components/ui/StatusMessage.vue";
import type { ApiKeyTokenResponse } from "@/types/api/apiKeys";
import type { MfaPasswordBody } from "@/types/api/mfa";

const PATH = "/account/sharex";

// Back from GitHub, which "Confirm with GitHub" sent this page to (see `githubReturn`).
const oauthError = useOauthError();
const notice = ref(
  useQueryNotice(OauthQuery.github) === OauthQuery.githubLinked
    ? Messages.Sharex.githubConfirmed(Limits.Github.reauthMinutes)
    : ""
);
const confirming = ref(false);
/** The API's 409: the account has the most keys it can, so none was made. */
const full = ref(false);
const created = ref<{ message: string; token: string } | null>(null);
const files = ref<{ id: SharexUploaderId; url: string }[]>([]);
/** The loaded files, with the placeholder, until the key's token fills them in. */
let loaded: string[] = [];
const opener = useTemplateRef<InstanceType<typeof BaseButton>>("opener");
const capLine = useTemplateRef("capLine");
const downloads = useTemplateRef("downloads");
const endedMessage = useTemplateRef<InstanceType<typeof StatusMessage>>("endedMessage");
const gateMessage = useTemplateRef<InstanceType<typeof StatusMessage>>("gateMessage");

/** Which uploader each of ShareX's Destinations slots takes, in ShareX's order. */
const slots = Sharex.uploaders.flatMap(({ name, slots }) => slots.map((slot) => ({ slot, name })));

const send = async (body: MfaPasswordBody): Promise<ApiResult<ApiKeyTokenResponse>> => {
  const results = await Promise.all(
    Sharex.uploaders.map(({ id }) =>
      apiRequest(Endpoints.Sharex[id], { failure: Messages.Sharex.filesFailed })
    )
  );
  const texts: string[] = [];
  for (const result of results) {
    if (!result.ok) return result;
    const text = JSON.stringify(result.data, null, 2);
    if (!text.includes(Sharex.tokenPlaceholder)) {
      return {
        ok: false,
        kind: "http",
        status: result.status,
        error: Messages.Sharex.placeholderMissing,
        body: null
      };
    }
    texts.push(text);
  }

  const result = await apiRequest(Endpoints.User.createApiKey, {
    body: { ...body, name: Sharex.keyName, scopes: [...Sharex.keyScopes] },
    failure: Messages.ApiKeys.createFailed,
    quietStatuses: REAUTH_QUIET_STATUSES
  });
  if (result.ok) loaded = texts;
  else if (result.status === HttpStatus.Conflict) full.value = true;
  return result;
};

const forgetFiles = () => {
  files.value.forEach(({ url }) => URL.revokeObjectURL(url));
  files.value = [];
};

/** The files get the token and download at once; their links stay for a browser that blocked some. */
const onCreated = async (data: ApiKeyTokenResponse) => {
  const { token } = data.apiKey;
  confirming.value = false;
  notice.value = "";
  oauthError.value = "";
  forgetFiles();
  files.value = Sharex.uploaders.map(({ id }, i) => ({
    id,
    url: URL.createObjectURL(
      new Blob([loaded[i].split(Sharex.tokenPlaceholder).join(token)], { type: ContentType.Json })
    )
  }));
  loaded = [];
  created.value = { message: data.message, token };
  await nextTick();
  downloads.value?.querySelectorAll("a").forEach((link) => link.click());
};

const focusAction = async () => {
  await nextTick();
  (
    opener.value?.$el ??
    capLine.value ??
    endedMessage.value?.$el ??
    gateMessage.value?.$el
  )?.focus();
};

const onSaved = () => {
  created.value = null;
  forgetFiles();
  return focusAction();
};

const start = () => {
  confirming.value = true;
  notice.value = "";
  oauthError.value = "";
};

const cancel = () => {
  confirming.value = false;
  return focusAction();
};

// The cap's line takes the place of the form that met it.
watch(full, (isFull) => isFull && focusAction());

watch(isLoggedIn, (loggedIn) => {
  if (loggedIn) return;
  confirming.value = false;
  full.value = false;
});

// The key that was pressed went with the session, so focus moves to why it went, unless a token
// on show has it: that matters more.
watch(sessionEnded, (ended) => ended && !created.value && focusAction());

onBeforeUnmount(forgetFiles);
</script>

<template>
  <StationBoard v-if="isLoggedIn || isSessionChecked" title="ShareX" as="h1">
    <template v-if="isLoggedIn" #aside>
      <BaseButton to="/account" size="sm" variant="secondary">Your account</BaseButton>
    </template>

    <!-- A token shown once stays until it's saved, even when the session ended meanwhile. -->
    <ApiKeyTokenPanel
      v-if="created"
      :name="Sharex.keyName"
      :message="created.message"
      :token="created.token"
      @done="onSaved"
    >
      <p class="note">
        The three files below have it filled in, and your browser should have downloaded them. If it
        held any back, download them here:
      </p>
      <ul ref="downloads" class="downloads" aria-label="Your ShareX files">
        <li v-for="file in files" :key="file.id">
          <BaseButton
            size="sm"
            variant="secondary"
            :href="file.url"
            :download="Sharex.fileName(file.id)"
          >
            <AppIcon name="download" :size="16" />
            {{ Sharex.fileName(file.id) }}
          </BaseButton>
        </li>
      </ul>
    </ApiKeyTokenPanel>

    <template v-if="isLoggedIn">
      <p class="intro">
        Send screenshots, files, text and links from ShareX on Windows to your account. Setting it
        up creates an API key named “{{ Sharex.keyName }}” that can only upload files, create pastes
        and shorten links, and downloads three uploader files with its token in them. Creating the
        key mails you a security notice. What ShareX uploads is public to anyone with its link.
      </p>
      <StatusMessage v-if="oauthError" tone="error">{{ oauthError }}</StatusMessage>
      <StatusMessage v-if="notice" tone="info">{{ notice }}</StatusMessage>

      <div v-if="full" class="cap">
        <p ref="capLine" class="intro" tabindex="-1">
          {{ Messages.ApiKeys.atCap(Limits.ApiKeys.perAccount) }}
        </p>
        <BaseButton to="/account/api-keys" size="sm" variant="secondary">
          Manage API keys <AppIcon name="arrow" :size="16" />
        </BaseButton>
      </div>
      <ReauthForm
        v-else-if="confirming"
        :send="send"
        submit-label="Create key"
        busy-label="Creating"
        hint="Confirms it's you. The key's token then shows only once, and the three files download with it."
        :github-return="PATH"
        @done="onCreated"
        @cancel="cancel"
      />
      <BaseButton v-else ref="opener" class="open" @click="start">
        <AppIcon name="download" :size="18" /> Set up ShareX
      </BaseButton>

      <h2 class="title">In ShareX</h2>
      <ol class="steps">
        <li>
          Import each file: double-click it, or in ShareX open Destinations → Custom uploader
          settings → Import.
        </li>
        <li>
          Under Destinations, pick the uploader for each slot:
          <dl class="slots">
            <div v-for="each in slots" :key="each.slot" class="slots__row">
              <dt>{{ each.slot }}</dt>
              <dd>{{ each.name }}</dd>
            </div>
          </dl>
        </li>
        <li>Try each one with Test in Custom uploader settings.</li>
      </ol>
      <p class="warning">
        <AppIcon name="alert" :size="18" />
        <span
          >A slot left on another uploader sends the wrong request: ShareX then says “Unsupported
          request format JSON”.</span
        >
      </p>
    </template>

    <div v-else class="gate">
      <StatusMessage v-if="oauthError" tone="error">{{ oauthError }}</StatusMessage>
      <StatusMessage v-if="sessionEnded" ref="endedMessage" tone="info" tabindex="-1">{{
        Messages.Auth.sessionEnded
      }}</StatusMessage>
      <StatusMessage v-else ref="gateMessage" tone="info" tabindex="-1"
        >Log in to set up ShareX.</StatusMessage
      >
      <div class="gate__keys">
        <BaseButton to="/login">Log in</BaseButton>
        <BaseButton to="/register" variant="secondary">Register</BaseButton>
      </div>
    </div>
  </StationBoard>
</template>

<style scoped>
.intro,
.note {
  font-size: var(--fs-sm);
  color: var(--c-ink-soft);
}

.downloads {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

/* File names as they're saved, not uppercased like a label; one word, which breaks anywhere rather
   than widening the panel at 320 px. */
.downloads :deep(.btn) {
  max-width: 100%;
  font-family: var(--font-code);
  font-size: var(--fs-sm);
  letter-spacing: 0;
  text-transform: none;
  overflow-wrap: anywhere;
}

.cap {
  display: grid;
  justify-items: start;
  gap: var(--sp-3);
}

.open {
  justify-self: start;
}

/* The account board's section headings. */
.title {
  font-size: 1.25rem;
  letter-spacing: 0.04em;
  line-height: 1.1;
  text-transform: uppercase;
}

.steps {
  display: grid;
  gap: var(--sp-3);
  margin: 0;
  padding-left: 1.5em;
}

.steps ::marker {
  font-weight: 700;
}

/* Slot, then its uploader, a line each on a hairline divider; stacked when they don't fit. */
.slots {
  display: grid;
  margin: var(--sp-2) 0 0;
}

.slots__row {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 0 var(--sp-4);
  padding: var(--sp-2) 0;
  border-bottom: var(--edge) solid var(--c-hairline);
}

.slots dt {
  color: var(--c-ink-soft);
}

.slots dd {
  margin: 0;
  font-weight: 600;
}

.warning {
  display: flex;
  align-items: flex-start;
  gap: var(--sp-2);
  font-size: var(--fs-sm);
  font-weight: 600;
}

.warning > :first-child {
  flex: none;
  margin-top: 0.15em;
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
