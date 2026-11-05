<script setup lang="ts">
import { computed, nextTick, ref, useId, watch } from "vue";
import { RouterLink, useRoute, useRouter } from "vue-router";
import { Limits } from "@/constants/limits";
import { Messages } from "@/constants/messages";
import { useCountdown } from "@/composables/useCountdown";
import { useRetryHold } from "@/composables/useRetryHold";
import { isLoggedIn, userEmail, userId } from "@/scripts/authentication/authState";
import {
  confirmPasswordReset,
  confirmPasswordResetLink,
  isResetLinkToken,
  requestPasswordReset,
  resetLinkTokenFrom,
  resetLinkUserId,
  type PasswordResetAnswer
} from "@/scripts/authentication/passwordReset";
import {
  confirmationCodeEarlyError,
  confirmationCodeError,
  emailShapeError,
  normalizeEmail,
  passwordEarlyError,
  passwordError
} from "@/scripts/authentication/register";
import { useFormValidation } from "@/composables/useFormValidation";
import { spokenWait } from "@/scripts/utility/durationUtil";
import BaseButton from "@/components/ui/BaseButton.vue";
import BaseInput from "@/components/ui/BaseInput.vue";
import StationBoard from "@/components/ui/StationBoard.vue";
import StatusMessage from "@/components/ui/StatusMessage.vue";

const codeHint = `The ${Limits.Code.digits}-digit code from the e-mail. It works for ${Limits.Code.passwordResetValidMinutes} minutes.`;
const linkIntro = `Choose a new password for your account. The link from the e-mail works once, for ${Limits.Code.passwordResetValidMinutes} minutes after it was sent.`;
const passwordHint = Messages.Auth.passwordHint(
  Limits.Password.minLength,
  Limits.Password.maxLength
);

/** The API allows one code a minute per address. */
const RESEND_SECONDS = Limits.Code.cooldownSeconds;
/**
 * The API answers a resend like the first code, but sends nothing within a minute of the last one,
 * which another tab or a lost countdown can't rule out.
 */
const RESENT_MESSAGE =
  "If an account uses this address, a new code is on its way, unless one was sent in the last minute: then the one before still works.";
/** Back on an address whose code is still recent, with no message of the API's to show again. */
const RECENT_MESSAGE =
  "If an account uses this address, a code was sent to it in the last minute and still works.";

const linkStillWorks = Messages.Auth.resetLinkStillWorks(Limits.Code.passwordResetValidMinutes);

const route = useRoute();
const router = useRouter();

/** A well-formed link's token (see the `route.hash` watcher): set, the board asks only for the new password. */
const linkToken = ref("");
/**
 * What the API made of the link: `refused` it (wrong, expired or used, so only a new one helps), or
 * `limited` it after too many rejected links from this network, without using it up.
 */
const linkAnswer = ref<"" | "refused" | "limited">("");
/**
 * The link limit's wait, which the Reset password key counts down like the code keys' waits. It
 * isn't kept past a reload, which drops the link anyway.
 */
const linkWait = useCountdown();
/** Why a link that came in can't work, shown on the e-mail step it falls back to. */
const linkError = ref("");
/** The logged-in user's address when the link is theirs, for password managers; "" otherwise. */
const linkUsername = computed(() =>
  isLoggedIn.value && resetLinkUserId(linkToken.value) === userId.value ? userEmail.value : ""
);

