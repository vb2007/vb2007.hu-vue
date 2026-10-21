<script setup lang="ts">
/** The superuser gets the page in the slot; everyone else a gate, once the session is known. */
import { isLoggedIn, isSessionChecked, isSuperuser } from "@/scripts/authentication/authState";
import BaseButton from "@/components/ui/BaseButton.vue";
import StationBoard from "@/components/ui/StationBoard.vue";
import StatusMessage from "@/components/ui/StatusMessage.vue";
</script>

<template>
  <slot v-if="isSuperuser" />

  <StationBoard v-else-if="isSessionChecked" title="Admin" as="h1">
    <div class="gate">
      <template v-if="isLoggedIn">
        <StatusMessage tone="info">This page is only for the site's admin.</StatusMessage>
        <BaseButton to="/" variant="secondary">Back to home</BaseButton>
      </template>
      <template v-else>
        <StatusMessage tone="info">Log in with the admin account to open this page.</StatusMessage>
        <BaseButton to="/login">Log in</BaseButton>
      </template>
    </div>
  </StationBoard>
</template>

<style scoped>
.gate {
  display: grid;
  justify-items: start;
  gap: var(--sp-4);
}
</style>
