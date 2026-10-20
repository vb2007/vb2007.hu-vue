<script setup lang="ts">
import { computed, onMounted } from "vue";
import { useUploads } from "@/composables/useUploads";
import type { SortOrder, UploadSortBy, UploadVisibility } from "@/scripts/uploads/upload";
import BaseButton from "@/components/ui/BaseButton.vue";
import BaseInput from "@/components/ui/BaseInput.vue";
import BaseSelect from "@/components/ui/BaseSelect.vue";
import SegmentedControl, { type Segment } from "@/components/ui/SegmentedControl.vue";
import StationBoard from "@/components/ui/StationBoard.vue";
import StatusMessage from "@/components/ui/StatusMessage.vue";
import UploadRow from "./UploadRow.vue";

const emit = defineEmits<{ changed: [] }>();

const {
  uploads,
  pagination,
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
} = useUploads();

type SortKey = `${UploadSortBy}:${SortOrder}`;
const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "uploadedOn:desc", label: "Newest first" },
  { value: "uploadedOn:asc", label: "Oldest first" },
  { value: "originalFileName:asc", label: "Name, A to Z" },
  { value: "originalFileName:desc", label: "Name, Z to A" },
  { value: "fileSize:desc", label: "Largest first" },
  { value: "fileSize:asc", label: "Smallest first" }
];
const sort = computed<SortKey>({
  get: () => `${sortBy.value}:${sortOrder.value}` as SortKey,
  set: (key: SortKey) => {
    const [by, order] = key.split(":") as [UploadSortBy, SortOrder];
    setSort(by, order);
  }
});

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
  <StationBoard title="Your uploads">
    <div class="filters">
      <BaseInput v-model="query" class="filters__search" type="search" label="Search by name" />
      <SegmentedControl v-model="filter" legend="Show" :options="FILTER_OPTIONS" size="sm" />
      <BaseSelect v-model="sort" label="Sort" :options="SORT_OPTIONS" size="sm" />
    </div>

    <p v-if="pagination" class="count">
      {{ pagination.total }} {{ pagination.total === 1 ? "upload" : "uploads" }}
      <template v-if="isNarrowed">found</template>
    </p>

    <StatusMessage v-if="errorMessage" tone="error">{{ errorMessage }}</StatusMessage>

    <p v-if="isLoading && !pagination" class="note">Loading your uploads…</p>
    <div v-else-if="pagination && pagination.total === 0" class="empty">
      <template v-if="isNarrowed">
        <p class="note">No uploads match. Try another name, or show all of them.</p>
        <BaseButton size="sm" variant="secondary" @click="clearFilters"
          >Show all uploads</BaseButton
        >
      </template>
      <p v-else class="note">
        No uploads yet. Drop a file on the Upload board, or choose one, and it shows up here.
      </p>
    </div>

    <ol v-if="uploads.length" class="rows" :aria-busy="isLoading || undefined">
      <UploadRow
        v-for="upload in uploads"
        :key="upload.id"
        :upload="upload"
        :busy="busyId === upload.id ? busyAction : ''"
        :error="rowError.id === upload.id ? rowError.message : ''"
        :rename="rename"
        :set-visibility="setVisibility"
        :remove="removeAndTell"
      />
    </ol>

    <nav v-if="pagination && pagination.pages > 1" class="pager" aria-label="Pages">
      <BaseButton
        size="sm"
        variant="secondary"
        :disabled="isLoading || page <= 1"
        @click="goToPage(page - 1)"
      >
        Previous
      </BaseButton>
      <p class="pager__label">Page {{ page }} of {{ pagination.pages }}</p>
      <BaseButton
        size="sm"
        variant="secondary"
        :disabled="isLoading || page >= pagination.pages"
        @click="goToPage(page + 1)"
      >
        Next
      </BaseButton>
    </nav>
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
.pager__label,
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

.pager {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp-3);
}
</style>
