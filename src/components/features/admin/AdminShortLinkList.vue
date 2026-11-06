<script setup lang="ts">
import { computed, nextTick, onMounted, ref, useTemplateRef } from "vue";
import { RouterLink } from "vue-router";
import { AdminRoutes } from "@/constants/admin";
import { Limits } from "@/constants/limits";
import { Messages } from "@/constants/messages";
import { useAdminShortLinks } from "@/composables/useAdminShortLinks";
import { useConfirmDelete } from "@/composables/useConfirmDelete";
import { formatDateTime } from "@/scripts/utility/dateUtil";
import { addressParts, readableAddress } from "@/scripts/utility/text";
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
  deleteError,
  isDeleting,
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

const list = useTemplateRef("list");
const count = useTemplateRef("count");

/** The last delete, for screen readers: its row and key are gone. */
const deletedNote = ref("");

const isListed = (code: string) => links.value.some((link) => link.shortenedUrl === code);

/** A failed delete whose link left the list (a 404: it was gone already) shows above it instead. */
const unlistedError = computed(() => deleteError.value.code && !isListed(deleteError.value.code));

/**
 * The deleted row took the focused key with it, so focus goes to the delete key that took its
 * place, else the one above, else the count. Not when focus moved on meanwhile.
 */
const refocus = async (index: number) => {
  await nextTick();
  if (document.activeElement && document.activeElement !== document.body) return;
  const keys = list.value?.querySelectorAll<HTMLElement>("[data-delete]") ?? [];
  (keys[index] ?? keys[index - 1] ?? count.value)?.focus();
};

const confirmDelete = useConfirmDelete();
const onDelete = (code: string) =>
  confirmDelete.press(code, async () => {
    const index = links.value.findIndex((link) => link.shortenedUrl === code);
    deletedNote.value = "";
    const deleted = await remove(code);
    if (deleted) deletedNote.value = Messages.ShortUrl.deleted(code);
    if (!isListed(code)) await refocus(index);
  });

/**
 * Where a link leads, host first: that's what a check is after, so it's the host the browser
 * goes to (see `addressParts`). Anyone can make a link, so every part is shown safe, with no
 * invisible or reordering characters, and so is the whole target in the tooltip.
 */
const targetOf = (url: string) => {
  const { scheme, userinfo, host, rest } = addressParts(url);
  return {
    scheme,
    userinfo: readableAddress(userinfo),
    host: readableAddress(host),
    rest: readableAddress(rest),
    full: readableAddress(url)
  };
};

const rows = computed(() =>
  links.value.map((link) => ({ ...link, target: targetOf(link.originalUrl) }))
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

    <p v-if="pagination" ref="count" class="count" tabindex="-1">
      {{ pagination.total }} {{ pagination.total === 1 ? "short link" : "short links" }}
      <template v-if="isSearching">found</template>
    </p>

    <StatusMessage v-if="errorMessage" tone="error">{{ errorMessage }}</StatusMessage>
    <BaseButton
      v-if="errorMessage && !pagination"
      class="retry"
      size="sm"
      variant="secondary"
      :loading="isLoading"
      @click="load"
    >
      Try again
    </BaseButton>
    <StatusMessage v-if="unlistedError" tone="error">
      <span class="error-code">{{ deleteError.code }}</span
      >: {{ deleteError.message }}
    </StatusMessage>

    <p v-if="isLoading && !pagination" class="note">Loading the short links…</p>
    <div v-else-if="pagination && pagination.total === 0" class="empty">
      <template v-if="isSearching">
        <p class="note">No code, target or owner matches that search.</p>
        <BaseButton size="sm" variant="secondary" @click="query = ''">Show every link</BaseButton>
      </template>
      <p v-else class="note">No short links yet.</p>
    </div>

    <ol v-if="rows.length" ref="list" class="rows" :aria-busy="isLoading || undefined">
      <li v-for="link in rows" :key="link.shortenedUrl" class="row">
        <RouterLink
          :to="{ name: 'redirect-preview', params: { code: link.shortenedUrl } }"
          class="row__code"
        >
          {{ link.shortenedUrl }}
        </RouterLink>
        <p class="row__target" :title="link.target.full">
          <AppIcon name="arrow" :size="16" class="row__arrow" />
          <span class="visually-hidden">Leads to</span>
          <span class="row__url">
            <span v-if="link.target.scheme">{{ link.target.scheme }}</span>
            <span v-if="link.target.userinfo">{{ link.target.userinfo }}</span>
            <span v-if="link.target.host" class="row__host">{{ link.target.host }}</span>
            <span>{{ link.target.rest }}</span>
          </span>
        </p>
        <p class="row__meta">
          <RouterLink
            v-if="link.owner"
            class="meta-link"
            :to="{ name: AdminRoutes.user, params: { id: link.owner.id } }"
            >{{ link.owner.username }}</RouterLink
          >
          <span v-else class="row__gone">Deleted account</span>
          ·
          <time :datetime="link.addedOn">{{ formatDateTime(link.addedOn) }}</time>
        </p>
        <div class="row__actions">
          <ConfirmDeleteButton
            data-delete
            :armed="confirmDelete.isArmed(link.shortenedUrl)"
            :busy="isDeleting(link.shortenedUrl)"
            @click="onDelete(link.shortenedUrl)"
          >
            <span class="visually-hidden">{{ link.shortenedUrl }}</span>
          </ConfirmDeleteButton>
        </div>
        <StatusMessage
          v-if="deleteError.code === link.shortenedUrl"
          class="row__error"
          tone="error"
        >
          {{ deleteError.message }}
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

    <p class="visually-hidden" role="status">{{ deletedNote }}</p>
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

.count:focus {
  outline: none;
}

.retry {
  justify-self: start;
}

.error-code {
  font-family: var(--font-code);
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

.row__code:focus-visible {
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

.row__gone {
  font-weight: 600;
}

.row__error {
  grid-column: 1 / -1;
  margin-top: var(--sp-2);
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
}
</style>
