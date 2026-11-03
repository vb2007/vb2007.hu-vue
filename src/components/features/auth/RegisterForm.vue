<script setup lang="ts">
import {
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
  computed,
  nextTick,
  useId,
  useTemplateRef
} from "vue";
import { RouterLink } from "vue-router";
import { RegisterStatus } from "@/constants/auth";
import { Limits } from "@/constants/limits";
import { Messages } from "@/constants/messages";
import { isLoggedIn } from "@/scripts/authentication/authState";
import {
  checkUsername,
  confirmationCodeEarlyError,
  confirmationCodeError,
  emailError,
  passwordEarlyError,
  passwordError,
  passwordMatchEarlyError,
  passwordMatchError,
  register,
  registerFieldOf,
  registerStatus,
  USERNAME_CHECK_DELAY,
  usernameEarlyError,
  usernameError
} from "@/scripts/authentication/register";
import { restoreSession } from "@/scripts/authentication/user";
import { useFormValidation } from "@/composables/useFormValidation";
import {
  RESEND_COOLDOWN_SECONDS,
  useRegisterCode,
  type CodeNotice
} from "@/composables/useRegisterCode";
import GithubLogin from "@/components/features/auth/GithubLogin.vue";
import BaseButton from "@/components/ui/BaseButton.vue";
import BaseInput from "@/components/ui/BaseInput.vue";
import StationBoard from "@/components/ui/StationBoard.vue";
import StatusMessage from "@/components/ui/StatusMessage.vue";

const USERNAME_TAKEN = "That username is taken.";

const username = ref("");
const email = ref("");
const password = ref("");
const confirmPassword = ref("");
const code = ref("");
const isLoading = ref(false);
const isButtonError = ref(false);
/** Set once the API said the typed username is taken; cleared by the next edit. */
const usernameTaken = ref(false);

const {
  errors,
  isValid,
  leave: leaveField,
  validate,
  setError,
  reset: resetChecks
} = useFormValidation({
  email: { value: email, check: () => emailError(email.value) },
  username: {
    value: username,
    check: () => usernameError(username.value) || (usernameTaken.value ? USERNAME_TAKEN : ""),
    early: () => (usernameTaken.value ? USERNAME_TAKEN : usernameEarlyError(username.value))
  },
  password: {
    value: password,
    check: () => passwordError(password.value),
    early: () => passwordEarlyError(password.value)
  },
  confirmPassword: {
    value: confirmPassword,
    check: () => passwordMatchError(password.value, confirmPassword.value),
    early: () => passwordMatchEarlyError(password.value, confirmPassword.value)
  }
});

const {
  errors: codeErrors,
  isValid: isCodeValid,
  leave: leaveCode,
  validate: validateCode,
  reset: resetCode
} = useFormValidation({
  code: {
    value: code,
    check: () => confirmationCodeError(code.value),
    early: () => confirmationCodeEarlyError(code.value)
  }
});

const {
  email: codeEmail,
  notice,
  isVerifying,
  isResending,
  codeError,
  codeFieldError,
  cooldown,
  resendWaiting,
  open,
  leave,
  verify,
  resend
} = useRegisterCode();
const { remaining: resendIn } = cooldown;
/** Ties the code field to the notice above it, which is already filled in when it appears. */
const noticeId = useId();

/** The step on screen (form or code), to move focus into it when it changes. */
const step = useTemplateRef<HTMLFormElement>("step");
const doneMessage = useTemplateRef("doneMessage");
const emailField = useTemplateRef("emailField");

/**
 * The code step's notice, around the address: the text before it, the punctuation kept with it,
 * and the rest. A waiting registration keeps the username and password it was sent with.
 */
const NOTICES: Record<CodeNotice, [string, string, string]> = {
  sent: [
    `A ${Limits.Code.digits}-digit code is on its way to`,
    ".",
    `Enter it to finish registering; it works for ${Limits.Code.registerValidMinutes} minutes.`
  ],
  resent: ["A new code is on its way to", ".", "The previous one no longer works."],
  earlier: [
    "Enter the code that was mailed to",
    ".",
    `It works for ${Limits.Code.registerValidMinutes} minutes after sending, and keeps the username and password you registered with then.`
  ],
  recent: [
    "Less than a minute ago, a code went to",
    ".",
    "It still works: enter it to finish registering, with the username and password you sent then."
  ],
  lost: [
    "A new code couldn't be mailed to",
    ",",
    "and the one before no longer works. Send a new one below."
  ]
};

const noticeText = computed(() => NOTICES[notice.value]);
/** The address in pieces, so a long one wraps before a dot or the @ rather than mid-word. */
const addressParts = computed(() => codeEmail.value.split(/(?=[.@])/));

