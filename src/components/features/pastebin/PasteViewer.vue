<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { isSuperuser, username } from "@/scripts/authentication/authState";
import { MARKDOWN, PASTE_LANGUAGES, languageLabel } from "@/scripts/pastebin/languages";
import { pasteLanguage, pasteLink, pasteSize } from "@/scripts/pastebin/paste";
import { formatDateTime } from "@/scripts/utility/dateUtil";
import { useClipboard } from "@/composables/useClipboard";
import { usePaste } from "@/composables/usePaste";
import AppIcon from "@/components/ui/AppIcon.vue";
import BaseButton from "@/components/ui/BaseButton.vue";
import BaseSelect from "@/components/ui/BaseSelect.vue";
import SegmentedControl from "@/components/ui/SegmentedControl.vue";
import StationBoard from "@/components/ui/StationBoard.vue";
import StatusMessage from "@/components/ui/StatusMessage.vue";
import PasteContent from "./PasteContent.vue";

const props = withDefaults(defineProps<{ id: string; as?: "h1" | "h2" }>(), { as: "h2" });

const { paste, isLoading, errorMessage, load, saveError, setLanguage } = usePaste();
const text = useClipboard();
const link = useClipboard();

// Only read while a paste is shown.
const language = computed(() => pasteLanguage(paste.value!));
const isMarkdown = computed(() => language.value === MARKDOWN);

/** Markdown reads best rendered; its source is a click away. */
const view = ref<"rendered" | "source">("rendered");
const isRendered = computed(() => isMarkdown.value && view.value === "rendered");
const views = [
  { value: "rendered" as const, label: "Rendered" },
  { value: "source" as const, label: "Source" }
];

/** Numbered, unwrapped lines suit code; a single line of prose reads better wrapped. */
const showLineNumbers = ref(false);

/** Only a single paste with its author filled in (vb2007/vb2007.hu-api#124) says who owns it. */
const canEdit = computed(() => {
  const author = paste.value?.addedBy;
  return typeof author === "object" && (author.username === username.value || isSuperuser.value);
});
const languageOptions = PASTE_LANGUAGES.map(({ id, label }) => ({ value: id, label }));
/** Announced once a change is saved. */
const savedLanguage = ref("");
/** Shows the pick while it saves; a failed save falls back to the stored language. */
const pendingLanguage = ref("");
const chosenLanguage = computed({
  get: () => pendingLanguage.value || language.value,
  set: async (id: string) => {
    pendingLanguage.value = id;
    await setLanguage(id);
    pendingLanguage.value = "";
    if (!saveError.value) savedLanguage.value = languageLabel(id);
  }
});

watch(paste, (current, previous) => {
  if (current?._id !== previous?._id) {
    showLineNumbers.value = (current?.content.split("\n").length ?? 0) > 1;
    view.value = "rendered";
    savedLanguage.value = "";
  }
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
          <span class="note__language">{{ languageLabel(language) }}</span> ·
          {{ pasteSize(paste.content) }}
        </p>
        <div class="toolbar__controls">
          <BaseSelect
            v-if="canEdit"
            v-model="chosenLanguage"
            class="toolbar__language"
            label="Language"
            size="sm"
            :options="languageOptions"
          />
          <SegmentedControl
            v-if="isMarkdown"
            v-model="view"
            legend="Show the paste"
            hide-legend
            size="sm"
            :options="views"
          />
          <BaseButton
            v-if="!isRendered"
            size="sm"
            variant="secondary"
            :aria-pressed="showLineNumbers"
            @click="showLineNumbers = !showLineNumbers"
          >
            Line numbers: {{ showLineNumbers ? "on" : "off" }}
          </BaseButton>
        </div>
      </div>

      <StatusMessage v-if="saveError" tone="error">{{ saveError }}</StatusMessage>

      <PasteContent
        :content="paste.content"
        :language="language"
        :rendered="isRendered"
        :numbered="showLineNumbers"
      />

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
        {{
          text.copied.value || link.copied.value
            ? "Copied to clipboard"
            : savedLanguage
              ? `Language changed to ${savedLanguage}`
              : ""
        }}
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

.note__language {
  color: var(--c-ink);
}

.toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: var(--sp-3) var(--sp-4);
}

.toolbar__controls {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: var(--sp-3);
}

.toolbar__language {
  min-width: 11rem;
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
