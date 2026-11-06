<script setup lang="ts">
import { computed, onMounted } from "vue";
import { useUploads, type UploadListing } from "@/composables/useUploads";
import { Limits } from "@/constants/limits";
import type { UploadSortBy, UploadVisibility } from "@/types/api/uploads";
import BaseButton from "@/components/ui/BaseButton.vue";
import BaseInput from "@/components/ui/BaseInput.vue";
import ListPager from "@/components/ui/ListPager.vue";
import SegmentedControl, { type Segment } from "@/components/ui/SegmentedControl.vue";
import SortSelect, { type SortOption } from "@/components/ui/SortSelect.vue";
import StationBoard from "@/components/ui/StationBoard.vue";
import StatusMessage from "@/components/ui/StatusMessage.vue";
import UploadRow from "./UploadRow.vue";

const props = withDefaults(
  defineProps<{
    /** Another listing than the user's own, e.g. one user's uploads for the admin. */
    listing?: UploadListing;
    as?: "h1" | "h2";
  }>(),
  { listing: undefined, as: "h2" }
);
const emit = defineEmits<{ changed: [] }>();

const {
  uploads,
  pagination,
  owner,
  ownerName,
  page,
  sortBy,
  sortOrder,
  visibilityFilter,
  query,
  isLoading,
  errorMessage,
  busyId,
  busyAction,
  rowError,
  load,
  goToPage,
  setSort,
  setVisibilityFilter,
  rename,
  setVisibility,
  remove
} = useUploads(undefined, props.listing);

/** Someone else's uploads read differently from your own. */
const isOthers = computed(() => Boolean(props.listing));
const title = computed(() => {
  if (!isOthers.value) return "Your uploads";
  return ownerName.value ? `${ownerName.value}'s uploads` : "Uploads";
});
const loadingNote = computed(() => {
  if (!isOthers.value) return "Loading your uploads…";
  return ownerName.value ? `Loading ${ownerName.value}'s uploads…` : "Loading this user's uploads…";
});

const SORT_OPTIONS: SortOption<UploadSortBy>[] = [
  { by: "uploadedOn", order: "desc", label: "Newest first" },
  { by: "uploadedOn", order: "asc", label: "Oldest first" },
  { by: "originalFileName", order: "asc", label: "Name, A to Z" },
  { by: "originalFileName", order: "desc", label: "Name, Z to A" },
  { by: "fileSize", order: "desc", label: "Largest first" },
  { by: "fileSize", order: "asc", label: "Smallest first" }
];

type Filter = UploadVisibility | "all";
const FILTER_OPTIONS: Segment<Filter>[] = [
  { value: "all", label: "All" },
  { value: "public", label: "Public", icon: "globe" },
  { value: "private", label: "Private", icon: "lock" }
];
const filter = computed<Filter>({
  get: () => visibilityFilter.value || "all",
  set: (value) => setVisibilityFilter(value === "all" ? "" : value)
});

const isNarrowed = computed(() => Boolean(query.value.trim() || visibilityFilter.value));
const clearFilters = () => {
  query.value = "";
  setVisibilityFilter("");
};

// Deleting frees space, so the storage meter needs to hear about it.
const removeAndTell = async (id: string) => {
  const removed = await remove(id);
  if (removed) emit("changed");
  return removed;
};

onMounted(load);

/** Called after a new upload lands, so it shows up without a page reload. */
defineExpose({ refresh: () => goToPage(1) });
</script>

<template>
  <StationBoard :title="title" :as="as">
    <div class="filters">
      <BaseInput
        v-model="query"
        class="filters__search"
        type="search"
        label="Search by name"
        :maxlength="Limits.Search.maxLength"
      />
      <SegmentedControl v-model="filter" legend="Show" :options="FILTER_OPTIONS" size="sm" />
      <SortSelect
        :options="SORT_OPTIONS"
        :sort-by="sortBy"
        :sort-order="sortOrder"
        size="sm"
        @change="setSort"
      />
    </div>

    <p v-if="pagination" class="count">
      {{ pagination.total }} {{ pagination.total === 1 ? "upload" : "uploads" }}
      <template v-if="isNarrowed">found</template>
    </p>

    <StatusMessage v-if="errorMessage" tone="error">{{ errorMessage }}</StatusMessage>

    <p v-if="isLoading && !pagination" class="note">{{ loadingNote }}</p>
    <div v-else-if="pagination && pagination.total === 0" class="empty">
      <template v-if="isNarrowed">
        <p class="note">No uploads match. Try another name, or show all of them.</p>
        <BaseButton size="sm" variant="secondary" @click="clearFilters"
          >Show all uploads</BaseButton
        >
      </template>
      <p v-else-if="isOthers" class="note">No uploads.</p>
      <p v-else class="note">
        No uploads yet. Drop a file on the Upload board, or choose one, and it shows up here.
      </p>
    </div>

    <ol v-if="uploads.length" class="rows" :aria-busy="isLoading || undefined">
      <UploadRow
        v-for="upload in uploads"
        :key="upload.id"
        :upload="upload"
        :owner-name="owner?.username"
        :busy="busyId === upload.id ? busyAction : ''"
        :error="rowError.id === upload.id ? rowError.message : ''"
        :rename="rename"
        :set-visibility="setVisibility"
        :remove="removeAndTell"
      />
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
  container-type: inline-size;
}

/* Search across the top, then the filter and sort side by side once there's room. */
@media (min-width: 36rem) {
  .filters {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    align-items: end;
  }

  .filters__search {
    grid-column: 1 / -1;
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
  /* The board decides the row layout, so it works in the split workspace and on phones alike. */
  container-type: inline-size;
}

.rows[aria-busy] {
  opacity: 0.6;
  transition: opacity var(--dur-quick) ease;
}
</style>
