<script setup lang="ts">
/**
 * The GitHub row's key, which links or unlinks GitHub once the account's password confirms it in
 * place (vb2007/vb2007.hu-api#243). An account made with GitHub has no password: it links without
 * one, and gets no key once linked, since GitHub is then its only way to log in.
 */
import { computed, nextTick, onUpdated, ref, useId, useTemplateRef, watch } from "vue";
import { Messages } from "@/constants/messages";
import { githubLinked, hasPassword, userEmail } from "@/scripts/authentication/authState";
import { requiredError } from "@/scripts/authentication/register";
import { useFormValidation } from "@/composables/useFormValidation";
import { useGithubLink } from "@/composables/useGithubLink";
import { useGithubUnlink } from "@/composables/useGithubUnlink";
import AppIcon from "@/components/ui/AppIcon.vue";
import BaseButton from "@/components/ui/BaseButton.vue";
import BaseInput from "@/components/ui/BaseInput.vue";
import StatusMessage from "@/components/ui/StatusMessage.vue";

const LINK_HINT = "Confirms it's you. GitHub opens next, to approve the link.";
const UNLINK_HINT = "Confirms it's you. Afterwards you log in with your password only.";

const emit = defineEmits<{ start: []; unlinked: [] }>();

const { isLinking, isStalled, linkError, link, stop, hold: linkHold } = useGithubLink();
const { isUnlinking, unlinkError, unlink, hold: unlinkHold } = useGithubUnlink();

const open = ref(false);
const password = ref("");
const errorId = useId();
const form = useTemplateRef("form");
const field = useTemplateRef("field");
const opener = useTemplateRef("opener");

const { errors, isValid, leave, validate, reset } = useFormValidation({
  password: {
    value: password,
    check: () => requiredError(password.value, Messages.Auth.passwordMissing)
  }
});

/** The confirm key waits on a request, or on the browser leaving for GitHub. */
const isBusy = computed(() => isLinking.value || isUnlinking.value);
/** A start that hasn't stalled: one that should have left by now may be given up on. */
const isLeaving = computed(() => isLinking.value && !isStalled.value);
/** Cancel waits too, but not on a navigation that should have happened by now. */
const isCancelBlocked = computed(() => isUnlinking.value || isLeaving.value);
const confirmError = computed(() => (githubLinked.value ? unlinkError.value : linkError.value));
/** The hold after the password checks' 429 that the key on screen waits for. */
const hold = computed(() => (githubLinked.value ? unlinkHold : linkHold));
const isHeld = computed(() => hold.value.isHeld());

const focusField = () => field.value?.$el.querySelector("input").focus();

const start = async () => {
  emit("start");
  if (!hasPassword.value) {
    // Defensive: an account made with GitHub can't unlink it, so it's only unlinked if the API
    // dropped the link itself. Nothing to confirm with: GitHub itself confirms it's them.
    // A start that stalled is given up on first, so this one can begin.
    stop();
    if (await link()) return;
    // The key disabled while it worked, which dropped the focus.
    await nextTick();
    opener.value?.$el.focus();
    return;
  }
  linkError.value = unlinkError.value = "";
  open.value = true;
  await nextTick();
  focusField();
};

const forgetPassword = () => {
  password.value = "";
  reset();
};

const close = () => {
  open.value = false;
  forgetPassword();
  stop();
  linkError.value = unlinkError.value = "";
};

const cancel = async () => {
  if (isCancelBlocked.value) return;
  close();
  await nextTick();
  opener.value?.$el.focus();
};

/*
 * GitHub linked or unlinked from elsewhere (e.g. in another tab, seen once Back restores this page
 * and reloads the account) would turn an open form into the other one by itself, so it closes.
 * Sync, so an unlink's own change is still seen as its own: that one closes the form itself.
 * Focus in the form goes to the key once it's drawn again.
 */
let refocusOpener = false;
watch(
  githubLinked,
  () => {
    if (!open.value || isUnlinking.value) return;
    refocusOpener = Boolean(form.value?.contains(document.activeElement));
    close();
  },
  { flush: "sync" }
);
onUpdated(() => {
  if (!refocusOpener) return;
  refocusOpener = false;
  opener.value?.$el.focus();
});

const submit = async () => {
  if (isHeld.value) return;
  if (!(await validate(form.value))) return;
  if (githubLinked.value) {
    if (await unlink(password.value)) {
      close();
      emit("unlinked");
      return;
    }
  } else if (await link(password.value)) {
    // The browser is leaving for GitHub. Coming back with Back may restore this page as it is,
    // so the password goes now.
    forgetPassword();
    return;
  }
  // The clicked key disabled while it worked, which dropped the focus.
  if (!form.value?.querySelector(":focus:not(:disabled)")) focusField();
};
</script>

<template>
  <StatusMessage v-if="linkError && !open" class="github__error" tone="error">{{
    linkError
  }}</StatusMessage>

  <form
    v-if="open"
    ref="form"
    class="github__confirm"
    novalidate
    @submit.prevent="submit"
    @keydown.esc="cancel"
  >
    <input type="email" autocomplete="username" :value="userEmail" readonly hidden />
    <BaseInput
      ref="field"
      v-model="password"
      label="Password"
      type="password"
      autocomplete="current-password"
      :hint="githubLinked ? UNLINK_HINT : LINK_HINT"
      :describedby="confirmError ? errorId : undefined"
      :error="errors.password"
      required
      @blur="leave('password')"
    />
    <StatusMessage v-if="confirmError" :id="errorId" tone="error">{{ confirmError }}</StatusMessage>
    <div class="github__actions">
      <BaseButton
        type="submit"
        size="sm"
        :error="githubLinked && isValid && !isHeld"
        :disabled="isHeld"
        :blocked="!isValid"
        :loading="isBusy"
      >
        <template v-if="isHeld">{{ Messages.tryAgainIn(hold.remaining.value) }}</template>
        <template v-else-if="githubLinked">{{
          isUnlinking ? "Unlinking" : "Unlink GitHub"
        }}</template>
        <template v-else>
          <AppIcon name="github" :size="16" />
          {{ isLinking ? "Opening GitHub" : "Continue to GitHub" }}
        </template>
      </BaseButton>
      <BaseButton size="sm" variant="ghost" :disabled="isCancelBlocked" @click="cancel">
        Cancel
      </BaseButton>
    </div>
  </form>

  <BaseButton
    v-else-if="!githubLinked || hasPassword"
    ref="opener"
    class="github__key"
    size="sm"
    :variant="githubLinked ? 'secondary' : 'primary'"
    :loading="isLeaving"
    :disabled="!hasPassword && isHeld"
    @click="start"
  >
    <template v-if="githubLinked">Unlink GitHub</template>
    <template v-else-if="!hasPassword && isHeld">{{
      Messages.tryAgainIn(hold.remaining.value)
    }}</template>
    <template v-else>{{ isLeaving ? "Opening GitHub" : "Link GitHub" }}</template>
  </BaseButton>
</template>

<style scoped>
.github__error,
.github__key,
.github__confirm {
  margin-top: var(--sp-2);
}

.github__error,
.github__confirm {
  justify-self: stretch;
}

.github__confirm {
  display: grid;
  gap: var(--sp-4);
}

.github__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-2);
}
</style>
