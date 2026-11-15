<script setup lang="ts">
/**
 * The mailed second-step link, `/login/mfa#token=…` (vb2007/vb2007.hu-api#448). The token leaves
 * the address bar before it's sent, and it's sent once: a wrong link uses one of the step's tries.
 * It only works with this browser's step cookie, so a link opened elsewhere is refused.
 */
import { nextTick, onMounted, ref, useTemplateRef } from "vue";
import { useRoute, useRouter } from "vue-router";
import { AuthPaths, LoginStatus } from "@/constants/auth";
import { Messages } from "@/constants/messages";
import { verifyMfaLink } from "@/scripts/authentication/mfa";
import { resetLinkTokenFrom } from "@/scripts/authentication/passwordReset";
import { fetchUserDetails, loginStatus } from "@/scripts/authentication/user";
import BaseButton from "@/components/ui/BaseButton.vue";
import StationBoard from "@/components/ui/StationBoard.vue";
import StatusMessage from "@/components/ui/StatusMessage.vue";

const route = useRoute();
const router = useRouter();
const token = resetLinkTokenFrom(route.hash);

/** Empty while it's checked. */
const failure = ref(token ? "" : Messages.Mfa.linkIncomplete);
/** The success to show: logged in by this link, or already before it. */
const done = ref("");
const outcome = useTemplateRef<InstanceType<typeof StatusMessage>>("outcome");

onMounted(async () => {
  if (token) {
    // Out of the address bar and the history entry before it's sent.
    await router.replace({ query: route.query, hash: "" });
    // A link opened again, or after the code was entered, finds this browser logged in already:
    // its step is gone, so it has nothing left to do (and sending it would answer 403).
    if (await fetchUserDetails()) {
      done.value = "You're already logged in.";
    } else {
      const refused = await verifyMfaLink(token);
      if (refused) failure.value = refused.error;
      else if (loginStatus.value === LoginStatus.Success) done.value = "Login successful!";
      else failure.value = loginStatus.value;
    }
  }
  await nextTick();
  outcome.value?.$el.focus();
});
</script>

<template>
  <StationBoard title="Log in" as="h1">
    <div class="link">
      <template v-if="failure">
        <StatusMessage ref="outcome" class="link__outcome" tone="error" tabindex="-1">{{
          failure
        }}</StatusMessage>
        <BaseButton :to="AuthPaths.Login">Log in again</BaseButton>
      </template>
      <template v-else-if="done">
        <StatusMessage ref="outcome" class="link__outcome" tone="success" tabindex="-1">{{
          done
        }}</StatusMessage>
        <BaseButton to="/shorten">Go to Shorten</BaseButton>
      </template>
      <p v-else role="status">Logging you in…</p>
    </div>
  </StationBoard>
</template>

<style scoped>
.link {
  display: grid;
  justify-items: start;
  gap: var(--sp-4);
}

.link__outcome {
  justify-self: stretch;
  scroll-margin-top: calc(var(--nav-h) + var(--sp-4));
}
</style>