const email = ref("");
const code = ref("");
const newPassword = ref("");
/** The address on the code step; set, it moves the board there. */
const sentTo = ref("");
/** The last address a code was asked for, which the resend countdown belongs to. */
const lastSentTo = ref("");
/** The message for `lastSentTo`, shown again when the user comes back to it. */
const lastMessage = ref("");
const sentMessage = ref("");
const failure = ref("");
const isSending = ref(false);
const isResetting = ref(false);
const isButtonError = ref(false);
/** The step on the board: its form, or the refused link's message and key. */
const step = ref<HTMLElement>();
const sentMessageId = useId();
const refusedMessageId = useId();
const failureId = useId();
const resend = useCountdown("password-reset-cooldown");
/** After the code checks' 429, Reset password waits for the address; another can go at once. */
const resetHold = useRetryHold(failure);
const resetHeldId = computed(() => normalizeEmail(sentTo.value));
const isResetHeld = computed(() => resetHold.isHeld(resetHeldId.value));
/** Held past the wrong codes' window: the daily cap, which a new code doesn't lift. */
const isResetCapped = computed(
  () => isResetHeld.value && resetHold.seconds.value > Limits.Code.failedChecksWindowSeconds
);
/**
 * After the mail limit's 429 (per IP) on the e-mail step, Send code waits its `retryAfter`, for
 * any address. Nothing was sent, so it isn't the resend countdown, which means a code went out.
 * An address with a recent code needs no request to go back to its code step, so it isn't held.
 */
const sendHold = useRetryHold(failure);
const emailFailureId = useId();
const isSendHeld = computed(
  () =>
    sendHold.isHeld() &&
    !(resend.active.value && normalizeEmail(email.value) === normalizeEmail(lastSentTo.value))
);
/** Each step's error, or why its key is held, also once the error was cleared (Change, a reload of the step). */
const emailFailure = computed(() => sendHold.shown());
const codeFailure = computed(() => resetHold.shown(resetHeldId.value));

const emailChecks = useFormValidation({
  email: { value: email, check: () => emailShapeError(email.value) }
});
const resetChecks = useFormValidation({
  code: {
    value: code,
    check: () => confirmationCodeError(code.value),
    early: () => confirmationCodeEarlyError(code.value)
  },
  newPassword: {
    value: newPassword,
    check: () => passwordError(newPassword.value),
    early: () => passwordEarlyError(newPassword.value)
  }
});
const linkChecks = useFormValidation({
  newPassword: {
    value: newPassword,
    check: () => passwordError(newPassword.value),
    early: () => passwordEarlyError(newPassword.value)
  }
});
const { errors: emailErrors, isValid: isEmailValid, leave: leaveEmail } = emailChecks;
const { errors: resetErrors, isValid: isResetValid, leave: leaveReset } = resetChecks;
const { errors: linkErrors, isValid: isLinkValid, leave: leaveLink } = linkChecks;

/** Only the address the countdown started for has to wait; any other can get a code now. */
const isResendWaiting = computed(
  () => resend.active.value && normalizeEmail(sentTo.value) === normalizeEmail(lastSentTo.value)
);

/** The waiting resend key's spelled-out name, where it keeps the visible label in it. */
const resendName = computed(() =>
  isResendWaiting.value && !isSending.value
    ? spokenWait(
        Messages.EmailCode.sendAgainIn(resend.remaining.value),
        Messages.EmailCode.sendAgainIn(resend.remaining.value, "long")
      )
    : undefined
);
/** Whether the error on show is why the resend key waits, which then describes the key. */
const failureIsWait = computed(
  () => isResendWaiting.value && !!failure.value && failure.value === resend.note.value
);

/** The link step's waiting key's spelled-out name, like the resend key's; not while it resets. */
const linkResetName = computed(() =>
  linkWait.active.value && !isResetting.value
    ? spokenWait(
        Messages.Auth.resetPasswordIn(linkWait.remaining.value),
        Messages.Auth.resetPasswordIn(linkWait.remaining.value, "long")
      )
    : undefined
);

// The link limit's message, and the code it offers meanwhile, only hold until its wait ends.
watch(linkWait.active, (waiting) => {
  if (!waiting && linkAnswer.value === "limited") {
    linkAnswer.value = "";
    failure.value = "";
  }
});

let errorFlash: ReturnType<typeof setTimeout> | undefined;

/** Stops the key's error shake, so it doesn't carry over to the next step's key. */
const clearErrorFlash = () => {
  clearTimeout(errorFlash);
  isButtonError.value = false;
};

const flagError = () => {
  clearErrorFlash();
  isButtonError.value = true;
  errorFlash = setTimeout(() => {
    isButtonError.value = false;
  }, 1000);
};

