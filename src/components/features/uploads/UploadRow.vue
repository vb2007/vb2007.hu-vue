<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, useId, useTemplateRef } from "vue";
import type { UploadAction } from "@/composables/useUploads";
import { useClipboard } from "@/composables/useClipboard";
import {
  categoryOf,
  typeLabel,
  validateFileName,
  type Upload,
  type UploadVisibility
} from "@/scripts/uploads/upload";
import { formatDateTime } from "@/scripts/utility/dateUtil";
import { formatBytes } from "@/scripts/utility/sizeUtil";
import AppIcon from "@/components/ui/AppIcon.vue";
import BaseButton from "@/components/ui/BaseButton.vue";
import BaseInput from "@/components/ui/BaseInput.vue";
import StatusMessage from "@/components/ui/StatusMessage.vue";
import { CATEGORY_ICONS } from "./categoryIcon";
import UploadLink from "./UploadLink.vue";

const props = defineProps<{
  upload: Upload;
  /** Set when the admin looks at someone else's uploads. */
  ownerName?: string;
  /** The edit running on this row, if any. */
  busy: UploadAction | "";
  error: string;
  rename: (id: string, name: string) => Promise<boolean>;
  setVisibility: (id: string, visibility: UploadVisibility) => Promise<boolean>;
  remove: (id: string) => Promise<boolean>;
}>();

const detailsId = useId();
const category = computed(() => categoryOf(props.upload.mimeType));
const isPrivate = computed(() => props.upload.visibility === "private");
const privateAudience = computed(() =>
  props.ownerName ? `Only ${props.ownerName} and the admin` : "Only you, while you're logged in"
);

/** Thumbnails that fail to load (e.g. a private file after logging out) fall back to the icon. */
const thumbFailed = ref(false);

const expanded = ref(false);

const { copied, failed, copy } = useClipboard();
/** Announced after copying; a private link warns who can open it. */
const copyStatus = computed(() => {
  if (!copied.value) return "";
  if (!isPrivate.value) return "Link copied to clipboard";
  return props.ownerName
    ? `Link copied. Only ${props.ownerName} and the admin can open it while it's private.`
    : "Link copied. Only you can open it while it's private.";
});
const copyLabel = computed(() =>
  copied.value ? "Copied" : failed.value ? "Copy failed" : "Copy link"
);

/* Rename: the name turns into a field; Enter saves, Escape puts it back. */
const renaming = ref(false);
const draftName = ref("");
const nameError = ref("");
const renameField = useTemplateRef("renameField");

const startRename = async () => {
  expanded.value = true;
  renaming.value = true;
  draftName.value = props.upload.originalFileName;
  nameError.value = "";
  await nextTick();
  const input: HTMLInputElement = renameField.value!.$el.querySelector("input");
  input.focus();
  input.select();
};

const stopRename = () => {
  renaming.value = false;
  nameError.value = "";
};

const saveRename = async () => {
  nameError.value = validateFileName(draftName.value);
  if (nameError.value) return;
  if (draftName.value.trim() === props.upload.originalFileName) return stopRename();
  if (await props.rename(props.upload.id, draftName.value)) stopRename();
};

const toggleVisibility = () =>
  props.setVisibility(props.upload.id, isPrivate.value ? "public" : "private");

/** Deleting takes two clicks; the armed state wears off if the user moves on. */
const confirming = ref(false);
let confirmTimer: ReturnType<typeof setTimeout> | undefined;
const onDelete = () => {
  clearTimeout(confirmTimer);
  if (!confirming.value) {
    confirming.value = true;
    confirmTimer = setTimeout(() => (confirming.value = false), 4000);
    return;
  }
  confirming.value = false;
  return props.remove(props.upload.id);
};
onBeforeUnmount(() => clearTimeout(confirmTimer));
</script>

