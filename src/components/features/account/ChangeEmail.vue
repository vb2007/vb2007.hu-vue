<script setup lang="ts">
import { computed, nextTick, ref, useId, useTemplateRef } from "vue";
import { Limits } from "@/constants/limits";
import { Messages } from "@/constants/messages";
import { useChangeEmail } from "@/composables/useChangeEmail";
import { pendingEmail, userEmail } from "@/scripts/authentication/authState";
import {
  confirmationCodeEarlyError,
  confirmationCodeError,
  emailError,
  normalizeEmail,
  requiredError
} from "@/scripts/authentication/register";
import { useFormValidation } from "@/composables/useFormValidation";
import { spokenWait } from "@/scripts/utility/durationUtil";
import BaseButton from "@/components/ui/BaseButton.vue";
import BaseInput from "@/components/ui/BaseInput.vue";
import StatusMessage from "@/components/ui/StatusMessage.vue";
import { statusTextId } from "@/components/ui/statusMessage";

const codeHint = `The code works for ${Limits.Code.emailChangeValidMinutes} minutes from when it was sent. Nothing yet? Check your spam folder, or get a new one with Change e-mail.`;

const emit = defineEmits<{ start: [] }>();

const {
  isChanging,
  changeError,
  changeMessage,
  change,
  isConfirming,
  codeError,
  confirmError,
  confirm,
  sendWait,
  showWait,
  confirmHold
} = useChangeEmail();
const { remaining: waitSeconds, active: isWaiting } = sendWait;
const isConfirmHeld = computed(() => confirmHold.isHeld());
const confirmErrorId = useId();

const open = ref(false);
const email = ref("");
const password = ref("");
const code = ref("");

const addressError = (address: string) => {
  const problem = emailError(address);
  if (problem) return problem;
  if (normalizeEmail(address) === normalizeEmail(userEmail.value)) {
    return "That's already your e-mail address.";
  }
  return "";
};

const changeChecks = useFormValidation({
  email: { value: email, check: () => addressError(email.value) },
  password: {
    value: password,
    check: () => requiredError(password.value, "Enter your current password.")
  }
});
const codeChecks = useFormValidation({
  code: {
    value: code,
    check: () => confirmationCodeError(code.value),
    early: () => confirmationCodeEarlyError(code.value)
  }
});
const { errors: changeErrors, isValid: isChangeValid, leave: leaveChange } = changeChecks;
const { errors: codeErrors, isValid: isCodeValid, leave: leaveCode } = codeChecks;

/** Ties the code field to the waiting address it confirms. */
const pendingId = useId();
const changeErrorId = useId();

/** The waiting key's spelled-out name, where it keeps the visible label in it. */
const sendName = computed(() =>
  isWaiting.value && !isChanging.value
    ? spokenWait(
        Messages.EmailCode.sendCodeIn(waitSeconds.value),
        Messages.EmailCode.sendCodeIn(waitSeconds.value, "long")
      )
    : undefined
);
/** Whether the error on show is why the key waits, which then describes the key. */
const errorIsWait = computed(
  () => isWaiting.value && !!changeError.value && changeError.value === sendWait.note.value
);

const key = useTemplateRef("key");
const form = useTemplateRef("form");
const codeForm = useTemplateRef("codeForm");
const droppedMessage = useTemplateRef("droppedMessage");
const emailField = useTemplateRef("emailField");
const passwordField = useTemplateRef("passwordField");
const codeField = useTemplateRef("codeField");

const focusField = (field: { $el: HTMLElement } | null) =>
  field?.$el.querySelector("input")!.focus();

/** While a change waits, the form starts from its address, so a new code is one password away. */
const start = async () => {
  changeMessage.value = "";
  codeError.value = "";
  confirmError.value = "";
  email.value = pendingEmail.value;
  changeChecks.reset();
  codeChecks.reset();
  // A key that still waits (e.g. after a reload, or the form was closed) says why again.
  showWait();
  open.value = true;
  emit("start");
  await nextTick();
  focusField(pendingEmail.value ? passwordField.value : emailField.value);
};

const reset = () => {
  open.value = false;
  email.value = "";
  password.value = "";
  changeChecks.reset();
  changeError.value = "";
};

const close = async () => {
  reset();
  await nextTick();
  key.value?.$el.focus();
};

const cancel = () => {
  if (!isChanging.value) return close();
};

const save = async () => {
  if (isWaiting.value) return;
  if (!(await changeChecks.validate(form.value))) return;
  if (await change(email.value.trim(), password.value)) {
    if (!pendingEmail.value) return close();
    // A code is on its way, so its field is what comes next.
    reset();
    code.value = "";
    codeError.value = "";
    codeChecks.reset();
    await nextTick();
    return focusField(codeField.value);
  }
  if (!form.value?.contains(document.activeElement)) focusField(emailField.value);
};

