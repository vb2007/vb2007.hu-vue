<script setup lang="ts">
/**
 * Creating an API key, or rotating `apiKey` (vb2007/vb2007.hu-api#511), in two steps in place:
 * the details (a new key's name and scopes, and its lifetime), checked here before anything is
 * sent, then `ReauthForm`, whose key sends them with the password. Cancel on the confirmation goes
 * back to the details, kept. The answer carries the token, which `done` hands on to show once.
 * The deep link's `prefill` fills a new key's name and scopes in, and names the scopes left out.
 */
import { computed, nextTick, onMounted, ref, useId, useTemplateRef } from "vue";
import { useRoute, useRouter } from "vue-router";
import { ApiKeyLinkQuery } from "@/constants/auth";
import { Endpoints } from "@/constants/endpoints";
import { HttpStatus, REAUTH_QUIET_STATUSES } from "@/constants/http";
import { Limits } from "@/constants/limits";
import { Messages } from "@/constants/messages";
import { useFormValidation } from "@/composables/useFormValidation";
import { apiRequest } from "@/scripts/api/client";
import { isSuperuser } from "@/scripts/authentication/authState";
import {
  apiKeyNameEarlyError,
  apiKeyNameError,
  grantableScopes,
  lifetimeDaysOf,
  lifetimeError,
  lifetimeOf,
  SCOPE_AREAS,
  type ApiKeyPrefill,
  type LifetimeChoice
} from "@/scripts/authentication/apiKeys";
import ReauthForm from "@/components/features/account/ReauthForm.vue";
import BaseButton from "@/components/ui/BaseButton.vue";
import BaseCheckbox from "@/components/ui/BaseCheckbox.vue";
import BaseInput from "@/components/ui/BaseInput.vue";
import BaseSelect from "@/components/ui/BaseSelect.vue";
import StatusMessage from "@/components/ui/StatusMessage.vue";
import type { ApiKey, ApiKeyScope, ApiKeyTokenResponse } from "@/types/api/apiKeys";
import type { MfaPasswordBody } from "@/types/api/mfa";

/** Without `apiKey` it creates one. */
const props = defineProps<{ apiKey?: ApiKey; prefill?: ApiKeyPrefill }>();
const emit = defineEmits<{
  done: [data: ApiKeyTokenResponse];
  cancel: [];
  /** A create's 409: the account has the most keys it can, so the list is out of date. */
  full: [];
  /** A rotate's 404 or 409: the key was deleted or rotated elsewhere; the form closes. */
  changed: [message: string];
}>();

const route = useRoute();
const router = useRouter();
const rotating = !!props.apiKey;
const step = ref<"details" | "confirm">("details");
const name = ref(props.prefill?.name ?? "");
const scopes = ref<ApiKeyScope[]>(props.prefill?.scopes ?? []);
const choice = ref<LifetimeChoice>(rotating ? "keep" : "days");
const days = ref(String(Limits.ApiKeys.expiryDefaultDays));
const form = useTemplateRef("form");
const scopesErrorId = useId();
const leftOutId = useId();

// A select rather than segmented keys: three of them don't fit a key's row at 320 px.
const choices: { value: LifetimeChoice; label: string }[] = [
  ...(rotating ? [{ value: "keep" as const, label: "Keep its lifetime" }] : []),
  { value: "days", label: "After a number of days" },
  { value: "never", label: "Never" }
];

/** What "Keep its lifetime" keeps: the rotated key's lifetime, counted again from now. */
const kept = computed(() => {
  const lifetime = props.apiKey && lifetimeDaysOf(props.apiKey);
  return lifetime === null
    ? "It still never expires."
    : `It expires ${lifetime} ${lifetime === 1 ? "day" : "days"} from now again.`;
});

/**
 * Where "Confirm with GitHub" comes back to: this page, and for a create its deep link built from
 * the details as they are, so the form opens again as it was left (its lifetime back at the default).
 */
