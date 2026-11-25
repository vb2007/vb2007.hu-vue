<script setup lang="ts">
/** The logged-in user's account and how they can log in; visitors get a gate once the session is known. */
import { computed, nextTick, ref, useTemplateRef, watch } from "vue";
import { Limits } from "@/constants/limits";
import { Messages } from "@/constants/messages";
import {
  emailVerified,
  githubLinked,
  githubLogin,
  hasPassword,
  isLoggedIn,
  isSessionChecked,
  isSuperuser,
  mfa,
  pendingEmail,
  sessionEnded,
  userEmail,
  username
} from "@/scripts/authentication/authState";
import { OauthQuery } from "@/constants/oauth";
import { takeDeleteIntent } from "@/scripts/authentication/deleteIntent";
import { useOauthError } from "@/composables/useOauthError";
import { useQueryNotice } from "@/composables/useQueryNotice";
import ChangePassword from "@/components/features/account/ChangePassword.vue";
import ChangeEmail from "@/components/features/account/ChangeEmail.vue";
import SetPasswordForm from "@/components/features/account/SetPasswordForm.vue";
import DeleteAccount from "@/components/features/account/DeleteAccount.vue";
import GithubLink from "@/components/features/account/GithubLink.vue";
import MfaEmailToggle from "@/components/features/account/MfaEmailToggle.vue";
import MfaTotpToggle from "@/components/features/account/MfaTotpToggle.vue";
import PasskeyList from "@/components/features/account/PasskeyList.vue";
import RecoveryCodesPanel from "@/components/features/account/RecoveryCodesPanel.vue";
import MfaRecoveryCodes from "@/components/features/account/MfaRecoveryCodes.vue";
import AppIcon from "@/components/ui/AppIcon.vue";
import BaseButton from "@/components/ui/BaseButton.vue";
import StationBoard from "@/components/ui/StationBoard.vue";
import StatusMessage from "@/components/ui/StatusMessage.vue";
import StatusPill from "@/components/ui/StatusPill.vue";

const oauthError = useOauthError();
// The API comes back with ?github=linked after linking (vb2007/vb2007.hu-api#132). An account
// without a password relinks only to confirm it's them before setting one (vb2007/vb2007.hu-api#183),
// or before deleting it, if the delete form sent them (vb2007/vb2007.hu-api#245).
const githubReturned = ref(useQueryNotice(OauthQuery.github) === OauthQuery.githubLinked);
// Read once on every visit, so a delete abandoned on GitHub doesn't open the form on a later relink.
const deleteIntent = takeDeleteIntent();
const deleteReturned = computed(
  () =>
    githubReturned.value && !hasPassword.value && !!deleteIntent && deleteIntent === username.value
);
const notice = ref("");
const shownNotice = computed(() => {
  if (notice.value || !githubReturned.value) return notice.value;
  if (hasPassword.value) return Messages.Account.githubLinked;
  // Back to delete, the delete form says so itself, where the focus lands.
  return deleteReturned.value ? "" : Messages.Account.githubConfirmed(Limits.Github.reauthMinutes);
});
const noticeMessage = useTemplateRef<InstanceType<typeof StatusMessage>>("noticeMessage");
const clearNotice = () => {
  oauthError.value = "";
  githubReturned.value = false;
  notice.value = "";
};
/** Shows an outcome at the top of the board and moves focus there, as the key it came from is gone. */
const announce = async (message: string) => {
  clearNotice();
  notice.value = message;
  await nextTick();
  noticeMessage.value?.$el.focus();
};
// The key that was pressed went with the account board, so focus moves to why it went.
const endedMessage = useTemplateRef<InstanceType<typeof StatusMessage>>("endedMessage");
/**
 * Fresh recovery codes, shown once; kept here, above the rows the account's refresh redraws and
 * the logged-in gate, until they're saved.
 */
const recoveryCodes = ref<string[]>([]);
watch(sessionEnded, async (ended) => {
  // Recovery codes still on show keep the focus their panel took: they matter more.
  if (!ended || recoveryCodes.value.length) return;
  await nextTick();
  endedMessage.value?.$el.focus();
});
const onPasswordSet = () => announce(Messages.Account.passwordSet);
const onUnlinked = () => announce(Messages.Account.githubUnlinked);

