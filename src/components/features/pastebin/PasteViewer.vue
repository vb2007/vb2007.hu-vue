<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { pasteLink, pasteSize } from "@/scripts/pastebin/paste";
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

/** Numbered, unwrapped lines suit code; a single line of prose reads better wrapped. */
const showLineNumbers = ref(false);
const lineCount = computed(() => paste.value?.content.split("\n").length ?? 0);
const lineNumbers = computed(() =>
  Array.from({ length: lineCount.value }, (_, i) => i + 1).join("\n")
);

watch(paste, () => {
  showLineNumbers.value = lineCount.value > 1;
});
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
      <div class="toolbar">
        <p class="note">
          Added <time :datetime="paste.addedOn">{{ formatDateTime(paste.addedOn) }}</time> ·
          {{ pasteSize(paste.content) }}
        </p>
        <BaseButton
          size="sm"
          variant="secondary"
          :aria-pressed="showLineNumbers"
          @click="showLineNumbers = !showLineNumbers"
        >
          Line numbers: {{ showLineNumbers ? "on" : "off" }}
        </BaseButton>
      </div>

      <div class="sheet" :class="{ 'sheet--numbered': showLineNumbers }">
        <pre v-if="showLineNumbers" class="sheet__gutter" aria-hidden="true">{{ lineNumbers }}</pre>
        <pre class="sheet__content" tabindex="0" aria-label="Paste content">{{
          paste.content
        }}</pre>
      </div>

      <div class="actions">
        <BaseButton size="sm" @click="text.copy(paste.content)">
          <AppIcon :name="text.copied.value ? 'check' : 'copy'" :size="18" />
          {{ text.copied.value ? "Copied" : text.failed.value ? "Copy failed" : "Copy text" }}
        </BaseButton>
        <BaseButton size="sm" variant="secondary" @click="link.copy(pasteLink(paste._id))">
          {{ link.copied.value ? "Copied" : link.failed.value ? "Copy failed" : "Copy link" }}
        </BaseButton>
        <BaseButton size="sm" variant="secondary" to="/pastebin" class="actions__new">
          New paste
        </BaseButton>
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
  font-variant-numeric: tabular-nums;
}

.toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp-2) var(--sp-4);
}

/* One scroll box for gutter and text, so numbers stay level with their lines. */
.sheet {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  max-height: 70vh;
  overflow: auto;
  border: var(--edge) solid var(--c-edge);
  border-radius: var(--radius-sm);
  background: var(--c-panel-sunk);
}

.sheet--numbered {
  grid-template-columns: auto minmax(0, 1fr);
}

.sheet__gutter,
.sheet__content {
  margin: 0;
  padding: var(--sp-4);
  font-family: var(--font-code);
  font-size: 0.95rem;
  line-height: 1.6;
}

.sheet__gutter {
  position: sticky;
  left: 0;
  padding-right: var(--sp-3);
  border-right: var(--edge) solid var(--c-hairline);
  background: var(--c-panel-sunk);
  color: var(--c-ink-soft);
  text-align: right;
  user-select: none;
}

.sheet__content {
  color: var(--c-ink);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.sheet--numbered .sheet__content {
  width: max-content;
  min-width: 100%;
  white-space: pre;
  overflow-wrap: normal;
}

.sheet__content:focus-visible {
  outline: 3px solid var(--c-line);
  outline-offset: -3px;
}

.actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--sp-3);
}

.actions__new {
  margin-left: auto;
}
</style>