const githubReturn = computed(() =>
  rotating
    ? route.fullPath
    : router.resolve({
        query: {
          ...route.query,
          [ApiKeyLinkQuery.open]: "1",
          [ApiKeyLinkQuery.keyName]: name.value,
          [ApiKeyLinkQuery.scopes]: scopes.value.join()
        }
      }).fullPath
);

/** Each area's scopes this account may give, the areas without any left out. */
const areas = SCOPE_AREAS.map(({ area, label }) => ({
  label,
  scopes: grantableScopes(isSuperuser.value).filter((scope) => scope.startsWith(`${area}:`))
})).filter(({ scopes }) => scopes.length);

const toggle = (scope: ApiKeyScope, on: boolean) => {
  scopes.value = on
    ? Limits.ApiKeys.scopes.filter((each) => each === scope || scopes.value.includes(each))
    : scopes.value.filter((each) => each !== scope);
};

const { errors, isValid, leave, validate } = useFormValidation({
  name: {
    value: name,
    check: () => (rotating ? "" : apiKeyNameError(name.value)),
    early: () => (rotating ? "" : apiKeyNameEarlyError(name.value))
  },
  scopes: {
    value: computed(() => scopes.value.join()),
    check: () => (rotating || scopes.value.length ? "" : Messages.ApiKeys.scopesMissing)
  },
  days: { value: days, check: () => lifetimeError(choice.value, days.value) }
});

const focusFirst = async () => {
  await nextTick();
  form.value?.querySelector<HTMLElement>("input, select")?.focus();
};

const toConfirm = async () => {
  if (await validate(form.value)) {
    step.value = "confirm";
    return;
  }
  // No field is marked invalid when only the scopes are missing: the first box takes the cursor.
  if (!errors.value.name && errors.value.scopes) {
    form.value?.querySelector<HTMLElement>(".key-form__scopes input")?.focus();
  }
};

const back = () => {
  step.value = "details";
  return focusFirst();
};

const send = async (body: MfaPasswordBody) => {
  // Left out (`undefined` isn't sent) when rotating with "Keep current": the key keeps its lifetime.
  const expiresInDays = lifetimeOf(choice.value, days.value);
  if (!props.apiKey) {
    const result = await apiRequest(Endpoints.User.createApiKey, {
      body: { ...body, name: name.value.trim(), scopes: scopes.value, expiresInDays },
      failure: Messages.ApiKeys.createFailed,
      // The day's mail for its notice used up (`mailBudgetOf`): an answer, not a fault.
      quietStatuses: [...REAUTH_QUIET_STATUSES, HttpStatus.ServiceUnavailable]
    });
    if (!result.ok && result.status === HttpStatus.Conflict) emit("full");
    return result;
  }
  const result = await apiRequest(Endpoints.User.rotateApiKey, {
    params: { id: props.apiKey.id },
    body: { ...body, expiresInDays },
    failure: Messages.ApiKeys.rotateFailed,
    // A wrong or missing password, GitHub to confirm, a key gone or changed, the day's mail used
    // up: answers, not faults.
    quietStatuses: [...REAUTH_QUIET_STATUSES, HttpStatus.NotFound, HttpStatus.ServiceUnavailable]
  });
  if (
    !result.ok &&
    (result.status === HttpStatus.NotFound || result.status === HttpStatus.Conflict)
  ) {
    emit("changed", result.error);
  }
  return result;
};

onMounted(focusFirst);
</script>

