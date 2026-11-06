<script setup lang="ts">
import { computed, onMounted } from "vue";
import { RouterLink } from "vue-router";
import { AdminRoutes } from "@/constants/admin";
import { Limits } from "@/constants/limits";
import { useAdminPastes } from "@/composables/useAdminPastes";
import { useConfirmDelete } from "@/composables/useConfirmDelete";
import { languageLabel, PLAINTEXT } from "@/scripts/pastebin/languages";
import { pastePreview } from "@/scripts/pastebin/paste";
import { formatDateTime } from "@/scripts/utility/dateUtil";
import type { AdminPaste } from "@/types/api/admin";
import type { PasteSortBy } from "@/types/api/pastebin";
import BaseButton from "@/components/ui/BaseButton.vue";
import BaseInput from "@/components/ui/BaseInput.vue";
import ConfirmDeleteButton from "@/components/ui/ConfirmDeleteButton.vue";
import ListPager from "@/components/ui/ListPager.vue";
import SortSelect, { type SortOption } from "@/components/ui/SortSelect.vue";
import StationBoard from "@/components/ui/StationBoard.vue";
import StatusMessage from "@/components/ui/StatusMessage.vue";

withDefaults(defineProps<{ as?: "h1" | "h2" }>(), { as: "h2" });

const {
  pastes,
  pagination,
  page,
  sortBy,
  sortOrder,
  query,
  isLoading,
  errorMessage,
  deletingId,
  rowError,
  load,
  goToPage,
  setSort,
  remove
} = useAdminPastes();

const SORT_OPTIONS: SortOption<PasteSortBy>[] = [
  { by: "addedOn", order: "desc", label: "Newest first" },
  { by: "addedOn", order: "asc", label: "Oldest first" }
];

const isSearching = computed(() => Boolean(query.value.trim()));

const confirmDelete = useConfirmDelete();
const onDelete = (id: string) => confirmDelete.press(id, () => remove(id));

/**
 * The preview's first line, with an ellipsis when the API cut it off (it runs to the preview's
 * end); "" for a paste that opens with more blank space than the preview holds.
 */
const previewOf = ({ preview }: AdminPaste) => {
  const line = pastePreview(preview);
  const isCut =
    [...preview].length >= Limits.Paste.previewLength && !preview.trimStart().includes("\n");
  return line && isCut ? `${line}…` : line;
};

/** Whose paste it is, for the delete key's name. */
const whoseOf = (paste: AdminPaste) =>
  paste.owner ? `${paste.owner.username}'s paste` : "the paste of a deleted account";

onMounted(load);
</script>

<template>
  <StationBoard title="Pastes" :as="as">
    <div class="filters">
      <BaseInput
        v-model="query"
        type="search"
        label="Search by owner or language"
        :maxlength="Limits.Search.maxLength"
      />
      <SortSelect
        :options="SORT_OPTIONS"
        :sort-by="sortBy"
        :sort-order="sortOrder"
        @change="setSort"
      />
    </div>

    <p v-if="pagination" class="count">
      {{ pagination.total }} {{ pagination.total === 1 ? "paste" : "pastes" }}
      <template v-if="isSearching">found</template>
    </p>

    <StatusMessage v-if="errorMessage" tone="error">{{ errorMessage }}</StatusMessage>

    <p v-if="isLoading && !pagination" class="note">Loading the pastes…</p>
    <div v-else-if="pagination && pagination.total === 0" class="empty">
      <template v-if="isSearching">
        <p class="note">No owner or language matches that search.</p>
        <BaseButton size="sm" variant="secondary" @click="query = ''">Show every paste</BaseButton>
      </template>
      <p v-else class="note">No pastes yet.</p>
    </div>

    <ol v-if="pastes.length" class="rows" :aria-busy="isLoading || undefined">
      <li v-for="paste in pastes" :key="paste.id" class="row">
        <RouterLink v-if="previewOf(paste)" :to="`/pastebin/${paste.id}`" class="row__preview">
          {{ previewOf(paste) }}
        </RouterLink>
        <!-- Not code, so it reads as a note in the body face. -->
        <RouterLink v-else :to="`/pastebin/${paste.id}`" class="row__preview row__preview--blank">
          Opens with blank lines
        </RouterLink>
        <p class="row__meta">
          <RouterLink
            v-if="paste.owner"
            class="row__owner"
            :to="{ name: AdminRoutes.user, params: { id: paste.owner.id } }"
            >{{ paste.owner.username }}</RouterLink
          >
          <span v-else class="row__gone">Deleted account</span>
          · <span class="row__language">{{ languageLabel(paste.language ?? PLAINTEXT) }}</span> ·
          <time :datetime="paste.addedOn">{{ formatDateTime(paste.addedOn) }}</time>
        </p>
        <div class="row__actions">
          <ConfirmDeleteButton
            :armed="confirmDelete.isArmed(paste.id)"
            :busy="deletingId === paste.id"
            :disabled="Boolean(deletingId) && deletingId !== paste.id"
            @click="onDelete(paste.id)"
          >
            <span class="visually-hidden">{{ whoseOf(paste) }}</span>
          </ConfirmDeleteButton>
        </div>
        <StatusMessage v-if="rowError.id === paste.id" class="row__error" tone="error">
          {{ rowError.message }}
        </StatusMessage>
      </li>
    </ol>

    <ListPager
      v-if="pagination"
      :page="page"
      :pages="pagination.pages"
      :disabled="isLoading"
      @go="goToPage"
    />
  </StationBoard>
