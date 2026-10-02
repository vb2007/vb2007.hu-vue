<script setup lang="ts">
import { isLoggedIn, isSessionChecked } from "@/scripts/authentication/authState";
import { useShortener } from "@/composables/useShortener";
import BaseButton from "@/components/ui/BaseButton.vue";
import BaseInput from "@/components/ui/BaseInput.vue";
import StationBoard from "@/components/ui/StationBoard.vue";
import StatusMessage from "@/components/ui/StatusMessage.vue";
import TicketSlip from "@/components/ui/TicketSlip.vue";

withDefaults(defineProps<{ as?: "h1" | "h2" }>(), { as: "h2" });

const { originalUrl, shortenedCode, shortenedLink, isLoading, errorMessage, shorten, reset } =
  useShortener();
</script>

<template>
  <StationBoard title="Shorten" :as="as">
    <form v-if="isLoggedIn" class="form" novalidate @submit.prevent="shorten">
      <BaseInput
        v-model="originalUrl"
        label="URL"
        type="text"
        placeholder="https://fos.hu/"
        autocomplete="off"
        mono
        required
        :error="errorMessage"
      />
      <BaseButton type="submit" block :loading="isLoading">
        {{ isLoading ? "Shortening" : "Shorten" }}
      </BaseButton>
    </form>

    <div v-else-if="isSessionChecked" class="gate">
      <StatusMessage tone="info">
        Sorry, currently only logged-in users can shorten links. This will change in the future.
      </StatusMessage>
      <div class="gate__actions">
        <BaseButton to="/register">Create a new account</BaseButton>
        <BaseButton to="/login" variant="secondary">Log in</BaseButton>
      </div>
    </div>

    <TicketSlip v-if="shortenedCode" :value="shortenedLink()" @again="reset" />
  </StationBoard>
</template>

<style scoped>
.form,
.gate {
  display: grid;
  gap: var(--sp-4);
}

.gate__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-3);
}

.gate__actions > * {
  flex: 1 1 11rem;
}
</style>
