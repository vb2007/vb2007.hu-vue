<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { RouterLink } from "vue-router";
import { AdminRoutes } from "@/constants/admin";
import { Limits } from "@/constants/limits";
import { useAdminShortLinks } from "@/composables/useAdminShortLinks";
import { useConfirmDelete } from "@/composables/useConfirmDelete";
import { formatDateTime } from "@/scripts/utility/dateUtil";
import { linkParts, readableAddress } from "@/scripts/utility/text";
import type { ShortUrlSortBy } from "@/types/api/shortener";
import AppIcon from "@/components/ui/AppIcon.vue";
import BaseButton from "@/components/ui/BaseButton.vue";
import BaseInput from "@/components/ui/BaseInput.vue";
import ConfirmDeleteButton from "@/components/ui/ConfirmDeleteButton.vue";
import ListPager from "@/components/ui/ListPager.vue";
import SortSelect, { type SortOption } from "@/components/ui/SortSelect.vue";
import StationBoard from "@/components/ui/StationBoard.vue";
import StatusMessage from "@/components/ui/StatusMessage.vue";

withDefaults(defineProps<{ as?: "h1" | "h2" }>(), { as: "h2" });

const {
  links,
  pagination,
  page,
  sortBy,
  sortOrder,
  query,
  isLoading,
  errorMessage,
  deletingCode,
  deleteError,
  load,
  goToPage,
  setSort,
  remove
} = useAdminShortLinks();

const SORT_OPTIONS: SortOption<ShortUrlSortBy>[] = [
  { by: "addedOn", order: "desc", label: "Newest first" },
  { by: "addedOn", order: "asc", label: "Oldest first" }
];

const isSearching = computed(() => Boolean(query.value.trim()));

const confirmDelete = useConfirmDelete();
/** The code of the last delete, so its refusal shows on its row, next to the key. */
const deletedCode = ref("");
const onDelete = (code: string) =>
  confirmDelete.press(code, () => {
    deletedCode.value = code;
    return remove(code);
  });

/**
 * Where a link leads, host first: that's what a check is after. Anyone can make a link, so every
 * part is shown safe (no invisible or reordering characters), and the whole target stays the
 * tooltip.
 */
const targetOf = (url: string) => {
  const { scheme, host, rest } = linkParts(url);
  return { scheme, host: readableAddress(host), rest: readableAddress(rest) };
};

const rows = computed(() =>
  links.value.map((link) => ({ ...link, target: targetOf(link.originalUrl) }))
);

/** A refused delete whose row is still listed shows there; one that dropped out (a 404) on top. */
const isRowError = (code: string) => Boolean(deleteError.value) && deletedCode.value === code;
const topDeleteError = computed(() =>
  rows.value.some((link) => isRowError(link.shortenedUrl)) ? "" : deleteError.value
);

onMounted(load);
</script>

<template>
  <StationBoard title="Short links" :as="as">
    <div class="filters">
      <BaseInput
        v-model="query"
        type="search"
        label="Search by code, target or owner"
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
      {{ pagination.total }} {{ pagination.total === 1 ? "short link" : "short links" }}
      <template v-if="isSearching">found</template>
    </p>

    <StatusMessage v-if="errorMessage" tone="error">{{ errorMessage }}</StatusMessage>
    <StatusMessage v-if="topDeleteError" tone="error">{{ topDeleteError }}</StatusMessage>

    <p v-if="isLoading && !pagination" class="note">Loading the short links…</p>
    <div v-else-if="pagination && pagination.total === 0" class="empty">
      <template v-if="isSearching">
        <p class="note">No code, target or owner matches that search.</p>
        <BaseButton size="sm" variant="secondary" @click="query = ''">Show every link</BaseButton>
      </template>
      <p v-else class="note">No short links yet.</p>
    </div>

    <ol v-if="rows.length" class="rows" :aria-busy="isLoading || undefined">
      <li v-for="link in rows" :key="link.shortenedUrl" class="row">
        <RouterLink
          :to="{ name: 'redirect-preview', params: { code: link.shortenedUrl } }"
          class="row__code"
        >
          {{ link.shortenedUrl }}
        </RouterLink>
        <p class="row__target" :title="link.originalUrl">
          <AppIcon name="arrow" :size="16" class="row__arrow" />
          <span class="visually-hidden">Leads to</span>
          <span class="row__url">
            <span v-if="link.target.scheme">{{ link.target.scheme }}</span>
            <span class="row__host">{{ link.target.host }}</span>
            <span>{{ link.target.rest }}</span>
          </span>
        </p>
        <p class="row__meta">
          <RouterLink
            v-if="link.owner"
            class="row__owner"
            :to="{ name: AdminRoutes.user, params: { id: link.owner.id } }"
            >{{ link.owner.username }}</RouterLink
          >
          <span v-else class="row__gone">Deleted account</span>
          ·
          <time :datetime="link.addedOn">{{ formatDateTime(link.addedOn) }}</time>
        </p>
        <div class="row__actions">
          <ConfirmDeleteButton
            :armed="confirmDelete.isArmed(link.shortenedUrl)"
            :busy="deletingCode === link.shortenedUrl"
            @click="onDelete(link.shortenedUrl)"
          >
            <span class="visually-hidden">{{ link.shortenedUrl }}</span>
          </ConfirmDeleteButton>
        </div>
        <StatusMessage v-if="isRowError(link.shortenedUrl)" class="row__error" tone="error">
          {{ deleteError }}
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

.row__code {
  justify-self: start;
  font-family: var(--font-code);
  font-size: var(--fs-base);
  font-weight: 600;
  color: var(--c-ink);
  text-decoration-color: var(--c-line);
  overflow-wrap: anywhere;
}

.row__code:focus-visible,
.row__owner:focus-visible {
  outline: 3px solid var(--c-line);
  outline-offset: 3px;
}

/* The code leads to its target: a stretch of route green, then the address on one line. */
.row__target {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  min-width: 0;
  font-family: var(--font-code);
  font-size: var(--fs-sm);
  font-weight: 500;
  color: var(--c-ink-soft);
}

.row__arrow {
  flex: none;
  color: var(--c-line);
}

.row__url {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

/* The host is what a check reads first, so it stands out of the rest of the address. */
.row__host {
  font-weight: 600;
  color: var(--c-ink);
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

.row__gone {
  font-weight: 600;
}

.row__actions {
  display: flex;
  margin-top: var(--sp-2);
}

/* Wide enough: code, target and details on the left, the delete key to the right of all three. */
@container (min-width: 30rem) {
  .row {
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
  }

  .row__actions {
    grid-column: 2;
    grid-row: 1 / span 3;
    margin-top: 0;
  }

  .row__error {
    grid-column: 1 / -1;
  }
}
</style>
