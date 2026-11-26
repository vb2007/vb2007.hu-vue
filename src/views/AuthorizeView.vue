<script setup lang="ts">
/**
 * "Sign in with vb2007.hu" (vb2007/vb2007.hu-api#575): an app's sign-in, handed here by the API's
 * `GET /oauth/authorize`. Logged out, the login form takes every way in, then this page asks
 * again; logged in, the user approves or cancels as the account shown, and the browser goes where
 * the API's answer says. A request the page can't answer only says why.
 */
import { computed, nextTick, onMounted, ref, useId, useTemplateRef, watch } from "vue";
import { useRoute } from "vue-router";
import { Messages } from "@/constants/messages";
import { SITE_NAME } from "@/constants/site";
import { useAuthorize } from "@/composables/useAuthorize";
import {
  isLoggedIn,
  isSessionChecked,
  sessionEnded,
  userEmail,
  username
} from "@/scripts/authentication/authState";
import { loginStatus, logout, restoreSession } from "@/scripts/authentication/user";
import LoginForm from "@/components/features/auth/LoginForm.vue";
import PageSection from "@/components/layout/PageSection.vue";
import BaseButton from "@/components/ui/BaseButton.vue";
import StationBoard from "@/components/ui/StationBoard.vue";
import StatusMessage from "@/components/ui/StatusMessage.vue";
import { statusTextId } from "@/components/ui/statusMessage";

const route = useRoute();
const { app, problem, sending, hold, answer } = useAuthorize(route.query);
const lead = useTemplateRef<HTMLElement>("lead");
const outcome = useTemplateRef<InstanceType<typeof StatusMessage>>("outcome");
const loginForm = useTemplateRef<InstanceType<typeof LoginForm>>("loginForm");
const isSwitching = ref(false);
const failureId = useId();

/** The failed answer's message, or the hold's while the keys wait. */
const failure = computed(() => hold.shown());
const isHeld = computed(() => hold.isHeld());
const isBusy = computed(() => !!sending.value || isSwitching.value);

/** Focuses what the page now says, or the login's address once the login took over. */
const focusOutcome = async () => {
  await nextTick();
  (outcome.value?.$el ?? loginForm.value?.$el.querySelector("input[type=email]"))?.focus();
};

// A request that can't go on is all the page has to say.
onMounted(() => {
  void restoreSession();
  if (problem.value) void focusOutcome();
});
watch(problem, focusOutcome);

const respond = async (approve: boolean) => {
  // The pressed key was disabled while it worked, which drops the focus; an ended session brought
  // the login instead.
  if (!(await answer(approve))) await focusOutcome();
};

/** Logs out first, so the form can log in as someone else. */
const useAnotherAccount = async () => {
  isSwitching.value = true;
  await logout();
  isSwitching.value = false;
  await focusOutcome();
};

/**
 * Why the login is back, from the session's end until a new try's first answer (a suspended
 * account's, say), latched: each try empties `loginStatus` while it's out, and the note mustn't
 * come back and be announced again then.
 */
const showEnded = ref(sessionEnded.value);
watch(sessionEnded, (ended) => (showEnded.value = ended));
watch(loginStatus, (status) => {
  if (status) showEnded.value = false;
});

// Logged in on this page (or found logged in), the question takes the focus from the gone form.
watch(isLoggedIn, async (loggedIn) => {
  if (!loggedIn) return;
  await nextTick();
  lead.value?.focus();
});
</script>

<template>
  <PageSection width="narrow">
    <StationBoard v-if="problem" title="Sign in" as="h1">
      <StatusMessage ref="outcome" class="outcome" tone="error" tabindex="-1">{{
        problem
      }}</StatusMessage>
      <BaseButton class="home" to="/">Back to home</BaseButton>
    </StationBoard>

    <StationBoard v-else-if="!app || !isSessionChecked" title="Sign in" as="h1">
      <p role="status">Loading the sign-in…</p>
    </StationBoard>

    <StationBoard v-else-if="isLoggedIn" title="Sign in" as="h1">
      <p ref="lead" class="lead" tabindex="-1">
        <strong class="app">{{ app.name }}</strong> wants you to sign in with your
        {{ SITE_NAME }} account.
      </p>
      <div class="account">
        <p class="account__fact">
          <span class="account__label">Signing in as</span>
          <span class="account__name">{{ username || userEmail }}</span>
          <span v-if="username" class="account__email">{{ userEmail }}</span>
        </p>
        <p class="account__switch">
          Not you?
          <button type="button" class="account__link" :disabled="isBusy" @click="useAnotherAccount">
            Use another account
          </button>
        </p>
      </div>
      <p class="note">{{ Messages.OAuth.consentNote(app.name) }}</p>
      <StatusMessage
        v-if="failure"
        :id="failureId"
        ref="outcome"
        class="outcome"
        tone="error"
        tabindex="-1"
        :spoken="hold.spokenFor()"
        >{{ failure }}</StatusMessage
      >
      <div class="keys">
        <BaseButton
          :loading="sending === 'approve'"
          :disabled="isHeld || isBusy"
          :aria-label="isHeld ? hold.name.value : undefined"
          :aria-describedby="isHeld && failure ? statusTextId(failureId) : undefined"
          @click="respond(true)"
        >
          {{ sending === "approve" ? "Signing in" : isHeld ? hold.label.value : "Continue" }}
        </BaseButton>
        <BaseButton
          variant="secondary"
          :loading="sending === 'deny'"
          :disabled="isHeld || isBusy"
          @click="respond(false)"
        >
          {{ sending === "deny" ? "Cancelling" : "Cancel" }}
        </BaseButton>
      </div>
    </StationBoard>

    <LoginForm v-else ref="loginForm" :github-return="route.fullPath">
      <!-- Why the login is back, until a new try has its own answer (a suspended account's, say). -->
      <StatusMessage tone="info">{{
        showEnded ? Messages.OAuth.sessionEnded(app.name) : Messages.OAuth.loginLead(app.name)
      }}</StatusMessage>
    </LoginForm>
  </PageSection>
</template>

<style scoped>
.lead {
  font-size: var(--fs-md);
  line-height: 1.35;
  scroll-margin-top: calc(var(--nav-h) + var(--sp-4));
}

.app,
.account__name {
  font-weight: 600;
  overflow-wrap: anywhere;
}

.account {
  display: grid;
  gap: var(--sp-3);
  padding-block: var(--sp-4);
  border-block: var(--edge) solid var(--c-hairline);
}

.account__fact {
  display: grid;
  gap: var(--sp-1);
}

.account__label,
.account__switch,
.note {
  font-size: var(--fs-sm);
}

.account__label,
.note {
  color: var(--c-ink-soft);
}

.account__label {
  font-weight: 600;
}

.account__email {
  color: var(--c-ink-soft);
  overflow-wrap: anywhere;
}

/* A key drawn as a link, like the second step's "Log in again". */
.account__link {
  padding: 0;
  border: 0;
  background: none;
  color: var(--c-action);
  font: inherit;
  text-decoration: underline;
  text-decoration-thickness: 0.09em;
  text-underline-offset: 0.18em;
  cursor: pointer;
}

.account__link:hover:not(:disabled) {
  text-decoration-thickness: 0.16em;
}

.account__link:disabled {
  color: var(--c-ink-soft);
  cursor: not-allowed;
}

.outcome {
  scroll-margin-top: calc(var(--nav-h) + var(--sp-4));
}

.keys {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-3);
}

.home {
  justify-self: start;
}
</style>
