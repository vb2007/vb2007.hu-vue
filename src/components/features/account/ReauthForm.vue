<script setup lang="ts" generic="T">
/**
 * Confirms it's the user before an MFA setting changes (vb2007/vb2007.hu-api#448): the password,
 * or for an account made with GitHub nothing to type, as a GitHub login or relink in the last
 * minutes confirms it (else the API's 403 offers "Confirm with GitHub"). `send` makes the request
 * with that body (and `quietStatuses: REAUTH_QUIET_STATUSES`) and `done` hands on its answer.
 * Every MFA setting takes the same check: turning a method on or off, new recovery codes, adding
 * or deleting a passkey; and so do creating and rotating an API key (vb2007/vb2007.hu-api#511),
 * whose `send` adds the key's details to the body. Each names its key and hint through the props.
 * A limiter's 429, and the 503 of the day's used-up mail a key's notice needs
 * (vb2007/vb2007.hu-api#612), hold the key for their wait: the API changed nothing.
 */
import { computed, nextTick, onMounted, ref, useId, useTemplateRef } from "vue";
import { HttpStatus } from "@/constants/http";
import { Limits } from "@/constants/limits";
import { Messages } from "@/constants/messages";
import { mailBudgetOf, retryAfterFrom } from "@/composables/useCountdown";
import { useFormValidation } from "@/composables/useFormValidation";
import { useGithubLink } from "@/composables/useGithubLink";
import { useRetryHold } from "@/composables/useRetryHold";
import type { ApiResult } from "@/scripts/api/client";
import { hasPassword, userEmail } from "@/scripts/authentication/authState";
import { clearDeleteIntent } from "@/scripts/authentication/deleteIntent";
import { clearGithubReturn, saveGithubReturn } from "@/scripts/authentication/githubReturn";
import AppIcon from "@/components/ui/AppIcon.vue";
import BaseButton from "@/components/ui/BaseButton.vue";
import BaseInput from "@/components/ui/BaseInput.vue";
import StatusMessage from "@/components/ui/StatusMessage.vue";
import { statusTextId } from "@/components/ui/statusMessage";
import type { MfaPasswordBody } from "@/types/api/mfa";

const props = defineProps<{
  send: (body: MfaPasswordBody) => Promise<ApiResult<T>>;
  /** The submit key, e.g. "Turn off", and while it works, e.g. "Turning off". */
  submitLabel: string;
  busyLabel: string;
  /** Under the password field: what the change does. */
  hint: string;
  /** The key turns red once armed, for a change that weakens the login. */
  danger?: boolean;
  /** Where "Confirm with GitHub" comes back to, when not the account page (see `githubReturn`). */
  githubReturn?: string;
}>();
const emit = defineEmits<{ done: [data: T]; cancel: [] }>();

const password = ref("");
const isSending = ref(false);
const error = ref("");
/** The API wants a fresh GitHub login or relink first. */
const needsGithub = ref(false);
const hold = useRetryHold(error);
const isHeld = computed(() => hold.isHeld());
const shownError = computed(() => hold.shown());
const errorId = useId();
const hintId = useId();
const form = useTemplateRef("form");
const githubKey = useTemplateRef<InstanceType<typeof BaseButton>>("githubKey");
/**
 * The relink that has GitHub confirm it's them. Only this form's confirmation is remembered for the
 * way back, just before leaving.
 */
const {
  isLinking,
  isStalled,
  linkError,
  link,
  stop,
  hold: linkHold
} = useGithubLink((url) => {
  clearDeleteIntent();
  if (props.githubReturn) saveGithubReturn(props.githubReturn);
  else clearGithubReturn();
  window.location.assign(url);
});
/** A start that hasn't stalled: one that should have left by now may be tried again. */
const isLeaving = computed(() => isLinking.value && !isStalled.value);
const isLinkHeld = computed(() => linkHold.isHeld());
const linkErrorId = useId();
/** The GitHub key reads its step's message, and why the start failed while that shows. */
const githubDescribedBy = computed(() =>
  linkHold.shown() ? `${statusTextId(errorId)} ${statusTextId(linkErrorId)}` : statusTextId(errorId)
);

const { errors, isValid, leave, validate } = useFormValidation({
  password: {
    value: password,
    check: () => (!hasPassword.value || password.value ? "" : Messages.Auth.passwordMissing)
  }
});

/** The field, or without one the first key: where the cursor goes. */
const focusFirst = () =>
  form.value?.querySelector<HTMLElement>("input[type=password], button:not(:disabled)")?.focus();

