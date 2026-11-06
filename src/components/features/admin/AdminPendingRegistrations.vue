<script setup lang="ts">
/** The sign-ups still waiting for their code: search by address, and remove one. */
import { computed, onMounted } from "vue";
import { Limits } from "@/constants/limits";
import { formatDateTime, isPast } from "@/scripts/utility/dateUtil";
import { useConfirmDelete } from "@/composables/useConfirmDelete";
import { usePendingRegistrations } from "@/composables/usePendingRegistrations";
import BaseButton from "@/components/ui/BaseButton.vue";
import BaseInput from "@/components/ui/BaseInput.vue";
import ConfirmDeleteButton from "@/components/ui/ConfirmDeleteButton.vue";
import ListPager from "@/components/ui/ListPager.vue";
import StationBoard from "@/components/ui/StationBoard.vue";
import StatusMessage from "@/components/ui/StatusMessage.vue";
import StatusPill from "@/components/ui/StatusPill.vue";

const {
  registrations,
  pagination,
  page,
  query,
  isLoading,
  errorMessage,
  removingId,
  removeError,
  load,
  goToPage,
  remove
} = usePendingRegistrations();

const confirmDelete = useConfirmDelete();
const onRemove = (id: string) => confirmDelete.press(id, () => remove(id));

const isSearching = computed(() => Boolean(query.value.trim()));

onMounted(load);
</script>

<template>
  <StationBoard title="Pending registrations">
    <p class="lead">
      Sign-ups whose code was never entered. Removing one voids its code, and the address can
      register again at once.
    </p>

    <BaseInput
      v-model="query"
      type="search"
      label="Search by e-mail"
      :maxlength="Limits.Search.maxLength"
    />

    <p v-if="pagination" class="count">
      {{ pagination.total }}
      {{ pagination.total === 1 ? "pending registration" : "pending registrations" }}
      <template v-if="isSearching">found</template>
    </p>

    <StatusMessage v-if="errorMessage" tone="error">{{ errorMessage }}</StatusMessage>
    <StatusMessage v-if="removeError" tone="error">{{ removeError }}</StatusMessage>

    <p v-if="isLoading && !pagination" class="note">Loading the pending registrations…</p>
    <div v-else-if="pagination && pagination.total === 0" class="empty">
      <template v-if="isSearching">
        <p class="note">No address matches that search.</p>
        <BaseButton size="sm" variant="secondary" @click="query = ''">Show all</BaseButton>
      </template>
      <p v-else class="note">No sign-up is waiting for its code.</p>
    </div>

    <ol v-if="registrations.length" class="rows" :aria-busy="isLoading || undefined">
      <li v-for="registration in registrations" :key="registration.id" class="row">
        <p class="row__email">{{ registration.email }}</p>
        <p class="row__meta">
          <template v-if="isPast(registration.expiresAt)">
            <StatusPill tone="danger">Expired</StatusPill>
            <time :datetime="registration.expiresAt">{{
              formatDateTime(registration.expiresAt)
            }}</time>
          </template>
          <template v-else>
            Expires
            <time :datetime="registration.expiresAt">{{
              formatDateTime(registration.expiresAt)
            }}</time>
          </template>
        </p>
        <ConfirmDeleteButton
          class="row__remove"
          :armed="confirmDelete.isArmed(registration.id)"
          :busy="removingId === registration.id"
          @click="onRemove(registration.id)"
        >
          <span class="visually-hidden">{{ registration.email }}</span>
        </ConfirmDeleteButton>
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
.lead {
  color: var(--c-ink-soft);
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
  grid-template-columns: minmax(0, 1fr) auto;
  grid-template-areas:
    "email remove"
    "meta remove";
  align-items: center;
  gap: var(--sp-1) var(--sp-4);
  padding: var(--sp-4) 0;
  border-bottom: var(--edge) solid var(--c-hairline);
}

.row__email {
  grid-area: email;
  font-weight: 600;
  overflow-wrap: anywhere;
}

.row__meta {
  grid-area: meta;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--sp-1) var(--sp-2);
  font-size: var(--fs-sm);
  color: var(--c-ink-soft);
  font-variant-numeric: tabular-nums;
}

.row__remove {
  grid-area: remove;
}
</style>
