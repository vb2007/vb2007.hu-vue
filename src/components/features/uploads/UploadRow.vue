<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, useId, useTemplateRef, watch } from "vue";
import type { UploadAction } from "@/composables/useUploads";
import { useClipboard } from "@/composables/useClipboard";
import { useConfirmDelete } from "@/composables/useConfirmDelete";
import { useCopiedLinkNote } from "@/composables/useCopiedLinkNote";
import { useFormValidation } from "@/composables/useFormValidation";
import { AdminRoutes } from "@/constants/admin";
import { isSuperuser, userId } from "@/scripts/authentication/authState";
import { categoryOf, linkExpiresAt, typeLabel, validateFileName } from "@/scripts/uploads/upload";
import type { Upload, UploadOwner, UploadVisibility } from "@/types/api/uploads";
import { formatDateTime } from "@/scripts/utility/dateUtil";
import { formatBytes } from "@/scripts/utility/sizeUtil";
import AppIcon from "@/components/ui/AppIcon.vue";
import BaseButton from "@/components/ui/BaseButton.vue";
import BaseInput from "@/components/ui/BaseInput.vue";
import ConfirmDeleteButton from "@/components/ui/ConfirmDeleteButton.vue";
import StatusMessage from "@/components/ui/StatusMessage.vue";
import { CATEGORY_ICONS } from "./categoryIcon";
import UploadLink from "./UploadLink.vue";