/** Puts the cursor in the step's first field: the e-mail, or the code. */
const focusFirstField = async () => {
  await nextTick();
  step.value?.querySelector<HTMLInputElement>("input:not([hidden])")?.focus();
};

/**
 * Holds the resend key back for `address`; the wait outlives a reload of the page. `reason` is
 * the mail limit's message when that's what it waits out, kept with it to show again.
 */
const waitBeforeResend = (address: string, seconds: number, reason = "") => {
  lastSentTo.value = address;
  resend.start(seconds, normalizeEmail(address), reason);
};

/** Whether the address on screen is the one the countdown holds back. */
const isWaitShownFor = () =>
  normalizeEmail(sentTo.value || email.value) === normalizeEmail(lastSentTo.value);

// The mail limit's message only holds until its countdown ends, like the key's wait; an error
// about another address, or another error, stays.
watch(resend.active, (waiting) => {
  if (!waiting && failure.value === resend.note.value && isWaitShownFor()) failure.value = "";
});

/** Whether `address` still has to wait for another code, also counting from before a reload. */
const isWaitingFor = (address: string) => {
  if (resend.resume(normalizeEmail(address))) {
    lastSentTo.value = address;
  }
  return resend.active.value && normalizeEmail(address) === normalizeEmail(lastSentTo.value);
};

/** `problem` is an error to show there, e.g. the mail limit a resumed wait is for. */
const showCodeStep = async (message: string, problem = "") => {
  failure.value = problem;
  linkError.value = "";
  sentTo.value = email.value;
  sentMessage.value = message;
  await focusFirstField();
};

/**
 * Asks the API for a code to `address`; returns its message, or null after showing its error.
 * The mail limit's 429 sent no code either, but on the code step it holds the resend key for the
 * limit's wait, with its message.
 */
const askForCode = async (address: string, onCodeStep: boolean) => {
  isSending.value = true;
  failure.value = "";
  try {
    const answer = await requestPasswordReset(address);

    if (answer.error) {
      failure.value = answer.error;
      if (answer.retryAfter && !onCodeStep) {
        // A held key doesn't shake: it says when to try again instead.
        sendHold.start(answer.retryAfter);
        return null;
      }
      if (answer.retryAfter) waitBeforeResend(address, answer.retryAfter, answer.error);
      flagError();
      return null;
    }

    lastMessage.value = answer.message!;
    waitBeforeResend(address, RESEND_SECONDS);
    return answer.message!;
  } finally {
    isSending.value = false;
  }
};

const handleSend = async () => {
  if (!(await emailChecks.validate(step.value))) {
    flagError();
    return;
  }

  // A code went to this address moments ago and the API wouldn't send another yet. A wait for
  // the mail limit says so instead: the last code may be older than a minute. Either way it goes
  // back to the code step without a request, so the mail limit's hold doesn't stand in the way.
  if (isWaitingFor(email.value)) {
    const limit = resend.note.value;
    await showCodeStep(lastMessage.value || (limit ? "" : RECENT_MESSAGE), limit);
    return;
  }
  if (isSendHeld.value) return;

  const message = await askForCode(email.value, false);
  if (message !== null) {
    await showCodeStep(message);
  } else if (isSendHeld.value) {
    // The key is disabled for the wait, which drops its focus.
    await focusFirstField();
  }
};

/** For a code that already arrived, e.g. after a reload: nothing is sent. */
const enterCode = async () => {
  if (await emailChecks.validate(step.value)) {
    // Picks up the countdown, so the key doesn't offer a code the API wouldn't send yet, and
    // says why when it's the mail limit's.
    const waiting = isWaitingFor(email.value);
    await showCodeStep("", waiting ? resend.note.value : "");
  }
};

const sendAgain = async () => {
  if ((await askForCode(sentTo.value, true)) !== null) {
    sentMessage.value = RESENT_MESSAGE;
    // A code typed before was most likely the one that didn't work.
    code.value = "";
    resetChecks.reset();
  }
  // The key is disabled now, which drops focus; the code is what comes next anyway.
  await focusFirstField();
};

