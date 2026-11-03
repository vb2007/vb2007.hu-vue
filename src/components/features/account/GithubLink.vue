<script setup lang="ts">
/**
 * The GitHub row's key, which links or unlinks GitHub once the account's password confirms it in
 * place (vb2007/vb2007.hu-api#243). An account made with GitHub has no password: it links without
 * one, and gets no key once linked, since GitHub is then its only way to log in.
 */
import { computed, nextTick, ref, useId, useTemplateRef } from "vue";
import { githubLinked, hasPassword, userEmail } from "@/scripts/authentication/authState";
import { requiredError } from "@/scripts/authentication/register";
import { useFormValidation } from "@/composables/useFormValidation";
import { useGithubLink } from "@/composables/useGithubLink";
import { useGithubUnlink } from "@/composables/useGithubUnlink";
import BaseButton from "@/components/ui/BaseButton.vue";
import BaseInput from "@/components/ui/BaseInput.vue";
import StatusMessage from "@/components/ui/StatusMessage.vue";

const emit = defineEmits<{ start: []; unlinked: [] }>();

const { isLinking, linkError, link } = useGithubLink();
const { isUnlinking, unlinkError, unlink } = useGithubUnlink();

const open = ref(false);
const password = ref("");
const errorId = useId();
const form = useTemplateRef("form");
const field = useTemplateRef("field");
const opener = useTemplateRef("opener");

const { errors, isValid, leave, validate, reset } = useFormValidation({
  password: { value: password, check: () => requiredError(password.value, "Enter your password.") }
});

const isBusy = computed(() => isLinking.value || isUnlinking.value);
const confirmError = computed(() => (githubLinked.value ? unlinkError.value : linkError.value));

const focusField = () => field.value?.$el.querySelector("input").focus();

const start = async () => {
  emit("start");
  // Nothing to confirm with: GitHub itself confirms it's them.
  if (!hasPassword.value) return link();
  linkError.value = unlinkError.value = "";
  open.value = true;
  await nextTick();
  focusField();
};

const close = () => {
  open.value = false;
  password.value = "";
  reset();
  linkError.value = unlinkError.value = "";
};

/** Not while a request is out, nor once GitHub is on its way. */
const cancel = async () => {
  if (isBusy.value) return;
  close();
  await nextTick();
  opener.value?.$el.focus();
};

const submit = async () => {
  if (!(await validate(form.value))) return;
  if (githubLinked.value) {
    if (await unlink(password.value)) {
      close();
      emit("unlinked");
      return;
    }
  } else if (await link(password.value)) {
    // The browser is leaving for GitHub; the form stays as it is, its keys disabled.
    return;
  }
  // The clicked key disabled while it worked, which dropped the focus.
  if (!form.value?.contains(document.activeElement)) focusField();
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
      :hint="githubLinked ? undefined : 'GitHub opens next, to approve the link.'"
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
        :error="githubLinked && isValid"
        :blocked="!isValid"
        :loading="isBusy"
      >
        <template v-if="githubLinked">{{ isUnlinking ? "Unlinking" : "Unlink GitHub" }}</template>
        <template v-else>{{ isLinking ? "Opening GitHub" : "Continue to GitHub" }}</template>
      </BaseButton>
      <BaseButton size="sm" variant="ghost" :disabled="isBusy" @click="cancel">Cancel</BaseButton>
    </div>
  </form>

  <BaseButton
    v-else-if="!githubLinked || hasPassword"
    ref="opener"
    class="github__key"
    size="sm"
    :variant="githubLinked ? 'secondary' : 'primary'"
    :loading="isLinking"
    @click="start"
  >
    <template v-if="githubLinked">Unlink GitHub</template>
    <template v-else>{{ isLinking ? "Opening GitHub" : "Link GitHub" }}</template>
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