/** An MFA setting changed: its message at the top, and its codes, if any, which take the focus. */
const onMfaChanged = (message: string, codes?: string[]) => {
  if (!codes?.length) return announce(message);
  clearNotice();
  notice.value = message;
  recoveryCodes.value = codes;
};
/** At most this many recovery codes left, the row warns: few left to log in with, or none. */
const FEW_RECOVERY_CODES = 3;
const recoveryCodesLow = computed(() => mfa.value.recoveryCodesLeft <= FEW_RECOVERY_CODES);
// Codes the account no longer has (its last method turned off, here or elsewhere) aren't worth
// saving any more. A session that ended meanwhile says nothing about them: they stay on show,
// above the logged-out gate, until they're saved.
watch(
  () => mfa.value.recoveryCodesLeft,
  (left) => {
    if (!left && isLoggedIn.value) recoveryCodes.value = [];
  }
);
const mfaSection = useTemplateRef("mfaSection");
/** Saved: the panel goes, and the focus stays in the section, on its first row's key. */
const onRecoveryCodesSaved = async () => {
  recoveryCodes.value = [];
  await nextTick();
  // Logged out meanwhile, there's no section: the notice of why takes the focus instead.
  (
    mfaSection.value?.querySelector<HTMLElement>(".login button") ?? endedMessage.value?.$el
  )?.focus();
};
</script>