const submit = async () => {
  if (isHeld.value || isSending.value || !(await validate(form.value))) return;
  isSending.value = true;
  error.value = linkError.value = "";
  needsGithub.value = false;
  const result = await props.send(hasPassword.value ? { password: password.value } : {});
  isSending.value = false;

  if (result.ok) {
    password.value = "";
    emit("done", result.data);
    return;
  }
  error.value = result.error;
  needsGithub.value =
    !hasPassword.value &&
    result.status === HttpStatus.Forbidden &&
    result.error.startsWith(Messages.Account.githubReauthPrefix);
  const wait =
    result.status === HttpStatus.TooManyRequests
      ? retryAfterFrom(result.body)
      : mailBudgetOf(result);
  if (wait !== undefined) hold.start(wait);
  await nextTick();
  if (needsGithub.value) githubKey.value?.$el.focus();
  else if (!form.value?.querySelector(":focus:not(:disabled)")) focusFirst();
};

const confirmWithGithub = async () => {
  // A start that stalled is given up on first, so this one can begin.
  stop();
  if (await link()) return;
  // The key disabled while it worked, which dropped the focus; a held key stays disabled.
  await nextTick();
  if (isLinkHeld.value) focusFirst();
  else githubKey.value?.$el.focus();
};

const cancel = () => {
  if (!isSending.value && !isLeaving.value) emit("cancel");
};

onMounted(focusFirst);
</script>

<template>
  <form ref="form" class="reauth" novalidate @submit.prevent="submit" @keydown.esc="cancel">
    <!-- Tells password managers whose password it is. -->
    <input
      v-if="hasPassword"
      class="visually-hidden"
      type="email"
      autocomplete="username"
      :value="userEmail"
      readonly
      tabindex="-1"
      aria-hidden="true"
    />
    <BaseInput
      v-if="hasPassword"
      v-model="password"
      label="Password"
      type="password"
      autocomplete="current-password"
      :hint="hint"
      :describedby="shownError ? statusTextId(errorId) : undefined"
      :error="errors.password"
      required
      @blur="leave('password')"
    />
    <p v-else :id="hintId" class="reauth__note">
      {{ hint }} {{ Messages.Account.githubReauthNote(Limits.Github.reauthMinutes) }}
    </p>
    <StatusMessage
      v-if="shownError"
      :id="errorId"
      :tone="needsGithub ? 'info' : 'error'"
      :spoken="hold.spokenFor()"
      >{{ shownError }}</StatusMessage
    >
    <StatusMessage
      v-if="needsGithub && linkHold.shown()"
      :id="linkErrorId"
      tone="error"
      :spoken="linkHold.spokenFor()"
      >{{ linkHold.shown() }}</StatusMessage
    >
    <div class="reauth__actions">
      <BaseButton
        v-if="needsGithub"
        ref="githubKey"
        size="sm"
        :aria-label="isLinkHeld ? linkHold.name.value : undefined"
        :aria-describedby="githubDescribedBy"
        :loading="isLeaving"
        :disabled="isLinkHeld"
        @click="confirmWithGithub"
      >
        <template v-if="isLinkHeld">{{ linkHold.label.value }}</template>
        <template v-else>
          <AppIcon name="github" :size="16" />
          {{ isLeaving ? "Opening GitHub" : "Confirm with GitHub" }}
        </template>
      </BaseButton>
      <BaseButton
        v-else
        type="submit"
        size="sm"
        :error="danger && isValid && !isHeld"
        :disabled="isHeld"
        :aria-label="isHeld ? hold.name.value : undefined"
        :aria-describedby="isHeld ? statusTextId(errorId) : hasPassword ? undefined : hintId"
        :blocked="!isValid"
        :loading="isSending"
      >
        {{ isSending ? busyLabel : isHeld ? hold.label.value : submitLabel }}
      </BaseButton>
      <BaseButton size="sm" variant="ghost" :disabled="isSending || isLeaving" @click="cancel">
        Cancel
      </BaseButton>
    </div>
  </form>
</template>

<style scoped>
/* Opens in place under the row's note, like the GitHub row's password form. */
.reauth {
  justify-self: stretch;
  display: grid;
  gap: var(--sp-4);
  margin-top: var(--sp-2);
}

.reauth__note {
  font-size: var(--fs-sm);
  color: var(--c-ink-soft);
}

.reauth__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-2);
}
</style>
