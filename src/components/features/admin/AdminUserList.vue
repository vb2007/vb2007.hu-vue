<script setup lang="ts">
import { computed, onMounted } from "vue";
import { useAdminUsers } from "@/composables/useAdminUsers";
import { Limits } from "@/constants/limits";
import type { AdminUserSortBy } from "@/types/api/admin";
import BaseButton from "@/components/ui/BaseButton.vue";
import BaseInput from "@/components/ui/BaseInput.vue";
import ListPager from "@/components/ui/ListPager.vue";
import SortSelect, { type SortOption } from "@/components/ui/SortSelect.vue";
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

const SORT_OPTIONS: SortOption<AdminUserSortBy>[] = [
  { by: "usedBytes", order: "desc", label: "Most storage used" },
  { by: "usedBytes", order: "asc", label: "Least storage used" },
  { by: "username", order: "asc", label: "Name, A to Z" },
  { by: "username", order: "desc", label: "Name, Z to A" },
  { by: "createdAt", order: "desc", label: "Newest accounts" },
  { by: "createdAt", order: "asc", label: "Oldest accounts" }
];

const isSearching = computed(() => Boolean(query.value.trim()));

onMounted(load);
</script>

<template>
  <StationBoard title="Users" :as="as">
    <div class="filters">
      <BaseInput
        v-model="query"
        type="search"
        label="Search by username or e-mail"
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
      {{ pagination.total }} {{ pagination.total === 1 ? "user" : "users" }}
      <template v-if="isSearching">found</template>
    </p>

    <StatusMessage v-if="errorMessage" tone="error">{{ errorMessage }}</StatusMessage>

    <p v-if="isLoading && !pagination" class="note">Loading the users…</p>
    <div v-else-if="pagination && pagination.total === 0" class="empty">
      <template v-if="isSearching">
        <p class="note">No username or e-mail address matches that search.</p>
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
</style>
