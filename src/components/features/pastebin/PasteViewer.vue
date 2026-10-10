<script setup lang="ts">
import { watch } from "vue";
import { pasteLink } from "@/scripts/pastebin/paste";
import { formatDateTime } from "@/scripts/utility/dateUtil";
import { useClipboard } from "@/composables/useClipboard";
import { usePaste } from "@/composables/usePaste";
import AppIcon from "@/components/ui/AppIcon.vue";
import BaseButton from "@/components/ui/BaseButton.vue";
import StationBoard from "@/components/ui/StationBoard.vue";
import StatusMessage from "@/components/ui/StatusMessage.vue";

const props = withDefaults(defineProps<{ id: string; as?: "h1" | "h2" }>(), { as: "h2" });

const { paste, isLoading, errorMessage, load } = usePaste();
const text = useClipboard();
const link = useClipboard();

watch(() => props.id, load, { immediate: true });
</script>

<template>
  <StationBoard title="Paste" :as="as">
    <p v-if="isLoading" class="note">Loading paste…</p>

    <template v-else-if="errorMessage">
      <StatusMessage tone="error">{{ errorMessage }}</StatusMessage>
      <BaseButton to="/pastebin" variant="secondary">Go to Pastebin</BaseButton>
    </template>

    <template v-else-if="paste">
      <p class="note">
        Added <time :datetime="paste.addedOn">{{ formatDateTime(paste.addedOn) }}</time>
      </p>
      <pre class="content" tabindex="0" aria-label="Paste content">{{ paste.content }}</pre>
      <div class="actions">
        <BaseButton size="sm" @click="text.copy(paste.content)">
          <AppIcon :name="text.copied.value ? 'check' : 'copy'" :size="18" />
          {{ text.copied.value ? "Copied" : text.failed.value ? "Copy failed" : "Copy text" }}
        </BaseButton>
        <BaseButton size="sm" variant="secondary" @click="link.copy(pasteLink(paste._id))">
          {{ link.copied.value ? "Copied" : link.failed.value ? "Copy failed" : "Copy link" }}
        </BaseButton>
        <BaseButton size="sm" variant="ghost" to="/pastebin">New paste</BaseButton>
      </div>
      <p class="visually-hidden" role="status">
        {{ text.copied.value || link.copied.value ? "Copied to clipboard" : "" }}
      </p>
    </template>
  </StationBoard>
</template>

<style scoped>
.note {
  color: var(--c-ink-soft);
  font-weight: 600;
}

.content {
  max-height: 70vh;
  margin: 0;
  overflow: auto;
  padding: var(--sp-4);
  border: var(--edge) solid var(--c-edge);
  border-radius: var(--radius-sm);
  background: var(--c-panel-sunk);
  color: var(--c-ink);
  font-family: var(--font-code);
  font-size: 0.95rem;
  line-height: 1.55;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.content:focus-visible {
  outline: none;
  border-color: var(--c-action);
  box-shadow: 0 0 0 4px color-mix(in oklch, var(--c-line) 45%, transparent);
}

.actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--sp-3);
}
</style>
