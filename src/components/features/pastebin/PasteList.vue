<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";
import { RouterLink } from "vue-router";
import { pasteLink, pastePreview, pasteSize } from "@/scripts/pastebin/paste";
import { formatDateTime } from "@/scripts/utility/dateUtil";
import { useClipboard } from "@/composables/useClipboard";
import { usePastes } from "@/composables/usePastes";
import BaseButton from "@/components/ui/BaseButton.vue";
import StationBoard from "@/components/ui/StationBoard.vue";
import StatusMessage from "@/components/ui/StatusMessage.vue";

const {
  pastes,
  pagination,
  page,
  sortOrder,
  isLoading,
  errorMessage,
  deletingId,
  deleteError,
  load,
  goToPage,
  setSortOrder,
  remove
} = usePastes();

const { copied, failed, copy } = useClipboard();
const copiedId = ref("");

const copyLink = (id: string) => {
  copiedId.value = id;
  return copy(pasteLink(id));
};

/** Deleting takes two clicks; the armed state wears off if the user moves on. */
const confirmingId = ref("");
let confirmTimer: ReturnType<typeof setTimeout> | undefined;

const disarm = () => {
  clearTimeout(confirmTimer);
  confirmingId.value = "";
};

const onDelete = (id: string) => {
  if (confirmingId.value !== id) {
    disarm();
    confirmingId.value = id;
    confirmTimer = setTimeout(disarm, 4000);
    return;
  }
  disarm();
  return remove(id);
};

const toggleSort = () => setSortOrder(sortOrder.value === "desc" ? "asc" : "desc");

onMounted(load);
onBeforeUnmount(() => clearTimeout(confirmTimer));

/** Called after a new paste is created, so it shows up without a page reload. */
defineExpose({ refresh: () => goToPage(1) });
</script>

<template>
  <StationBoard title="Your pastes">
    <div v-if="pagination" class="toolbar">
      <p class="toolbar__count">
        {{ pagination.total }} {{ pagination.total === 1 ? "paste" : "pastes" }}
      </p>
      <BaseButton
        v-if="pagination.total > 1"
        size="sm"
        variant="secondary"
        :disabled="isLoading"
        @click="toggleSort"
      >
        <span class="visually-hidden">Sort:</span>
        {{ sortOrder === "desc" ? "Newest first" : "Oldest first" }}
      </BaseButton>
    </div>

    <StatusMessage v-if="errorMessage" tone="error">{{ errorMessage }}</StatusMessage>
    <StatusMessage v-if="deleteError" tone="error">{{ deleteError }}</StatusMessage>

    <p v-if="isLoading && !pagination" class="note">Loading your pastes…</p>
    <p v-else-if="pagination && pagination.total === 0" class="note">
      No pastes yet. The ones you create show up here.
    </p>

    <ol v-if="pastes.length" class="pastes" :aria-busy="isLoading || undefined">
      <li v-for="paste in pastes" :key="paste._id" class="paste">
        <RouterLink :to="`/pastebin/${paste._id}`" class="paste__preview">
          {{ pastePreview(paste.content) }}
        </RouterLink>
        <p class="paste__meta">
          <time :datetime="paste.addedOn">{{ formatDateTime(paste.addedOn) }}</time> ·
          {{ pasteSize(paste.content) }}
        </p>
        <div class="paste__actions">
          <BaseButton size="sm" variant="secondary" @click="copyLink(paste._id)">
            {{
              copiedId === paste._id && copied
                ? "Copied"
                : copiedId === paste._id && failed
                  ? "Copy failed"
                  : "Copy link"
            }}
          </BaseButton>
          <!-- Armed, it turns solid red; the ghost variant's hover fill would wash that out. -->
          <BaseButton
            size="sm"
            :variant="confirmingId === paste._id ? 'primary' : 'ghost'"
            :error="confirmingId === paste._id"
            :loading="deletingId === paste._id"
            @click="onDelete(paste._id)"
          >
            {{
              deletingId === paste._id
                ? "Deleting"
                : confirmingId === paste._id
                  ? "Confirm delete"
                  : "Delete"
            }}
          </BaseButton>
        </div>
      </li>
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

    <p class="visually-hidden" role="status">{{ copied ? "Link copied to clipboard" : "" }}</p>
  </StationBoard>
</template>

<style scoped>
.toolbar,
.pager {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp-3);
}

.toolbar__count,
.pager__label,
.note {
  color: var(--c-ink-soft);
  font-weight: 600;
}

.pastes {
  display: grid;
  margin: 0;
  padding: 0;
  list-style: none;
  border-top: var(--edge) solid var(--c-hairline);
}

/* The board decides the row layout, so it works in the split workspace and on phones alike. */
.pastes {
  container-type: inline-size;
}

.paste {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--sp-1) var(--sp-4);
  padding: var(--sp-4) 0;
  border-bottom: var(--edge) solid var(--c-hairline);
}

.paste__preview {
  overflow: hidden;
  font-family: var(--font-code);
  font-size: 0.95rem;
  font-weight: 500;
  color: var(--c-ink);
  white-space: nowrap;
  text-overflow: ellipsis;
  text-decoration-color: var(--c-line);
}

.paste__meta {
  font-size: var(--fs-sm);
  color: var(--c-ink-soft);
  font-variant-numeric: tabular-nums;
}

.paste__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-2);
  margin-top: var(--sp-2);
}

/* Wide enough: preview and details on the left, actions to the right of both. */
@container (min-width: 30rem) {
  .paste {
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
  }

  .paste__actions {
    grid-column: 2;
    grid-row: 1 / span 2;
    flex-wrap: nowrap;
    margin-top: 0;
  }
}

.pager__label {
  font-variant-numeric: tabular-nums;
}
</style>