const confirmCode = async () => {
  if (isConfirmHeld.value) return;
  if (!(await codeChecks.validate(codeForm.value))) return;
  emit("start");
  if (await confirm(code.value.replace(/\s/g, ""))) {
    code.value = "";
    codeChecks.reset();
  }
  await nextTick();
  if (!pendingEmail.value) {
    // The code step is gone and the page shrank, so what scrolled into view may be below the
    // message, which would hide under the navbar. A refusal that took the change away takes the
    // focus (and scrolls clear of the navbar); a confirmation leaves it on the key.
    return (confirmError.value ? droppedMessage.value : key.value)?.$el.focus();
  }
  if (!codeForm.value?.querySelector(":focus:not(:disabled)")) focusField(codeField.value);
};
</script>

<template>
  <StatusMessage v-if="changeMessage" class="change__saved" tone="success">
    {{ changeMessage }}
  </StatusMessage>
  <!-- A refusal that took the waiting change away; one that keeps it shows in the code form. -->
  <StatusMessage
    v-if="confirmError && !pendingEmail"
    ref="droppedMessage"
    class="change__saved change__dropped"
    tone="error"
    tabindex="-1"
  >
    {{ confirmError }}
  </StatusMessage>

  <StatusMessage v-if="pendingEmail" :id="pendingId" class="change__pending" tone="info">
    Waiting for confirmation:
    <strong class="change__address">{{ pendingEmail }}</strong>
  </StatusMessage>

  <form
    v-if="pendingEmail && !open"
    ref="codeForm"
    class="change"
    novalidate
    @submit.prevent="confirmCode"
  >
    <BaseInput
      ref="codeField"
      v-model="code"
      label="Confirmation code"
      inputmode="numeric"
      autocomplete="one-time-code"
      :hint="codeHint"
      :describedby="pendingId"
      :error="codeErrors.code || codeError"
      mono
      required
      @update:model-value="codeError = ''"
      @blur="leaveCode('code')"
    />
    <!-- A held key keeps its reason, also once opening the e-mail form cleared the error. -->
    <StatusMessage
      v-if="confirmHold.shown()"
      :id="confirmErrorId"
      tone="error"
      :spoken="confirmHold.spokenFor()"
      >{{ confirmHold.shown() }}</StatusMessage
    >
    <div class="change__actions">
      <BaseButton
        type="submit"
        size="sm"
        :loading="isConfirming"
        :disabled="isConfirmHeld"
        :aria-label="isConfirmHeld ? confirmHold.name.value : undefined"
        :aria-describedby="isConfirmHeld ? statusTextId(confirmErrorId) : undefined"
        :blocked="!isCodeValid"
      >
        {{ isConfirming ? "Confirming" : isConfirmHeld ? confirmHold.label.value : "Confirm code" }}
      </BaseButton>
      <BaseButton ref="key" size="sm" variant="secondary" :disabled="isConfirming" @click="start">
        Change e-mail
      </BaseButton>
    </div>
  </form>

  <BaseButton
    v-else-if="!open"
    ref="key"
    class="change__key"
    size="sm"
    variant="secondary"
    @click="start"
  >
    Change e-mail
  </BaseButton>

  <form v-else ref="form" class="change" novalidate @submit.prevent="save" @keydown.esc="cancel">
    <BaseInput
      ref="emailField"
      v-model="email"
      label="New e-mail"
      type="email"
      autocomplete="email"
      :hint="pendingEmail ? 'A new code replaces the one already sent.' : undefined"
      :error="changeErrors.email"
      required
      @blur="leaveChange('email')"
    />
    <BaseInput
      ref="passwordField"
      v-model="password"
      label="Current password"
      type="password"
      autocomplete="current-password"
      :error="changeErrors.password"
      required
      @blur="leaveChange('password')"
    />
    <StatusMessage v-if="changeError" :id="changeErrorId" tone="error">{{
      changeError
    }}</StatusMessage>
    <div class="change__actions">
      <BaseButton
        type="submit"
        size="sm"
        :loading="isChanging"
        :disabled="isWaiting"
        :aria-label="sendName"
        :aria-describedby="errorIsWait ? statusTextId(changeErrorId) : undefined"
        :blocked="!isChangeValid"
      >
        {{
          isChanging
            ? "Sending"
            : isWaiting
              ? Messages.EmailCode.sendCodeIn(waitSeconds)
              : "Send code"
        }}
      </BaseButton>
      <BaseButton size="sm" variant="ghost" :disabled="isChanging" @click="cancel">
        Cancel
      </BaseButton>
    </div>
  </form>
</template>

<style scoped>
.change__saved,
.change__pending,
.change__key,
.change {
  margin-top: var(--sp-2);
}

.change__saved,
.change__pending,
.change {
  justify-self: stretch;
}

/* Focused when a refused code took the waiting change away; clear of the sticky navbar. */
.change__dropped {
  scroll-margin-top: calc(var(--nav-h) + var(--sp-4));
}

/* The new address, so a typo is easy to spot; it moves to the next line whole, and only an
   address wider than the line breaks. */
.change__address {
  display: inline-block;
  max-width: 100%;
  font-weight: 600;
  overflow-wrap: anywhere;
}

.change {
  display: grid;
  gap: var(--sp-4);
}

.change__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-2);
}
</style>
