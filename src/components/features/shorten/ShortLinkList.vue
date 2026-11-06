<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { RouterLink } from "vue-router";
import { Limits } from "@/constants/limits";
import { useClipboard } from "@/composables/useClipboard";
import { useConfirmDelete } from "@/composables/useConfirmDelete";
import { shortLink } from "@/composables/useShortener";
import { useShortLinks } from "@/composables/useShortLinks";
import { formatDateTime } from "@/scripts/utility/dateUtil";
import { displayLink } from "@/scripts/utility/text";
import AppIcon from "@/components/ui/AppIcon.vue";
import BaseButton from "@/components/ui/BaseButton.vue";
import BaseInput from "@/components/ui/BaseInput.vue";
import ConfirmDeleteButton from "@/components/ui/ConfirmDeleteButton.vue";
import ListPager from "@/components/ui/ListPager.vue";
import StationBoard from "@/components/ui/StationBoard.vue";
import StatusMessage from "@/components/ui/StatusMessage.vue";

const {
  links,
  pagination,
  page,
  query,
  isLoading,
  errorMessage,
  deletingCode,
  deleteError,
  load,
  goToPage,
  remove
} = useShortLinks();

const { copied, failed, copy } = useClipboard();
const copiedCode = ref("");

const copyLink = (code: string) => {
  copiedCode.value = code;
  return copy(shortLink(code));
};

const copyLabel = (code: string) => {
  if (copiedCode.value !== code) return "Copy link";
  return copied.value ? "Copied" : failed.value ? "Copy failed" : "Copy link";
};

const confirmDelete = useConfirmDelete();
const onDelete = (code: string) => confirmDelete.press(code, () => remove(code));

const isSearching = computed(() => Boolean(query.value.trim()));

onMounted(load);

/** Called after a link is shortened, so it shows up without a page reload. */
defineExpose({ refresh: () => goToPage(1) });
</script>

<template>
  <StationBoard title="Your links">
    <BaseInput
      v-model="query"
      type="search"
      label="Search by code or target"
      :maxlength="Limits.Search.maxLength"
    />

    <p v-if="pagination" class="count">
      {{ pagination.total }} {{ pagination.total === 1 ? "link" : "links" }}
      <template v-if="isSearching">found</template>
    </p>

    <StatusMessage v-if="errorMessage" tone="error">{{ errorMessage }}</StatusMessage>
    <StatusMessage v-if="deleteError" tone="error">{{ deleteError }}</StatusMessage>

    <p v-if="isLoading && !pagination" class="note">Loading your links…</p>
    <div v-else-if="pagination && pagination.total === 0" class="empty">
      <template v-if="isSearching">
        <p class="note">No links match. Try another code or address, or show all of them.</p>
        <BaseButton size="sm" variant="secondary" @click="query = ''">Show all links</BaseButton>
      </template>
      <p v-else class="note">No short links yet. The ones you shorten show up here.</p>
    </div>

    <ol v-if="links.length" class="links" :aria-busy="isLoading || undefined">
      <li v-for="link in links" :key="link.shortenedUrl" class="link">
        <RouterLink
          :to="{ name: 'redirect-preview', params: { code: link.shortenedUrl } }"
          class="link__code"
        >
          {{ link.shortenedUrl }}
        </RouterLink>
        <p class="link__target" :title="link.originalUrl">
          <AppIcon name="arrow" :size="16" class="link__arrow" />
          <span class="visually-hidden">Leads to</span>
          <span class="link__url">{{ displayLink(link.originalUrl) }}</span>
        </p>
        <p class="link__meta">
          <time :datetime="link.addedOn">{{ formatDateTime(link.addedOn) }}</time>
        </p>
        <div class="link__actions">
          <BaseButton size="sm" variant="secondary" @click="copyLink(link.shortenedUrl)">
            {{ copyLabel(link.shortenedUrl) }}
            <span class="visually-hidden">{{ link.shortenedUrl }}</span>
          </BaseButton>
          <ConfirmDeleteButton
            :armed="confirmDelete.isArmed(link.shortenedUrl)"
            :busy="deletingCode === link.shortenedUrl"
            @click="onDelete(link.shortenedUrl)"
          >
            <span class="visually-hidden">{{ link.shortenedUrl }}</span>
          </ConfirmDeleteButton>
        </div>
      </li>
    </ol>

    <ListPager
      v-if="pagination"
      :page="page"
      :pages="pagination.pages"
      :disabled="isLoading"
      @go="goToPage"
    />

    <p class="visually-hidden" role="status">{{ copied ? "Link copied to clipboard" : "" }}</p>
  </StationBoard>
</template>

<style scoped>
.count,
.note {
  color: var(--c-ink-soft);
  font-weight: 600;
}

.empty {
  display: grid;
  justify-items: start;
  gap: var(--sp-3);
}

/* The board decides the row layout, so it works in the split workspace and on phones alike. */
.links {
  display: grid;
  margin: 0;
  padding: 0;
  list-style: none;
  border-top: var(--edge) solid var(--c-hairline);
  container-type: inline-size;
}

.link {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--sp-1) var(--sp-4);
  padding: var(--sp-4) 0;
  border-bottom: var(--edge) solid var(--c-hairline);
}

.link__code {
  justify-self: start;
  font-family: var(--font-code);
  font-size: var(--fs-base);
  font-weight: 600;
  color: var(--c-ink);
  text-decoration-color: var(--c-line);
  overflow-wrap: anywhere;
}

/* The code leads to its target: a stretch of route green, then the address on one line. */
.link__target {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  min-width: 0;
  font-family: var(--font-code);
  font-size: var(--fs-sm);
  font-weight: 500;
  color: var(--c-ink-soft);
}

.link__arrow {
  flex: none;
  color: var(--c-line);
}

.link__url {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.link__meta {
  font-size: var(--fs-sm);
  color: var(--c-ink-soft);
  font-variant-numeric: tabular-nums;
}

.link__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-2);
  margin-top: var(--sp-2);
}

/* Wide enough: code, target and date on the left, actions to the right of all three. */
@container (min-width: 30rem) {
  .link {
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
  }

  .link__actions {
    grid-column: 2;
    grid-row: 1 / span 3;
    flex-wrap: nowrap;
    margin-top: 0;
  }
}
</style>