</template>

<style scoped>
.filters {
  display: grid;
  gap: var(--sp-4);
}

@media (min-width: 36rem) {
  .filters {
    grid-template-columns: minmax(0, 2fr) minmax(0, 1fr);
    align-items: end;
  }
}

.count,
.note {
  color: var(--c-ink-soft);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.empty {
  display: grid;
  justify-items: start;
  gap: var(--sp-3);
}

.rows {
  display: grid;
  margin: 0;
  padding: 0;
  list-style: none;
  border-top: var(--edge) solid var(--c-hairline);
  /* Rows lay out by the board's width, not the viewport's. */
  container-type: inline-size;
}

.rows[aria-busy] {
  opacity: 0.6;
  transition: opacity var(--dur-quick) ease;
}

.row {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--sp-1) var(--sp-4);
  padding: var(--sp-4) 0;
  border-bottom: var(--edge) solid var(--c-hairline);
}

/* The paste's opening line in the code face: the row's way in. */
.row__preview {
  overflow: hidden;
  font-family: var(--font-code);
  font-size: 0.95rem;
  font-weight: 500;
  color: var(--c-ink);
  white-space: nowrap;
  text-overflow: ellipsis;
  text-decoration-color: var(--c-line);
}

.row__preview--blank {
  font-family: var(--font-sans);
  font-size: var(--fs-sm);
  font-weight: 600;
  color: var(--c-ink-soft);
}

.row__preview:focus-visible {
  outline: 3px solid var(--c-line);
  outline-offset: 3px;
}

.row__meta {
  font-size: var(--fs-sm);
  color: var(--c-ink-soft);
  font-variant-numeric: tabular-nums;
  overflow-wrap: anywhere;
}

/* The owner's account page, as a text link like the Users rows' "View account". */
.row__owner {
  color: var(--c-action);
  font-weight: 600;
  text-decoration: underline;
  text-decoration-color: var(--c-hairline);
  text-decoration-thickness: 2px;
  text-underline-offset: 0.2em;
  transition: text-decoration-color var(--dur-quick) ease;
}

.row__owner:hover {
  text-decoration-color: var(--c-line);
}

.row__owner:focus-visible {
  outline: 3px solid var(--c-line);
  outline-offset: 3px;
}

.row__gone {
  font-weight: 600;
}

.row__language {
  color: var(--c-ink);
}

.row__actions {
  display: flex;
  margin-top: var(--sp-2);
}

/* Wide enough: preview and details on the left, the delete key to the right of both. */
@container (min-width: 30rem) {
  .row {
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
  }

  .row__actions {
    grid-column: 2;
    grid-row: 1 / span 2;
    margin-top: 0;
  }

  .row__error {
    grid-column: 1 / -1;
  }
}
</style>