/** A problem that isn't about one field, shown above the Register key. */
const formError = computed(() => {
  const status = registerStatus.value;
  if (!status || status === RegisterStatus.Success || status === RegisterStatus.NoSession) {
    return "";
  }
  return status === RegisterStatus.Error ? Messages.Auth.registerUnknownError : status;
});

/** Shows the API's refusal under the field it's about, or above the key otherwise. */
const showProblem = (message: string) => {
  const field = registerFieldOf(message);
  if (field) {
    registerStatus.value = "";
    setError(field, message);
  } else {
    registerStatus.value = message;
  }
};

/** Forgets what was typed, e.g. once the account exists: nothing, least of all the password, stays. */
const clearForm = () => {
  email.value = username.value = password.value = confirmPassword.value = code.value = "";
  registerStatus.value = "";
  resetChecks();
  resetCode();
};

let flagTimer: ReturnType<typeof setTimeout> | undefined;
/** Flashes the submit key red for a second, counted from the latest failure. */
const flagError = () => {
  clearTimeout(flagTimer);
  isButtonError.value = true;
  flagTimer = setTimeout(() => {
    isButtonError.value = false;
  }, 1000);
};

/** Puts the cursor in the step's first field: the e-mail, or the code. */
const focusStep = async () => {
  await nextTick();
  step.value?.querySelector("input")?.focus();
};

/**
 * After the API's refusal the focused key may have been disabled while it loaded, which drops
 * focus: it goes to the field the refusal is about, or back to the key.
 */
const focusProblem = async () => {
  await nextTick();
  const target =
    step.value?.querySelector<HTMLElement>("[aria-invalid='true']") ??
    step.value?.querySelector<HTMLButtonElement>("button[type=submit]");
  target?.focus();
};

const openCodeStep = async (kind: CodeNotice, waitSeconds?: number) => {
  registerStatus.value = "";
  code.value = "";
  resetCode();
  open(email.value, kind, waitSeconds);
  await focusStep();
};

const handleSubmit = async () => {
  if (!(await validate(step.value))) {
    flagError();
    return;
  }

  isLoading.value = true;
  let answer;
  try {
    answer = await register(username.value, email.value, password.value);
  } finally {
    isLoading.value = false;
  }

  if (answer.sent) {
    await openCodeStep("sent", RESEND_COOLDOWN_SECONDS);
  } else if (answer.retryAfter) {
    // A code went to this address moments ago and still works.
    await openCodeStep("recent", answer.retryAfter);
  } else {
    if (answer.field) {
      setError(answer.field, registerStatus.value);
      registerStatus.value = "";
    }
    flagError();
    await focusProblem();
  }
};

/** For a code that already arrived, e.g. after a reload: nothing is sent. */
const enterCode = async () => {
  // The address is what's missing, not a failed registration, so the Register key stays calm.
  if (await validate(emailField.value?.$el, ["email"])) {
    await openCodeStep("earlier");
  }
};

const handleCode = async () => {
  if (!(await validateCode(step.value))) {
    flagError();
    return;
  }

  const result = await verify(code.value);
  switch (result) {
    case "logged-in":
    case "created":
      // Done with the code; logging out later shows an empty form, not this step.
      leave();
      cooldown.stop();
      clearForm();
      registerStatus.value =
        result === "logged-in" ? RegisterStatus.Success : RegisterStatus.NoSession;
      await nextTick();
      doneMessage.value?.$el.focus();
      break;
    case "taken": {
      // The waiting registration is gone, so only the form can go on from here.
      const error = codeError.value;
      leave();
      showProblem(error);
      flagError();
      await focusProblem();
      break;
    }
    default:
      flagError();
      // Confirm code was disabled while it checked; the code is what to fix.
      await focusStep();
  }
};

const sendAgain = async () => {
  await resend();
  // The key is disabled now, which drops focus; the code is what comes next anyway.
  await focusStep();
};

const changeAddress = async () => {
  registerStatus.value = "";
  leave();
  await focusStep();
};

// A new attempt at the code makes the last error old news.
watch(code, () => {
  codeError.value = codeFieldError.value = "";
});

/* The username is checked with the API once typing pauses and its length is right. */
let usernameTimer: ReturnType<typeof setTimeout> | undefined;
let usernameRequest: AbortController | undefined;
const stopUsernameCheck = () => {
  clearTimeout(usernameTimer);
  usernameRequest?.abort();
};
watch(username, (name) => {
  stopUsernameCheck();
  usernameTaken.value = false;
  if (usernameError(name)) return;
  usernameTimer = setTimeout(async () => {
    const request = new AbortController();
    usernameRequest = request;
    const availability = await checkUsername(name, request.signal);
    if (!request.signal.aborted) usernameTaken.value = availability === "taken";
  }, USERNAME_CHECK_DELAY);
});
onBeforeUnmount(stopUsernameCheck);

onMounted(async () => {
  registerStatus.value = "";
  await restoreSession();
  if (isLoggedIn.value) {
    registerStatus.value = RegisterStatus.Success;
  }
});