/** Back to the e-mail step, keeping the address; the countdown keeps running for it. */
const changeAddress = async () => {
  sentTo.value = "";
  sentMessage.value = "";
  code.value = "";
  newPassword.value = "";
  failure.value = "";
  resetChecks.reset();
  await focusFirstField();
};

/**
 * Checks the step's fields, then sets the password with `send`; done, it's off to /login. After a
 * rate limiter's 429 the step's key is held for `heldId` (see `useRetryHold`), and does nothing
 * until the hold ends.
 */
const submitReset = async (
  checks: typeof resetChecks | typeof linkChecks,
  send: () => Promise<PasswordResetAnswer>,
  hold?: typeof resetHold,
  heldId = ""
) => {
  if (hold?.isHeld(heldId)) return;
  if (!(await checks.validate(step.value))) {
    flagError();
    return;
  }

  isResetting.value = true;
  failure.value = "";
  try {
    const answer = await send();

    if (answer.error) {
      failure.value = answer.error;
      if (answer.retryAfter) {
        // A held key doesn't shake: it says when to try again instead. It's disabled for the
        // wait, which drops its focus.
        hold?.start(answer.retryAfter, heldId);
        await focusFirstField();
      } else {
        flagError();
      }
      return;
    }

    await router.push("/login");
  } finally {
    isResetting.value = false;
  }
};

const handleReset = () =>
  submitReset(
    resetChecks,
    () => confirmPasswordReset(sentTo.value, code.value, newPassword.value),
    resetHold,
    resetHeldId.value
  );

const handleLinkReset = async () => {
  let passwordRefusal = "";
  await submitReset(linkChecks, async () => {
    linkAnswer.value = "";
    const answer = await confirmPasswordResetLink(linkToken.value, newPassword.value);
    if (answer.linkRefused) {
      linkAnswer.value = "refused";
    } else if (answer.retryAfter !== undefined) {
      linkAnswer.value = "limited";
      linkWait.start(answer.retryAfter);
    } else if (answer.passwordRefused) {
      passwordRefusal = answer.error!;
    }
    return answer;
  });

  // The link still works: the refusal belongs to the field, which gets the cursor for another one.
  if (passwordRefusal) {
    failure.value = "";
    linkChecks.setError("newPassword", passwordRefusal);
    await nextTick();
    step.value?.querySelector<HTMLInputElement>('input[type="password"]')?.focus();
  }

  // The form gave way to the key for a new link, which takes the focus the submit key had.
  if (linkAnswer.value === "refused") {
    await nextTick();
    step.value?.querySelector("button")?.focus();
  }

  // The key is disabled for the wait, which drops focus; the password is what's tried again.
  if (linkAnswer.value === "limited") {
    await focusFirstField();
  }
};

/** Empties both password steps, which share the New password field's value. */
const clearPasswordSteps = () => {
  code.value = "";
  newPassword.value = "";
  failure.value = "";
  resetChecks.reset();
  linkChecks.reset();
};

/**
 * Leaves the link for the e-mail step, which mails a new code and link; the address is filled in
 * when the link was the logged-in user's.
 */
const requestNewLink = async () => {
  email.value = linkUsername.value || email.value;
  linkToken.value = "";
  linkAnswer.value = "";
  linkWait.stop();
  // The link's last failed try shook its key; the e-mail step's key has failed nothing.
  clearErrorFlash();
  clearPasswordSteps();
  await focusFirstField();
};

/**
 * Reads the mailed link (`#token=…`), also in a tab already on this page, where only the fragment
 * changes. The token leaves the address bar at once, history entry included, so it isn't kept in
 * the history or shared by copying the URL.
 */
watch(
  () => route.hash,
  async (hash) => {
    const token = resetLinkTokenFrom(hash);
    if (token === null) {
      return;
    }
    void router.replace({ query: route.query, hash: "" });

    const isWellFormed = isResetLinkToken(token);
    linkToken.value = isWellFormed ? token : "";
    linkError.value = isWellFormed ? "" : Messages.Auth.resetLinkMalformed;
    linkAnswer.value = "";
    // A new link is tried afresh: the API says again if the limit still holds.
    linkWait.stop();
    sentTo.value = "";
    sentMessage.value = "";
    clearPasswordSteps();
    // Next comes the new password, or the address to get a link that works.
    await focusFirstField();
  },
  { immediate: true }
);
</script>

