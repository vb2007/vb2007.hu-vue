<script setup lang="ts">
/**
 * Deletes the account once the user confirms with their password, or their username if it has none.
 * Without a password the API may want GitHub to confirm it's them first; the form opens again when
 * they come back from GitHub, with the username to type again.
 */
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  useId,
  useTemplateRef,
  watch
} from "vue";
import { useRouter } from "vue-router";
import { Endpoints } from "@/constants/endpoints";
import { Limits } from "@/constants/limits";
import { Messages } from "@/constants/messages";
import { apiUrl } from "@/scripts/api/client";
import { hasPassword, username } from "@/scripts/authentication/authState";
import { clearDeleteIntent, saveDeleteIntent } from "@/scripts/authentication/deleteIntent";
import { clearSession } from "@/scripts/authentication/user";
import { useAccountDelete } from "@/composables/useAccountDelete";
import { useFormValidation } from "@/composables/useFormValidation";
import AppIcon from "@/components/ui/AppIcon.vue";
import BaseButton from "@/components/ui/BaseButton.vue";
import BaseInput from "@/components/ui/BaseInput.vue";
import StatusMessage from "@/components/ui/StatusMessage.vue";
import { statusTextId } from "@/components/ui/statusMessage";

const props = defineProps<{
  /** Opens the form on arrival: the user is back from GitHub, which confirmed it's them. */
  reopen?: boolean;
}>();

const router = useRouter();
const { isDeleting, deleteError, needsGithub, deleteAccount, hold } = useAccountDelete();
const isHeld = computed(() => hold.isHeld());
/** The refusal, or why the key is held, also once Cancel cleared it and the panel opened again. */
const shownError = computed(() => hold.shown());

const confirming = ref(false);
const confirmation = ref("");
const errorId = useId();
/** Back from GitHub: says how long its confirmation lasts, until the next try or Cancel. */
const githubConfirmed = ref(false);
const confirmedId = useId();
const form = useTemplateRef("form");
const field = useTemplateRef("field");
const opener = useTemplateRef("opener");
const githubKey = useTemplateRef<InstanceType<typeof BaseButton>>("githubKey");
const githubLink = apiUrl(Endpoints.Auth.githubLink);
const describedBy = computed(
  () =>
    [githubConfirmed.value && confirmedId, shownError.value && errorId].filter(Boolean).join(" ") ||
    undefined
);

/** The password typed, or the username matched exactly; until then the key looks disabled. */
const { errors, isValid, leave, validate, reset } = useFormValidation({
  confirmation: {
    value: confirmation,
    check: () => {
      if (hasPassword.value) return confirmation.value ? "" : Messages.Auth.passwordMissing;
      return confirmation.value === username.value ? "" : `That doesn't match “${username.value}”.`;
    }
  }
});

watch(hasPassword, () => {
  confirmation.value = "";
  deleteError.value = "";
  needsGithub.value = false;
  githubConfirmed.value = false;
  reset();
});

const focusField = () => field.value?.$el.querySelector("input").focus();

const open = async () => {
  confirming.value = true;
  await nextTick();
  focusField();
};

const cancel = async () => {
  if (isDeleting.value) return;
  confirming.value = false;
  confirmation.value = "";
  deleteError.value = "";
  needsGithub.value = false;
  githubConfirmed.value = false;
  clearDeleteIntent();
  reset();
  await nextTick();
  opener.value!.$el.focus();
};

/** Remembers the delete for the way back, before the link leaves for GitHub. */
const confirmWithGithub = () => saveDeleteIntent(username.value);

const submit = async () => {
  if (isHeld.value) return;
  if (!(await validate(form.value))) return;
  githubConfirmed.value = false;
  if (!(await deleteAccount(confirmation.value))) {
    if (needsGithub.value) {
      await nextTick();
      githubKey.value?.$el.focus();
    } else if (!form.value?.querySelector(":focus:not(:disabled)")) {
      focusField();
    }
    return;
  }
  await router.push("/");
  clearSession();
};

/**
 * Back from GitHub with the browser's Back key, the page can come back as it was without loading
 * again: the delete wasn't confirmed, so it's forgotten rather than reopened by a later relink.
 */
const onPageShow = (event: PageTransitionEvent) => {
  if (event.persisted) clearDeleteIntent();
};

onMounted(() => {
  window.addEventListener("pageshow", onPageShow);
  if (props.reopen) {
    githubConfirmed.value = true;
    open();
  }
});
onBeforeUnmount(() => window.removeEventListener("pageshow", onPageShow));
</script>

<template>
  <section class="delete" aria-labelledby="delete-title">
    <h2 id="delete-title" class="delete__title">Delete account</h2>
    <p class="delete__note">
      Deleting your account also deletes your pastes, short links and uploads. It can't be undone.
      <template v-if="!hasPassword">{{
        Messages.Account.githubReauthNote(Limits.Github.reauthMinutes)
      }}</template>
    </p>

    <form
      v-if="confirming"
      ref="form"
      class="confirm"
      novalidate
      @submit.prevent="submit"
      @keydown.esc="cancel"
    >
      <StatusMessage v-if="githubConfirmed" :id="confirmedId" tone="info">{{
        Messages.Account.deleteGithubConfirmed(Limits.Github.reauthMinutes)
      }}</StatusMessage>
      <BaseInput
        v-if="hasPassword"
        ref="field"
        v-model="confirmation"
        label="Password"
        type="password"
        autocomplete="current-password"
        :describedby="describedBy"
        :error="errors.confirmation"
        required
        @blur="leave('confirmation')"
      />
      <BaseInput
        v-else
        ref="field"
        v-model="confirmation"
        label="Username"
        :hint="`Type “${username}” to confirm.`"
        :describedby="describedBy"
        autocomplete="off"
        autocapitalize="off"
        spellcheck="false"
        :error="errors.confirmation"
        required
        @blur="leave('confirmation')"
      />
      <StatusMessage
        v-if="shownError"
        :id="errorId"
        :tone="needsGithub ? 'info' : 'error'"
        :spoken="hold.spokenFor()"
        >{{ shownError }}</StatusMessage
      >
      <div class="confirm__actions">
        <BaseButton
          v-if="needsGithub"
          ref="githubKey"
          size="sm"
          :aria-describedby="statusTextId(errorId)"
          :href="githubLink"
          @click="confirmWithGithub"
        >
          <AppIcon name="github" :size="16" />
          Confirm with GitHub
        </BaseButton>
        <BaseButton
          v-else
          type="submit"
          size="sm"
          :error="isValid && !isHeld"
          :disabled="isHeld"
          :aria-label="isHeld ? hold.name.value : undefined"
          :aria-describedby="isHeld ? statusTextId(errorId) : undefined"
          :blocked="!isValid"
          :loading="isDeleting"
        >
          {{ isDeleting ? "Deleting" : isHeld ? hold.label.value : "Delete account" }}
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