<template>
  <li class="row" :class="{ 'row--open': expanded }">
    <div class="row__summary">
      <span class="thumb" aria-hidden="true">
        <img
          v-if="category === 'image' && !thumbFailed"
          class="thumb__img"
          :src="upload.url"
          alt=""
          loading="lazy"
          decoding="async"
          @error="thumbFailed = true"
        />
        <AppIcon v-else :name="CATEGORY_ICONS[category]" :size="24" />
      </span>

      <div class="row__main">
        <button
          class="row__name"
          type="button"
          :aria-expanded="expanded"
          :aria-controls="detailsId"
          :title="upload.originalFileName"
          @click="expanded = !expanded"
        >
          <span class="row__name-text">{{ upload.originalFileName }}</span>
          <AppIcon class="row__chevron" name="chevron" :size="18" />
        </button>
        <p class="row__meta">
          {{ formatBytes(upload.fileSize) }} · {{ typeLabel(upload.extension) }} ·
          <time :datetime="upload.uploadedOn">{{ formatDateTime(upload.uploadedOn) }}</time>
        </p>
      </div>

      <span class="badge" :class="`badge--${upload.visibility}`">
        <AppIcon :name="isPrivate ? 'lock' : 'globe'" :size="14" />
        {{ isPrivate ? "Private" : "Public" }}
      </span>

      <div class="row__quick">
        <BaseButton size="sm" variant="secondary" @click="copy(upload.url)">
          {{ copyLabel }}
        </BaseButton>
        <BaseButton size="sm" variant="ghost" :href="upload.url" target="_blank" rel="noopener">
          Open<span class="visually-hidden"> {{ upload.originalFileName }} in a new tab</span>
        </BaseButton>
      </div>
    </div>

    <StatusMessage v-if="error" tone="error">{{ error }}</StatusMessage>

    <div v-if="expanded" :id="detailsId" class="details">
      <div class="details__preview">
        <img
          v-if="category === 'image' && !thumbFailed"
          :src="upload.url"
          :alt="`Preview of ${upload.originalFileName}`"
        />
        <video v-else-if="category === 'video'" :src="upload.url" controls preload="metadata" />
        <audio v-else-if="category === 'audio'" :src="upload.url" controls preload="metadata" />
        <span v-else class="details__icon"
          ><AppIcon :name="CATEGORY_ICONS[category]" :size="40"
        /></span>
      </div>

      <dl class="facts">
        <div class="facts__row">
          <dt>Type</dt>
          <dd>{{ typeLabel(upload.extension) }} · {{ upload.mimeType }}</dd>
        </div>
        <div class="facts__row">
          <dt>Size</dt>
          <dd>
            {{ formatBytes(upload.fileSize) }}
            <span class="facts__soft">({{ upload.fileSize.toLocaleString() }} bytes)</span>
          </dd>
        </div>
        <div class="facts__row">
          <dt>Uploaded</dt>
          <dd>
            <time :datetime="upload.uploadedOn">{{ formatDateTime(upload.uploadedOn) }}</time>
          </dd>
        </div>
        <div v-if="upload.updatedOn !== upload.uploadedOn" class="facts__row">
          <dt>Changed</dt>
          <dd>
            <time :datetime="upload.updatedOn">{{ formatDateTime(upload.updatedOn) }}</time>
          </dd>
        </div>
        <div class="facts__row">
          <dt>Who can open it</dt>
          <dd>
            {{ isPrivate ? privateAudience : "Anyone with the link" }}
          </dd>
        </div>
        <div class="facts__row facts__row--link">
          <dt>Link</dt>
          <dd>
            <UploadLink class="facts__link" :url="upload.url" />
          </dd>
        </div>
      </dl>

      <form
        v-if="renaming"
        class="rename"
        novalidate
        @submit.prevent="saveRename"
        @keydown.esc="stopRename"
      >
        <BaseInput
          ref="renameField"
          v-model="draftName"
          label="New name"
          hint="The link stays the same."
          :error="nameError"
          required
        />
        <div class="rename__actions">
          <BaseButton type="submit" size="sm" :loading="busy === 'rename'">
            {{ busy === "rename" ? "Saving" : "Save name" }}
          </BaseButton>
          <BaseButton size="sm" variant="ghost" @click="stopRename">Cancel</BaseButton>
        </div>
      </form>

      <div class="details__actions">
        <BaseButton v-if="!renaming" size="sm" variant="secondary" @click="startRename">
          <AppIcon name="pencil" :size="16" /> Rename
        </BaseButton>
        <BaseButton
          size="sm"
          variant="secondary"
          :loading="busy === 'visibility'"
          @click="toggleVisibility"
        >
          <AppIcon :name="isPrivate ? 'globe' : 'lock'" :size="16" />
          {{ isPrivate ? "Make public" : "Make private" }}
        </BaseButton>
        <!-- Armed, it turns solid red; the ghost variant's hover fill would wash that out. -->
        <BaseButton
          size="sm"
          :variant="confirming ? 'primary' : 'ghost'"
          :error="confirming"
          :loading="busy === 'delete'"
          @click="onDelete"
        >
          <AppIcon name="trash" :size="16" />
          {{ busy === "delete" ? "Deleting" : confirming ? "Confirm delete" : "Delete" }}
        </BaseButton>
      </div>
    </div>

    <p class="visually-hidden" role="status">{{ copyStatus }}</p>
  </li>
</template>