<template>
  <StationBoard v-if="isLoggedIn" title="Your account" as="h1">
    <StatusMessage v-if="oauthError" tone="error">{{ oauthError }}</StatusMessage>
    <StatusMessage
      v-if="shownNotice"
      ref="noticeMessage"
      class="notice"
      tone="success"
      tabindex="-1"
      >{{ shownNotice }}</StatusMessage
    >

    <dl class="facts">
      <div class="fact">
        <dt>Username</dt>
        <dd>{{ username }}</dd>
      </div>
      <div class="fact">
        <dt>E-mail</dt>
        <dd>{{ userEmail }}</dd>
      </div>
    </dl>

    <section class="logins" aria-labelledby="details-title">
      <h2 id="details-title" class="logins__title">Log-in details</h2>
      <div class="login">
        <span class="login__mark"><AppIcon name="lock" :size="26" /></span>
        <div class="login__main">
          <h3 class="login__name">Password</h3>
          <p class="login__note">
            <template v-if="hasPassword"
              >Changing it logs out your other devices; you stay logged in here.</template
            >
            <template v-else>None yet. Set one in the Password section below.</template>
          </p>
          <ChangePassword v-if="hasPassword" @start="clearNotice" />
        </div>
      </div>
      <div class="login">
        <span class="login__mark"><AppIcon name="mail" :size="26" /></span>
        <div class="login__main">
          <div class="login__head">
            <h3 class="login__name">E-mail</h3>
            <!-- Only a confirmed address gets one: accounts from before codes were never asked to.
                 It waits out a change, so it can't be read as being about the new address. -->
            <span v-if="emailVerified && !pendingEmail" class="badge badge--on">
              <AppIcon name="check" :size="14" />
              Confirmed
            </span>
          </div>
          <p class="login__note">
            <template v-if="isSuperuser">It's set in the API's configuration.</template>
            <template v-else-if="!hasPassword">Changing it needs a password.</template>
            <template v-else>You log in with it. Changing it takes your current password.</template>
          </p>
          <ChangeEmail v-if="hasPassword && !isSuperuser" @start="clearNotice" />
        </div>
      </div>
    </section>

    <!-- Each method is a row like the logins above (vb2007/vb2007.hu-api#448); any answer with
         fresh recovery codes shows them in the panel at the top, once. -->
    <section ref="mfaSection" class="logins" aria-labelledby="mfa-title">
      <h2 id="mfa-title" class="logins__title">Two-step login</h2>
      <p class="logins__note">
        A second step after your password or GitHub, so a stolen password alone can't log in.
      </p>
      <!-- Keyed by the codes, so a newer set opens afresh and takes the focus. -->
      <RecoveryCodesPanel
        v-if="recoveryCodes.length"
        :key="recoveryCodes.join()"
        :codes="recoveryCodes"
        @done="onRecoveryCodesSaved"
      />
      <div class="login">
        <span class="login__mark"><AppIcon name="mail" :size="26" /></span>
        <div class="login__main">
          <div class="login__head">
            <h3 class="login__name">E-mail codes</h3>
            <span class="badge" :class="mfa.email ? 'badge--on' : 'badge--off'">
              <AppIcon :name="mfa.email ? 'check' : 'close'" :size="14" />
              {{ mfa.email ? "On" : "Off" }}
            </span>
          </div>
          <!-- With an authenticator app or a passkey, the login opens on it: e-mail is another way. -->
          <p class="login__note">
            <template v-if="mfa.email && (mfa.totp || mfa.passkeys > 0)"
              >Each login can also take a code or link mailed to your address.</template
            >
            <template v-else-if="mfa.email"
              >Each login also takes a code or link mailed to your address.</template
            >
            <template v-else-if="emailVerified"
              >Get a code or link by e-mail at each login.</template
            >
            <template v-else
              >Confirm your e-mail address first: a password reset or an e-mail change confirms
              it.</template
            >
          </p>
          <MfaEmailToggle
            v-if="mfa.email || emailVerified"
            @start="clearNotice"
            @done="onMfaChanged"
          />
        </div>
      </div>
      <div class="login">
        <span class="login__mark"><AppIcon name="phone" :size="26" /></span>
        <div class="login__main">
          <div class="login__head">
            <h3 class="login__name">Authenticator app</h3>
            <span class="badge" :class="mfa.totp ? 'badge--on' : 'badge--off'">
              <AppIcon :name="mfa.totp ? 'check' : 'close'" :size="14" />
              {{ mfa.totp ? "On" : "Off" }}
            </span>
          </div>
          <p class="login__note">
            <template v-if="mfa.totp"
              >Each login can take a code from your authenticator app.</template
            >
            <template v-else
              >Use a code from an app on your phone at each login, even offline.</template
            >
          </p>
          <MfaTotpToggle @start="clearNotice" @done="onMfaChanged" />
        </div>
      </div>
      <!-- Only next to a method that isn't a backup: the API removes the codes with the last one. -->
      <div v-if="mfa.email || mfa.totp" class="login">
        <span class="login__mark"><AppIcon name="key" :size="26" /></span>
        <div class="login__main">
          <div class="login__head">
            <h3 class="login__name">Recovery codes</h3>
            <StatusPill v-if="recoveryCodesLow" tone="danger" icon="alert">{{
              mfa.recoveryCodesLeft ? "Few left" : "None left"
            }}</StatusPill>
          </div>
          <p class="login__note">
            <template v-if="mfa.recoveryCodesLeft"
              >{{ mfa.recoveryCodesLeft }} of {{ Limits.Mfa.recoveryCodes }} left. Each logs in once
              if you can't do your second step.<template v-if="recoveryCodesLow">
                Generate new ones before they run out.</template
              ></template
            >
            <template v-else
              >All used. Generate new ones to still log in if you can't do your second
              step.</template
            >
          </p>
          <MfaRecoveryCodes @start="clearNotice" @done="onMfaChanged" />
        </div>
      </div>
    </section>

    <!-- Passwordless logins (vb2007/vb2007.hu-api#446), which also answer the second step once a
         method above is on (vb2007/vb2007.hu-api#484). -->
    <section class="logins" aria-labelledby="passkeys-title">
      <h2 id="passkeys-title" class="logins__title">Passkeys</h2>
      <p class="logins__note">
        Log in with your fingerprint, face or screen lock, no password needed.
        <template v-if="mfa.email || mfa.totp"
          >They also answer two-step login's second step.</template
        >
        <template v-else
          >They don't turn on two-step login, but once it's on, they also answer its second
          step.</template
        >
      </p>
      <PasskeyList @start="clearNotice" />
    </section>

    <section class="logins" aria-labelledby="logins-title">
      <h2 id="logins-title" class="logins__title">Linked accounts</h2>
      <div class="login">
        <span class="login__mark"><AppIcon name="github" :size="26" /></span>
        <div class="login__main">
          <div class="login__head">
            <h3 class="login__name">GitHub</h3>
            <span class="badge" :class="githubLinked ? 'badge--on' : 'badge--off'">
              <AppIcon :name="githubLinked ? 'check' : 'close'" :size="14" />
              {{ githubLinked ? "Linked" : "Not linked" }}
            </span>
          </div>
          <p class="login__note">
            <template v-if="githubLinked">
              You can log in with GitHub<template v-if="githubLogin">
                as <strong class="login__handle">@{{ githubLogin }}</strong></template
              >.
              <template v-if="!hasPassword">
                It stays linked while it's your only way to log in.
              </template>
            </template>
            <template v-else-if="hasPassword"
              >Link it to log in with GitHub instead of typing your password.</template
            >
            <template v-else>Link it to log in with GitHub.</template>
          </p>
          <GithubLink @start="clearNotice" @unlinked="onUnlinked" />
        </div>
      </div>
    </section>

    <!-- Managed on a page of their own (vb2007/vb2007.hu-api#511). -->
    <section class="logins" aria-labelledby="api-keys-title">
      <h2 id="api-keys-title" class="logins__title">API keys</h2>
      <div class="login">
        <span class="login__mark"><AppIcon name="key" :size="26" /></span>
        <div class="login__main">
          <p class="login__note">
            Let your scripts and programs use the API as you, each with only the scopes you pick.
          </p>
          <div class="login__keys">
            <BaseButton to="/account/api-keys" size="sm" variant="secondary">
              Manage API keys <AppIcon name="arrow" :size="16" />
            </BaseButton>
            <BaseButton to="/account/sharex" size="sm" variant="secondary">
              Set up ShareX <AppIcon name="arrow" :size="16" />
            </BaseButton>
          </div>
        </div>
      </div>
    </section>

    <SetPasswordForm @set="onPasswordSet" />

    <DeleteAccount :reopen="deleteReturned" />
  </StationBoard>

  <StationBoard v-else-if="isSessionChecked" title="Account" as="h1">
    <!-- Codes shown once stay until they're saved, even when the session ended meanwhile. -->
    <RecoveryCodesPanel
      v-if="recoveryCodes.length"
      :codes="recoveryCodes"
      @done="onRecoveryCodesSaved"
    />
    <div class="gate">
      <StatusMessage v-if="oauthError" tone="error">{{ oauthError }}</StatusMessage>
      <StatusMessage
        v-if="sessionEnded"
        ref="endedMessage"
        class="notice"
        tone="info"
        tabindex="-1"
        >{{ Messages.Auth.sessionEnded }}</StatusMessage
      >
      <StatusMessage v-else tone="info">Log in to see your account.</StatusMessage>
      <div class="gate__keys">
        <BaseButton to="/login">Log in</BaseButton>
        <BaseButton to="/register" variant="secondary">Register</BaseButton>
      </div>
    </div>
  </StationBoard>
</template>

<style scoped>
.notice {
  scroll-margin-top: calc(var(--nav-h) + var(--sp-4));
}

.facts {
  display: grid;
  margin: 0;
}

.fact {
  display: grid;
  gap: var(--sp-1);
  padding: var(--sp-3) 0;
  border-bottom: var(--edge) solid var(--c-hairline);
}

.fact:first-child {
  padding-top: 0;
}

.fact dt {
  font-size: var(--fs-sm);
  font-weight: 600;
  color: var(--c-ink-soft);
}

.fact dd {
  margin: 0;
  font-weight: 500;
  overflow-wrap: anywhere;
}

.logins {
  display: grid;
  gap: var(--sp-3);
}

.logins__title {
  font-size: 1.25rem;
  letter-spacing: 0.04em;
  line-height: 1.1;
  text-transform: uppercase;
}

.logins__note {
  font-size: var(--fs-sm);
  color: var(--c-ink-soft);
}

.login {
  display: flex;
  align-items: flex-start;
  gap: var(--sp-4);
  padding: var(--sp-3) 0;
  border-bottom: var(--edge) solid var(--c-hairline);
}

.login__mark {
  flex: none;
  display: grid;
  place-items: center;
  width: 3.25rem;
  height: 3.25rem;
  border: var(--edge) solid var(--c-edge);
  border-radius: var(--radius-sm);
  background: var(--c-panel-sunk);
  color: var(--c-action);
}

.login__main {
  flex: 1;
  min-width: 0;
  display: grid;
  justify-items: start;
  gap: var(--sp-1);
}

.login__head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--sp-2) var(--sp-3);
}

.login__name {
  font-family: var(--font-board);
  font-size: 1.125rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  line-height: 1.1;
  text-transform: uppercase;
  /* "Authenticator app" at 320 px with a large font breaks rather than widening the row. */
  overflow-wrap: anywhere;
  hyphens: auto;
}

.login__note {
  font-size: var(--fs-sm);
  color: var(--c-ink-soft);
}

/* Moves to the next line whole rather than breaking at a hyphen; only a login wider than the line breaks. */
.login__handle {
  display: inline-block;
  color: var(--c-ink);
  font-weight: 600;
  overflow-wrap: anywhere;
}

.badge {
  display: inline-flex;
  align-items: center;
  gap: var(--sp-1);
  padding: 0.125rem var(--sp-2);
  border: var(--edge) solid currentColor;
  border-radius: 999px;
  font-family: var(--font-board);
  font-size: 0.9375rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  white-space: nowrap;
}

.badge--on {
  background: var(--c-ok-wash);
  color: var(--c-action);
}

.badge--off {
  background: var(--c-panel-sunk);
  color: var(--c-ink-soft);
}

.gate {
  display: grid;
  justify-items: start;
  gap: var(--sp-4);
}

.login__keys,
.gate__keys {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-3);
}
</style>