watch(isLoggedIn, (newVal) => {
  if (!newVal) {
    // Logged out, maybe on a shared machine: the next person gets an empty form.
    clearForm();
  }
});
</script>

<template>
  <StationBoard title="Register" as="h1">
    <div v-if="registerStatus === RegisterStatus.Success" class="form">
      <StatusMessage ref="doneMessage" class="done" tone="success" tabindex="-1">
        Registration successful!
      </StatusMessage>
      <BaseButton to="/shorten">Go to Shorten</BaseButton>
    </div>

    <div v-else-if="registerStatus === RegisterStatus.NoSession" class="form">
      <StatusMessage ref="doneMessage" class="done" tone="error" tabindex="-1">
        Your account was created, but your browser didn't keep the session. Please check that
        cookies are enabled, then log in.
      </StatusMessage>
      <BaseButton to="/login">Log in</BaseButton>
    </div>

    <!-- After the register form, the account waits for the mailed code (vb2007/vb2007.hu-api#28). -->
    <form v-else-if="codeEmail" ref="step" class="form" novalidate @submit.prevent="handleCode">
      <StatusMessage :id="noticeId" tone="info">
        {{ noticeText[0] }}
        <span class="address"
          ><strong
            ><template v-for="(part, index) in addressParts" :key="index"
              ><wbr v-if="index" />{{ part }}</template
            ></strong
          >{{ noticeText[1] }}</span
        >
        {{ noticeText[2] }}
      </StatusMessage>
      <BaseInput
        v-model="code"
        label="Confirmation code"
        inputmode="numeric"
        autocomplete="one-time-code"
        hint="Nothing yet? Check your spam folder, or send a new code below."
        :describedby="noticeId"
        :error="codeErrors.code || codeFieldError"
        mono
        required
        @blur="leaveCode('code')"
      />
      <StatusMessage v-if="codeError" tone="error">{{ codeError }}</StatusMessage>
      <BaseButton
        type="submit"
        block
        :loading="isVerifying"
        :blocked="!isCodeValid"
        :error="isButtonError"
      >
        {{ isVerifying ? "Confirming" : "Confirm code" }}
      </BaseButton>
      <div class="code-actions">
        <BaseButton
          variant="secondary"
          size="sm"
          :loading="isResending"
          :disabled="resendWaiting"
          @click="sendAgain"
        >
          {{ isResending ? "Sending" : resendWaiting ? `Resend in ${resendIn} s` : "Resend code" }}
        </BaseButton>
        <BaseButton variant="ghost" size="sm" @click="changeAddress">Change address</BaseButton>
      </div>
    </form>

    <template v-else>
      <form ref="step" class="form" novalidate @submit.prevent="handleSubmit">
        <BaseInput
          ref="emailField"
          v-model="email"
          label="E-mail"
          type="email"
          autocomplete="email"
          :error="errors.email"
          required
          @blur="leaveField('email')"
        />
        <BaseInput
          v-model="username"
          label="Username"
          autocomplete="username"
          :error="errors.username"
          required
          @blur="leaveField('username')"
        />
        <BaseInput
          v-model="password"
          label="Password"
          type="password"
          autocomplete="new-password"
          :error="errors.password"
          required
          @blur="leaveField('password')"
        />
        <BaseInput
          v-model="confirmPassword"
          label="Confirm password"
          type="password"
          autocomplete="new-password"
          :error="errors.confirmPassword"
          required
          @blur="leaveField('confirmPassword')"
        />
        <StatusMessage v-if="formError" tone="error">{{ formError }}</StatusMessage>
        <BaseButton
          type="submit"
          block
          :loading="isLoading"
          :blocked="!isValid"
          :error="isButtonError"
        >
          {{ isLoading ? "Registering" : "Register" }}
        </BaseButton>
      </form>
      <GithubLogin label="Register with GitHub" />
      <div class="alt">
        <p>
          Already have a code?
          <button type="button" class="link" :disabled="isLoading" @click="enterCode">
            Enter it
          </button>
        </p>
        <p>Already registered? <RouterLink to="/login">Log in</RouterLink></p>
      </div>
    </template>
  </StationBoard>
</template>

<style scoped>
.form {
  display: grid;
  gap: var(--sp-4);
}

/* Focused once the account exists; clear of the sticky navbar. */
.done {
  scroll-margin-top: calc(var(--nav-h) + var(--sp-4));
}

/* The address the code went to, so a typo is easy to spot. It moves to the next line whole
   when that's enough, and only a longer one breaks, before a dot or the @. */
.address {
  display: inline-block;
  max-width: 100%;
  overflow-wrap: anywhere;
}

.address strong {
  font-weight: 600;
}

.code-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp-3);
}

.alt {
  display: grid;
  gap: var(--sp-1);
  font-size: var(--fs-sm);
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
</style>