<style scoped>
.row {
  display: grid;
  gap: var(--sp-3);
  padding: var(--sp-4) 0;
  border-bottom: var(--edge) solid var(--c-hairline);
}

.row__summary {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  grid-template-areas:
    "thumb main badge"
    "quick quick quick";
  align-items: center;
  gap: var(--sp-3);
}

.thumb {
  grid-area: thumb;
  display: grid;
  place-items: center;
  overflow: hidden;
  width: 3.25rem;
  height: 3.25rem;
  border: var(--edge) solid var(--c-edge);
  border-radius: var(--radius-sm);
  background: var(--c-panel-sunk);
  color: var(--c-action);
}

.thumb__img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.row__main {
  grid-area: main;
  display: grid;
  gap: var(--sp-1);
  min-width: 0;
}

.row__name {
  display: flex;
  align-items: center;
  gap: var(--sp-1);
  min-width: 0;
  padding: 0;
  border: 0;
  background: none;
  color: var(--c-ink);
  font-weight: 600;
  font-size: var(--fs-base);
  text-align: left;
  cursor: pointer;
}

.row__name-text {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  text-decoration: underline;
  text-decoration-color: transparent;
  text-decoration-thickness: 2px;
  text-underline-offset: 0.2em;
  transition: text-decoration-color var(--dur-quick) ease;
}

.row__name:hover .row__name-text {
  text-decoration-color: var(--c-line);
}

.row__name:focus-visible {
  outline: 3px solid var(--c-line);
  outline-offset: 3px;
}

.row__chevron {
  flex: none;
  color: var(--c-ink-soft);
  transition: transform var(--dur-base) var(--ease-out);
}

.row--open .row__chevron {
  transform: rotate(180deg);
}

.row__meta {
  font-size: var(--fs-sm);
  color: var(--c-ink-soft);
  font-variant-numeric: tabular-nums;
}

.badge svg {
  flex: none;
}

.badge {
  grid-area: badge;
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

.badge--private {
  background: var(--c-panel-sunk);
  color: var(--c-ink-soft);
}

.badge--public {
  background: var(--c-ok-wash);
  color: var(--c-action);
}

.row__quick {
  grid-area: quick;
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-2);
}

/* Wide enough: everything on one line, quick actions at the end. */
@container (min-width: 36rem) {
  .row__summary {
    grid-template-columns: auto minmax(0, 1fr) auto auto;
    grid-template-areas: "thumb main badge quick";
  }

  .row__quick {
    flex-wrap: nowrap;
  }
}

/* The row's own details, opened in place under it (never driven from hover). */
.details {
  display: grid;
  gap: var(--sp-4);
  padding: var(--sp-4);
  border: var(--edge) solid var(--c-edge);
  border-radius: var(--radius-md);
  background: var(--c-panel-sunk);
  animation: open var(--dur-base) var(--ease-out);
}

.details__preview {
  display: grid;
  place-items: center;
  overflow: hidden;
  border: var(--edge) solid var(--c-edge);
  border-radius: var(--radius-sm);
  background: var(--c-panel);
}

.details__preview img,
.details__preview video {
  display: block;
  width: 100%;
  max-height: 20rem;
  object-fit: contain;
}

.details__preview audio {
  width: 100%;
  margin: var(--sp-3);
}

.details__icon {
  display: grid;
  place-items: center;
  padding: var(--sp-5);
  color: var(--c-action);
}

.facts {
  display: grid;
  gap: var(--sp-2);
  margin: 0;
}

.facts__row {
  display: grid;
  grid-template-columns: minmax(7rem, auto) minmax(0, 1fr);
  gap: var(--sp-3);
  font-size: var(--fs-sm);
}

.facts dt {
  font-weight: 600;
  color: var(--c-ink-soft);
}

.facts dd {
  margin: 0;
  min-width: 0;
  overflow-wrap: anywhere;
}

.facts__soft {
  color: var(--c-ink-soft);
  font-variant-numeric: tabular-nums;
}

.facts__link {
  display: flex;
}

.rename {
  display: grid;
  gap: var(--sp-3);
}

.rename__actions,
.details__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-2);
}

/* Destructive goes last, away from the others. */
.details__actions > :last-child {
  margin-left: auto;
}

@container (min-width: 36rem) {
  .details {
    grid-template-columns: minmax(0, 14rem) minmax(0, 1fr);
    align-items: start;
  }

  /* Edits run the full width under the preview and the facts, so they fit on one line. */
  .rename,
  .details__actions {
    grid-column: 1 / -1;
  }
}

@keyframes open {
  from {
    opacity: 0;
    transform: translateY(-4px);
  }
}
</style>
