<script setup lang="ts">
import { watch } from "vue";
import { useShortLink } from "@/composables/useShortLink";
import BaseButton from "@/components/ui/BaseButton.vue";
import StationBoard from "@/components/ui/StationBoard.vue";
import StatusMessage from "@/components/ui/StatusMessage.vue";

const props = defineProps<{ code: string; navigate?: (url: string) => void }>();

const { state, target, errorMessage, resolve } = useShortLink(props.navigate);

watch(() => props.code, resolve, { immediate: true });
</script>

<template>
  <StationBoard title="Short link" as="h1">
    <p v-if="state === 'resolving'" class="note">Looking up this link…</p>

    <template v-else-if="state === 'redirecting'">
      <p class="note">Taking you there…</p>
      <a class="target" :href="target" rel="noopener noreferrer">{{ target }}</a>
    </template>

    <template v-else>
      <StatusMessage v-if="state === 'unsafe'" tone="error">
        This short link points somewhere the site won't open.
      </StatusMessage>
      <StatusMessage v-else tone="error">{{ errorMessage }}</StatusMessage>
      <div class="actions">
        <BaseButton v-if="state === 'error'" @click="resolve(code)"> Try again </BaseButton>
        <BaseButton to="/shorten" variant="secondary">Shorten a link</BaseButton>
      </div>
    </template>
  </StationBoard>
</template>

<style scoped>
.note {
  color: var(--c-ink-soft);
  font-weight: 600;
}

.target {
  font-family: var(--font-code);
  font-size: 0.95rem;
  font-weight: 500;
  color: var(--c-ink);
  overflow-wrap: anywhere;
  text-decoration-color: var(--c-line);
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-3);
}
</style>