<template>
  <form
    v-if="step === 'details'"
    ref="form"
    class="key-form"
    novalidate
    @submit.prevent="toConfirm"
    @keydown.esc="emit('cancel')"
  >
    <template v-if="!rotating">
      <BaseInput
        v-model="name"
        label="Name"
        :hint="`What uses it, like “Deploy script”. Up to ${Limits.ApiKeys.nameMaxLength} characters.`"
        :error="errors.name"
        required
        @blur="leave('name')"
      />
      <fieldset
        class="key-form__scopes"
        :aria-describedby="
          [prefill?.dropped.length && leftOutId, errors.scopes && scopesErrorId]
            .filter(Boolean)
            .join(' ') || undefined
        "
      >
        <legend class="key-form__legend">Scopes</legend>
        <p class="key-form__note">
          Each lets the key make one kind of request. Write doesn't include read.
        </p>
        <StatusMessage v-if="prefill?.dropped.length" :id="leftOutId" tone="info">{{
          Messages.ApiKeys.scopesLeftOut(prefill.dropped)
        }}</StatusMessage>
        <div
          v-for="area in areas"
          :key="area.label"
          class="key-form__area"
          role="group"
          :aria-label="area.label"
        >
          <span class="key-form__area-name" aria-hidden="true">{{ area.label }}</span>
          <BaseCheckbox
            v-for="scope in area.scopes"
            :key="scope"
            :label="scope.endsWith(':read') ? 'Read' : 'Write'"
            :model-value="scopes.includes(scope)"
            @update:model-value="toggle(scope, $event)"
          />
        </div>
        <p v-if="errors.scopes" :id="scopesErrorId" class="key-form__error" role="alert">
          {{ errors.scopes }}
        </p>
      </fieldset>
    </template>

    <div class="key-form__lifetime">
      <BaseSelect
        v-model="choice"
        :label="rotating ? 'New lifetime' : 'Expires'"
        size="sm"
        :options="choices"
      />
      <BaseInput
        v-if="choice === 'days'"
        v-model="days"
        label="Days from now"
        inputmode="numeric"
        :hint="`${Limits.ApiKeys.expiryMinDays} to ${Limits.ApiKeys.expiryMaxDays} days.`"
        :error="errors.days"
        required
        @blur="leave('days')"
      />
      <p v-else-if="choice === 'keep'" class="key-form__note">{{ kept }}</p>
      <p v-else class="key-form__note">
        It works until you delete or rotate it. A password reset, a suspension or the admin deletes
        it too.
      </p>
    </div>

    <div class="key-form__keys">
      <BaseButton type="submit" size="sm" :blocked="!isValid">Continue</BaseButton>
      <BaseButton size="sm" variant="ghost" @click="emit('cancel')">Cancel</BaseButton>
    </div>
  </form>
  <ReauthForm
    v-else
    :send="send"
    :submit-label="rotating ? 'Rotate key' : 'Create key'"
    :busy-label="rotating ? 'Rotating' : 'Creating'"
    :hint="
      rotating
        ? 'Confirms it\'s you. The current token stops working at once, and the new one shows only once.'
        : 'Confirms it\'s you. The key\'s token then shows only once.'
    "
    :github-return="githubReturn"
    @done="emit('done', $event)"
    @cancel="back"
  />
</template>

<style scoped>
.key-form {
  justify-self: stretch;
  display: grid;
  gap: var(--sp-4);
  margin-top: var(--sp-2);
}

.key-form__scopes {
  display: grid;
  gap: var(--sp-2);
  min-width: 0;
  margin: 0;
  padding: 0;
  border: 0;
}

.key-form__legend {
  padding: 0;
  margin-bottom: var(--sp-1);
  font-size: var(--fs-sm);
  font-weight: 600;
  letter-spacing: 0.02em;
}

.key-form__note {
  font-size: var(--fs-sm);
  color: var(--c-ink-soft);
}

/* One area a line: its name, then Read and Write in columns that line up; a name too long for
   what's left at 320 px wraps within its own cell, never pushing Write under it. */
.key-form__area {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  align-items: center;
  gap: var(--sp-2) var(--sp-4);
  padding: var(--sp-2) 0;
  border-bottom: var(--edge) solid var(--c-hairline);
}

.key-form__area-name {
  font-weight: 600;
  overflow-wrap: anywhere;
}

.key-form__error {
  font-size: var(--fs-sm);
  font-weight: 600;
  color: var(--c-danger);
}

.key-form__lifetime {
  display: grid;
  justify-items: start;
  gap: var(--sp-3);
}

.key-form__lifetime > :deep(.field) {
  justify-self: stretch;
  max-width: 14rem;
}

.key-form__keys {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-2);
}
</style>