const props = defineProps<{
  upload: Upload;
  /**
   * Whose upload it is, set in the admin's listings (`null` once their account is gone); left out
   * on the user's own list.
   */
  owner?: UploadOwner | null;
  /** Leads the row's meta line with the owner, for a list of everyone's uploads. */
  showOwner?: boolean;
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
/**
 * Only the owner and the admin get a private file's signed link, but it opens for anyone until it
 * expires. The admin is "you" on their own uploads and on someone else's (`owner`); a deleted
 * account's leaves only the admin.
 */
const audience = computed(() => {
  if (!isPrivate.value) return "Anyone with the link, while it's public";
  const { owner } = props;
  if (owner && owner.id !== userId.value)
    return `${owner.username}, you, and anyone with the link (until it expires)`;
  return owner !== undefined || isSuperuser.value
    ? "You, and anyone with the link (until it expires)"
    : "You, the admin, and anyone with the link (until it expires)";
});

/** Thumbnails that fail to load (e.g. an expired link) fall back to the icon, until a new link. */
const thumbFailed = ref(false);

const expanded = ref(false);

// A renewed link swaps the preview's source: a playing video or song carries on where it was.
const media = useTemplateRef<HTMLMediaElement>("media");
/** The wait for the new source, dropped when another link or the row's end overtakes it. */
let resume: AbortController | undefined;
watch(
  () => props.upload.url,
  () => {
    thumbFailed.value = false;
    resume?.abort();
    const player = media.value;
    if (!player) return;
    const { currentTime, paused } = player;
    resume = new AbortController();
    player.addEventListener(
      "loadedmetadata",
      () => {
        player.currentTime = currentTime;
        // The browser may refuse to play on its own; the user can still press play.
        if (!paused) player.play()?.catch(() => {});
      },
      { once: true, signal: resume.signal }
    );
  }
);
onBeforeUnmount(() => resume?.abort());

const { copied, failed, copy } = useClipboard();
/** When the last copied private link expires, until it has. */
const { note: copiedNote, show: showCopiedNote, clear: clearCopiedNote } = useCopiedLinkNote();
const copyLink = async () => {
  const url = props.upload.url;
  await copy(url);
  if (copied.value) showCopiedNote(url);
  else clearCopiedNote();
};
// The note only holds while the file stays as it was copied: private, behind a signed link. A
// renewed signed link leaves it, since the copied one still works until it expires.
watch(
  () => props.upload.visibility,
  () => clearCopiedNote()
);
watch(
  () => props.upload.url,
  (url) => {
    if (linkExpiresAt(url) === undefined) clearCopiedNote();
  }
);
const copyLabel = computed(() =>
  copied.value ? "Copied" : failed.value ? "Copy failed" : "Copy link"
);

/* Rename: the name turns into a field; Enter saves, Escape puts it back. */
const renaming = ref(false);
const draftName = ref("");
const renameField = useTemplateRef("renameField");
const renameForm = useTemplateRef("renameForm");
const {
  errors: renameErrors,
  isValid: isNameValid,
  leave: leaveName,
  validate: validateName,
  reset: resetName
} = useFormValidation({
  name: {
    value: draftName,
    check: () => validateFileName(draftName.value),
    // Only an empty name can be fixed by typing more; a slash or too many characters can't.
    early: () => (draftName.value.trim() ? validateFileName(draftName.value) : "")
  }
});

const startRename = async () => {
  expanded.value = true;
  renaming.value = true;
  draftName.value = props.upload.originalFileName;
  resetName();
  await nextTick();
  const input: HTMLInputElement = renameField.value!.$el.querySelector("input");
  input.focus();
  input.select();
};

const stopRename = () => {
  renaming.value = false;
  resetName();
};

const saveRename = async () => {
  if (!(await validateName(renameForm.value))) return;
  if (draftName.value.trim() === props.upload.originalFileName) return stopRename();
  if (await props.rename(props.upload.id, draftName.value)) stopRename();
};

const toggleVisibility = () =>
  props.setVisibility(props.upload.id, isPrivate.value ? "public" : "private");

const confirmDelete = useConfirmDelete();
const onDelete = () => confirmDelete.press(props.upload.id, () => props.remove(props.upload.id));
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
        <!-- A no-break space ties each dot to the fact before it, so a line never starts with one. -->
        <p class="row__meta">
          <template v-if="showOwner">
            <!-- Whose it is leads, a click from their account; named apart for screen readers. -->
            <RouterLink
              v-if="owner"
              class="meta-link"
              :to="{ name: AdminRoutes.user, params: { id: owner.id } }"
              :aria-label="`${owner.username}'s account`"
              >{{ owner.username }}</RouterLink
            >
            <span v-else class="row__fact">Deleted account</span>&nbsp;·
          </template>
          <span class="row__fact">{{ formatBytes(upload.fileSize) }}</span
          >&nbsp;· <span class="row__fact">{{ typeLabel(upload.extension) }}</span
          >&nbsp;·
          <time class="row__fact" :datetime="upload.uploadedOn">{{
            formatDateTime(upload.uploadedOn)
          }}</time>
        </p>
      </div>

      <span class="badge" :class="`badge--${upload.visibility}`">
        <AppIcon :name="isPrivate ? 'lock' : 'globe'" :size="14" />
        {{ isPrivate ? "Private" : "Public" }}
      </span>

      <div class="row__quick">
        <BaseButton size="sm" variant="secondary" @click="copyLink">
          {{ copyLabel }}
        </BaseButton>
        <BaseButton size="sm" variant="ghost" :href="upload.url" target="_blank" rel="noopener">
          Open<span class="visually-hidden"> {{ upload.originalFileName }} in a new tab</span>
        </BaseButton>
      </div>
    </div>

    <!-- Shown for a signed link, whose copy expires; only read out for a plain one. -->
    <p class="copied-note" :class="{ 'visually-hidden': !copiedNote }" role="status">
      {{ copiedNote || (copied ? "Link copied to clipboard" : "") }}
    </p>

    <StatusMessage v-if="error" tone="error">{{ error }}</StatusMessage>

    <div v-if="expanded" :id="detailsId" class="details">
      <div class="details__preview">
        <img
          v-if="category === 'image' && !thumbFailed"
          :src="upload.url"
          :alt="`Preview of ${upload.originalFileName}`"
        />
        <video
          v-else-if="category === 'video'"
          ref="media"
          :src="upload.url"
          controls
          preload="metadata"
        />
        <audio
          v-else-if="category === 'audio'"
          ref="media"
          :src="upload.url"
          controls
          preload="metadata"
        />
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
            {{ audience }}
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
        ref="renameForm"
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
          :error="renameErrors.name"
          required
          @blur="leaveName('name')"
        />
        <div class="rename__actions">
          <BaseButton type="submit" size="sm" :loading="busy === 'rename'" :blocked="!isNameValid">
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
        <ConfirmDeleteButton
          :armed="confirmDelete.isArmed(upload.id)"
          :busy="busy === 'delete'"
          icon
          @click="onDelete"
        />
      </div>
    </div>
  </li>
</template>

<style scoped>
.row {
  display: grid;
  gap: var(--sp-3);
  padding: var(--sp-4) 0;
  border-bottom: var(--edge) solid var(--c-hairline);
}

.copied-note {
  font-size: var(--fs-sm);
  font-weight: 600;
  color: var(--c-ink-soft);
  font-variant-numeric: tabular-nums;
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

/* Each fact stays whole, and its dot stays with it, so a wrapped line starts with a fact. */
.row__fact {
  white-space: nowrap;
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
