<script setup lang="ts">
/** The logged-in user's account and how they can log in; visitors get a gate once the session is known. */
import { computed, nextTick, onBeforeUnmount, ref, useTemplateRef } from "vue";
import {
  githubLinked,
  githubLogin,
  hasPassword,
  isLoggedIn,
  isSessionChecked,
  isSuperuser,
  userEmail,
  username
} from "@/scripts/authentication/authState";
import { UserManagement } from "@/constants/api";
import { useGithubUnlink } from "@/composables/useGithubUnlink";
import { useOauthError } from "@/composables/useOauthError";
import { useQueryNotice } from "@/composables/useQueryNotice";
import ChangePassword from "@/components/features/account/ChangePassword.vue";
import ChangeEmail from "@/components/features/account/ChangeEmail.vue";
import SetPasswordForm from "@/components/features/account/SetPasswordForm.vue";
import DeleteAccount from "@/components/features/account/DeleteAccount.vue";
import AppIcon from "@/components/ui/AppIcon.vue";
import BaseButton from "@/components/ui/BaseButton.vue";
import StationBoard from "@/components/ui/StationBoard.vue";
import StatusMessage from "@/components/ui/StatusMessage.vue";

const oauthError = useOauthError();
// The API comes back with ?github=linked after linking (vb2007/vb2007.hu-api#132). An account
// without a password relinks only to confirm it's them before setting one (vb2007/vb2007.hu-api#183).
const githubReturned = ref(useQueryNotice("github") === "linked");
const notice = ref("");
const shownNotice = computed(() => {
  if (notice.value || !githubReturned.value) return notice.value;
  return hasPassword.value
    ? "GitHub is linked. You can log in with it from now on."
    : "GitHub confirmed it's you. Set your password within 10 minutes.";
});
const noticeMessage = useTemplateRef<InstanceType<typeof StatusMessage>>("noticeMessage");
const clearNotice = () => {
  githubReturned.value = false;
  notice.value = "";
};
const onPasswordSet = async () => {
  githubReturned.value = false;
  notice.value = "Your password is set. You can log in with it from now on.";
  await nextTick();
  noticeMessage.value?.$el.focus();
};
const { isUnlinking, unlinkError, unlink } = useGithubUnlink();

/** Unlinking takes two clicks, like deleting an upload; the armed state wears off. */
const confirming = ref(false);
let confirmTimer: ReturnType<typeof setTimeout> | undefined;
const onUnlink = async () => {
  clearTimeout(confirmTimer);
  if (!confirming.value) {
    confirming.value = true;
    confirmTimer = setTimeout(() => (confirming.value = false), 4000);
    return;
  }
  confirming.value = false;
  clearNotice();
  if (await unlink()) {
    notice.value = "GitHub is unlinked. Log in with your password from now on.";
  }
};
onBeforeUnmount(() => clearTimeout(confirmTimer));
</script>

<template>
  <StationBoard v-if="isLoggedIn" title="Your account" as="h1">
    <StatusMessage v-if="oauthError" tone="error">{{ oauthError }}</StatusMessage>
    <StatusMessage v-if="unlinkError" tone="error">{{ unlinkError }}</StatusMessage>
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
          <ChangePassword v-if="hasPassword" @open="clearNotice" />
        </div>
      </div>
      <div class="login">
        <span class="login__mark"><AppIcon name="mail" :size="26" /></span>
        <div class="login__main">
          <h3 class="login__name">E-mail</h3>
          <p class="login__note">
            <template v-if="isSuperuser">It's set in the API's configuration.</template>
            <template v-else-if="!hasPassword">Changing it needs a password.</template>
            <template v-else>You log in with it. Changing it takes your current password.</template>
          </p>
          <ChangeEmail v-if="hasPassword && !isSuperuser" @open="clearNotice" />
        </div>
      </div>
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
            <template v-else
              >Link it to log in with GitHub instead of typing your password.</template
            >
          </p>
          <BaseButton
            v-if="!githubLinked"
            class="login__action"
            size="sm"
            :href="UserManagement.Authentication.githubLink"
          >
            Link GitHub
          </BaseButton>
          <!-- Secondary at rest so its edge lines up with the note; armed, it turns solid red. -->
          <BaseButton
            v-else-if="hasPassword"
            class="login__action"
            size="sm"
            :variant="confirming ? 'primary' : 'secondary'"
            :error="confirming"
            :loading="isUnlinking"
            @click="onUnlink"
          >
            {{ isUnlinking ? "Unlinking" : confirming ? "Confirm unlink" : "Unlink GitHub" }}
          </BaseButton>
        </div>
      </div>
    </section>

    <SetPasswordForm @set="onPasswordSet" />

    <DeleteAccount />
  </StationBoard>

  <StationBoard v-else-if="isSessionChecked" title="Account" as="h1">
    <div class="gate">
      <StatusMessage v-if="oauthError" tone="error">{{ oauthError }}</StatusMessage>
      <StatusMessage tone="info">Log in to see your account.</StatusMessage>
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

.login__action {
  margin-top: var(--sp-2);
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

.gate__keys {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-3);
}
</style>
