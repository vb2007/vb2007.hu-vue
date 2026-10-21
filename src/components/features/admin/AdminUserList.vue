<script setup lang="ts">
import { computed, onMounted } from "vue";
import { useAdminUsers } from "@/composables/useAdminUsers";
import type { AdminUserSortBy, SortOrder } from "@/scripts/admin/adminUser";
import BaseButton from "@/components/ui/BaseButton.vue";
import BaseInput from "@/components/ui/BaseInput.vue";
import BaseSelect from "@/components/ui/BaseSelect.vue";
import StationBoard from "@/components/ui/StationBoard.vue";
import StatusMessage from "@/components/ui/StatusMessage.vue";
import AdminUserRow from "./AdminUserRow.vue";

withDefaults(defineProps<{ as?: "h1" | "h2" }>(), { as: "h2" });

const {
  users,
  pagination,
  page,
  sortBy,
  sortOrder,
  query,
  isLoading,
  errorMessage,
  savingId,
  rowError,
  load,
  goToPage,
  setSort,
  setQuota
} = useAdminUsers();

type SortKey = `${AdminUserSortBy}:${SortOrder}`;
const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "usedBytes:desc", label: "Most storage used" },
  { value: "usedBytes:asc", label: "Least storage used" },
  { value: "username:asc", label: "Name, A to Z" },
  { value: "username:desc", label: "Name, Z to A" },
  { value: "createdAt:desc", label: "Newest accounts" },
  { value: "createdAt:asc", label: "Oldest accounts" }
];
const sort = computed<SortKey>({
  get: () => `${sortBy.value}:${sortOrder.value}` as SortKey,
  set: (key: SortKey) => {
    const [by, order] = key.split(":") as [AdminUserSortBy, SortOrder];
    setSort(by, order);
  }
});

const isSearching = computed(() => Boolean(query.value.trim()));

onMounted(load);
</script>

<template>
  <StationBoard title="Upload quotas" :as="as">
    <div class="filters">
      <BaseInput v-model="query" type="search" label="Search by username" />
      <BaseSelect v-model="sort" label="Sort" :options="SORT_OPTIONS" />
    </div>

    <p v-if="pagination" class="count">
      {{ pagination.total }} {{ pagination.total === 1 ? "user" : "users" }}
      <template v-if="isSearching">found</template>
    </p>

    <StatusMessage v-if="errorMessage" tone="error">{{ errorMessage }}</StatusMessage>

    <p v-if="isLoading && !pagination" class="note">Loading the users…</p>
    <div v-else-if="pagination && pagination.total === 0" class="empty">
      <template v-if="isSearching">
        <p class="note">No username matches that search.</p>
        <BaseButton size="sm" variant="secondary" @click="query = ''">Show everyone</BaseButton>
      </template>
      <p v-else class="note">No accounts yet.</p>
    </div>

    <ol v-if="users.length" class="rows" :aria-busy="isLoading || undefined">
      <AdminUserRow
        v-for="user in users"
        :key="user.id"
        :user="user"
        :saving="savingId === user.id"
        :error="rowError.id === user.id ? rowError.message : ''"
        :set-quota="setQuota"
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
}

@media (min-width: 36rem) {
  .filters {
    grid-template-columns: minmax(0, 2fr) minmax(0, 1fr);
    align-items: end;
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
  /* Rows lay out by the board's width, not the viewport's. */
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