<template>
  <StationBoard title="Reset password" as="h1">
    <template v-if="linkToken && linkAnswer === 'refused'">
      <div ref="step" class="form">
        <StatusMessage :id="refusedMessageId" tone="error">{{ failure }}</StatusMessage>
        <!-- Focused as the message appears, so it reads the message out with its name. -->
        <BaseButton block :aria-describedby="refusedMessageId" @click="requestNewLink">
          Request a new link
        </BaseButton>
      </div>
      <div class="alt">
        <p>Remembered it? <RouterLink to="/login">Log in</RouterLink></p>
      </div>
    </template>

    <template v-else-if="linkToken">
      <form ref="step" class="form" novalidate @submit.prevent="handleLinkReset">
        <!-- Tells password managers which login the new password belongs to. -->
        <input
          v-if="linkUsername"
          type="email"
          autocomplete="username"
          :value="linkUsername"
          readonly
          hidden
        />
        <p>{{ linkIntro }}</p>
        <BaseInput
          v-model="newPassword"
          label="New password"
          type="password"
          autocomplete="new-password"
          :hint="passwordHint"
          :error="linkErrors.newPassword"
          required
          @blur="leaveLink('newPassword')"
        />
        <StatusMessage v-if="failure" :id="failureId" tone="error">
          {{ failure }}
          <template v-if="linkAnswer === 'limited'">{{ linkStillWorks }}</template>
        </StatusMessage>
        <BaseButton
          :class="{ 'link-reset__key--waiting': linkWait.active.value }"
          type="submit"
          block
          :loading="isResetting"
          :disabled="linkWait.active.value"
          :blocked="!isLinkValid"
          :error="isButtonError"
          :aria-label="linkResetName"
          :aria-describedby="linkAnswer === 'limited' ? failureId : undefined"
        >
          {{
            isResetting
              ? "Resetting"
              : linkWait.active.value
                ? Messages.Auth.resetPasswordIn(linkWait.remaining.value)
                : "Reset password"
          }}
        </BaseButton>
      </form>
      <div class="alt">
        <p>
          {{ linkAnswer === "limited" ? "Can't wait?" : "Link not working?" }}
          <button type="button" class="link" :disabled="isResetting" @click="requestNewLink">
            {{ linkAnswer === "limited" ? "Get a code instead" : "Request a new one" }}
          </button>
        </p>
        <p>Remembered it? <RouterLink to="/login">Log in</RouterLink></p>
      </div>
    </template>

    <template v-else-if="!sentTo">
      <form ref="step" class="form" novalidate @submit.prevent="handleSend">
        <StatusMessage v-if="linkError" tone="error">{{ linkError }}</StatusMessage>
        <p>Enter your account's e-mail address to get a code and a link for a new password.</p>
        <BaseInput
          v-model="email"
          label="E-mail"
          type="email"
          autocomplete="email"
          :error="emailErrors.email"
          required
          @blur="leaveEmail('email')"
        />
        <StatusMessage
          v-if="emailFailure"
          :id="emailFailureId"
          tone="error"
          :spoken="sendHold.spokenFor()"
          >{{ emailFailure }}</StatusMessage
        >
        <BaseButton
          type="submit"
          block
          :loading="isSending"
          :disabled="isSendHeld"
          :aria-label="isSendHeld ? sendHold.name.value : undefined"
          :aria-describedby="isSendHeld ? emailFailureId : undefined"
          :blocked="!isEmailValid"
          :error="isButtonError"
        >
          {{ isSending ? "Sending" : isSendHeld ? sendHold.label.value : "Send code" }}
        </BaseButton>
      </form>
      <div class="alt">
        <p>
          Already have a code?
          <button type="button" class="link" :disabled="isSending" @click="enterCode">
            Enter it
          </button>
        </p>
        <p>Remembered it? <RouterLink to="/login">Log in</RouterLink></p>
      </div>
    </template>

    <template v-else>
      <form ref="step" class="form" novalidate @submit.prevent="handleReset">
        <!-- Tells password managers which login the new password belongs to. -->
        <input type="email" autocomplete="username" :value="sentTo" readonly hidden />
        <StatusMessage v-if="sentMessage" :id="sentMessageId" tone="info">
          {{ sentMessage }}
        </StatusMessage>
        <div class="sent-to">
          <p class="sent-to__fact">
            <span class="sent-to__label">E-mail</span>
            <span class="sent-to__address">{{ sentTo }}</span>
          </p>
          <BaseButton
            class="sent-to__change"
            variant="ghost"
            size="sm"
            :disabled="isSending"
            @click="changeAddress"
          >
            Change
          </BaseButton>
        </div>
        <BaseInput
          v-model="code"
          label="Code"
          :hint="codeHint"
          :describedby="sentMessage ? sentMessageId : undefined"
          autocomplete="one-time-code"
          inputmode="numeric"
          :error="resetErrors.code"
          mono
          required
          @blur="leaveReset('code')"
        />
        <BaseInput
          v-model="newPassword"
          label="New password"
          type="password"
          autocomplete="new-password"
          :hint="passwordHint"
          :error="resetErrors.newPassword"
          required
          @blur="leaveReset('newPassword')"
        />
        <StatusMessage
          v-if="codeFailure"
          :id="failureId"
          tone="error"
          :spoken="resetHold.spokenFor(resetHeldId)"
          >{{ codeFailure
          }}{{ isResetCapped ? ` ${Messages.EmailCode.capped}` : "" }}</StatusMessage
        >
        <BaseButton
          type="submit"
          block
          :loading="isResetting"
          :disabled="isResetHeld"
          :aria-label="isResetHeld ? resetHold.name.value : undefined"
          :aria-describedby="isResetHeld ? failureId : undefined"
          :blocked="!isResetValid"
          :error="isButtonError"
        >
          {{ isResetting ? "Resetting" : isResetHeld ? resetHold.label.value : "Reset password" }}
        </BaseButton>
      </form>
      <div class="resend">
        <p>No code yet?</p>
        <BaseButton
          class="resend__key"
          variant="secondary"
          size="sm"
          :loading="isSending"
          :disabled="isResendWaiting"
          :aria-label="resendName"
          :aria-describedby="failureIsWait ? failureId : undefined"
          @click="sendAgain"
        >
          {{
            isSending
              ? "Sending"
              : isResendWaiting
                ? Messages.EmailCode.sendAgainIn(resend.remaining.value)
                : "Send again"
          }}
        </BaseButton>
      </div>
    </template>
  </StationBoard>
