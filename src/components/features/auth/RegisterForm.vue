<script setup lang="ts">
import { onMounted, ref, watch, computed, nextTick, useId, useTemplateRef } from "vue";
import { RouterLink } from "vue-router";
import { isLoggedIn } from "@/scripts/authentication/authState";
import {
  isValidEmail,
  register,
  registerStatus,
  validateRegisterData
} from "@/scripts/authentication/register";
import { restoreSession } from "@/scripts/authentication/user";
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

const username = ref("");
const email = ref("");
const password = ref("");
const confirmPassword = ref("");
const code = ref("");
const isLoading = ref(false);
const isButtonError = ref(false);

const {
  email: codeEmail,
  notice,
  isVerifying,
  isResending,
  codeError,
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

const MESSAGES: Record<string, string> = {
  "missing-fields": "Please fill out all required input fields.",
  "invalid-email": "Please enter a valid email address.",
  "email-too-long": "Your email address can't be longer than 254 characters.",
  "unmatched-passwords": "The two passwords don't match.",
  error: "Registration failed. Please try again."
};

/**
 * The code step's notice, around the address: the text before it, the punctuation kept with it,
 * and the rest. A waiting registration keeps the username and password it was sent with.
 */
const NOTICES: Record<CodeNotice, [string, string, string]> = {
  sent: [
    "A 6-digit code is on its way to",
    ".",
    "Enter it to finish registering; it works for 15 minutes."
  ],
  resent: ["A new code is on its way to", ".", "The previous one no longer works."],
  earlier: [
    "Enter the code that was mailed to",
    ".",
    "It works for 15 minutes after sending, and keeps the username and password you registered with then."
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

const failure = computed(() => {
  const status = registerStatus.value;
  if (!status || status === "success") return "";
  return MESSAGES[status] ?? status;
});

const flagError = () => {
  isButtonError.value = true;
  setTimeout(() => {
    isButtonError.value = false;
  }, 1000);
};

/** Puts the cursor in the step's first field (the e-mail, or the code), or the one `selector` picks. */
const focusStep = async (selector = "input") => {
  await nextTick();
  step.value?.querySelector<HTMLInputElement>(selector)?.focus();
};

const openCodeStep = async (kind: CodeNotice, waitSeconds?: number) => {
  registerStatus.value = "";
  code.value = "";
  open(email.value, kind, waitSeconds);
  await focusStep();
};

const handleSubmit = async () => {
  const problem = validateRegisterData(
    username.value,
    email.value,
    password.value,
    confirmPassword.value
  );
  if (problem) {
    registerStatus.value = problem;
    flagError();
    return;
  }

  isLoading.value = true;
  try {
    const answer = await register(username.value, email.value, password.value);
    if (answer.sent) {
      await openCodeStep("sent", RESEND_COOLDOWN_SECONDS);
    } else if (answer.retryAfter) {
      // A code went to this address moments ago and still works.
      await openCodeStep("recent", answer.retryAfter);
    } else {
      flagError();
    }
  } finally {
    isLoading.value = false;
  }
};

/** For a code that already arrived, e.g. after a reload: nothing is sent. */
const enterCode = async () => {
  if (!isValidEmail(email.value)) {
    registerStatus.value = "invalid-email";
    flagError();
    await focusStep();
    return;
  }

  await openCodeStep("earlier");
};

const handleCode = async () => {
  const result = await verify(code.value);
  switch (result) {
    case "logged-in":
    case "created":
      // Done with the code; logging out later shows the form, not this step.
      leave();
      cooldown.stop();
      registerStatus.value = result === "logged-in" ? "success" : "no-session";
      break;
    case "taken": {
      // The waiting registration is gone, so only the form can go on from here.
      const error = codeError.value;
      registerStatus.value = error;
      leave();
      flagError();
      await focusStep(
        /username/i.test(error) ? 'input[autocomplete="username"]' : 'input[type="email"]'
      );
      break;
    }
    default:
      flagError();
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
  codeError.value = "";
});

onMounted(async () => {
  registerStatus.value = "";
  await restoreSession();
  if (isLoggedIn.value) {
    registerStatus.value = "success";
  }
});

watch(isLoggedIn, (newVal) => {
  if (!newVal) {
    registerStatus.value = "";
  }
});
</script>

<template>
  <StationBoard title="Register" as="h1">
    <div v-if="registerStatus === 'success'" class="form">
      <StatusMessage tone="success">Registration successful!</StatusMessage>
      <BaseButton to="/shorten">Go to Shorten</BaseButton>
    </div>

    <div v-else-if="registerStatus === 'no-session'" class="form">
      <StatusMessage tone="error">
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
        mono
        required
      />
      <StatusMessage v-if="codeError" tone="error">{{ codeError }}</StatusMessage>
      <BaseButton type="submit" block :loading="isVerifying" :error="isButtonError">
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
        <BaseInput v-model="email" label="E-mail" type="email" autocomplete="email" required />
        <BaseInput v-model="username" label="Username" autocomplete="username" required />
        <BaseInput
          v-model="password"
          label="Password"
          type="password"
          autocomplete="new-password"
          required
        />
        <BaseInput
          v-model="confirmPassword"
          label="Confirm password"
          type="password"
          autocomplete="new-password"
          required
        />
        <StatusMessage v-if="failure" tone="error">{{ failure }}</StatusMessage>
        <BaseButton type="submit" block :loading="isLoading" :error="isButtonError">
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
