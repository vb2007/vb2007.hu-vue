<script setup lang="ts">
/** The way into GitHub login: an "or" rule under the password form, then a key to the API. */
import { Endpoints } from "@/constants/endpoints";
import { apiUrl } from "@/scripts/api/client";
import { saveGithubReturn } from "@/scripts/authentication/githubReturn";
import AppIcon from "@/components/ui/AppIcon.vue";
import BaseButton from "@/components/ui/BaseButton.vue";

/** `returnTo`: the page to come back to after GitHub, which itself lands on `/` or `/login`. */
const props = defineProps<{ label: string; returnTo?: string }>();

const keepReturn = () => {
  if (props.returnTo) saveGithubReturn(props.returnTo);
};

const githubLogin = apiUrl(Endpoints.Auth.github);
</script>

<template>
  <div class="github">
    <p class="github__or">or</p>
    <BaseButton :href="githubLogin" variant="secondary" block @click="keepReturn">
      <AppIcon name="github" :size="20" />
      {{ label }}
    </BaseButton>
  </div>
</template>

<style scoped>
.github {
  display: grid;
  gap: var(--sp-4);
}

.github__or {
  display: flex;
  max-width: none;
  align-items: center;
  gap: var(--sp-3);
  font-family: var(--font-board);
  font-size: var(--fs-sm);
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--c-ink-soft);
}

.github__or::before,
.github__or::after {
  content: "";
  flex: 1;
  height: var(--edge);
  background: var(--c-hairline);
}
</style>