</template>

<style scoped>
.form {
  display: grid;
  gap: var(--sp-4);
}

.alt,
.resend {
  font-size: var(--fs-sm);
}

.alt {
  display: grid;
  gap: var(--sp-1);
}

/* A button that reads like the links beside it */
.link {
  padding: 0;
  border: 0;
  background: none;
  color: var(--c-action);
  text-decoration: underline;
  text-decoration-thickness: 0.09em;
  text-underline-offset: 0.18em;
  cursor: pointer;
}

.link:hover:not(:disabled) {
  text-decoration-thickness: 0.16em;
}

.link:disabled {
  color: var(--c-ink-soft);
  cursor: not-allowed;
}

.sent-to {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp-3);
  padding-bottom: var(--sp-3);
  border-bottom: var(--edge) solid var(--c-hairline);
}

.sent-to__fact {
  display: grid;
  gap: var(--sp-1);
  min-width: 0;
}

.sent-to__label {
  font-size: var(--fs-sm);
  font-weight: 600;
  color: var(--c-ink-soft);
}

.sent-to__change {
  flex: none;
}

.sent-to__address {
  font-weight: 600;
  overflow-wrap: anywhere;
}

.resend {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: var(--sp-2) var(--sp-3);
  color: var(--c-ink-soft);
}

.resend__key,
.link-reset__key--waiting {
  font-variant-numeric: tabular-nums;
}
</style>
