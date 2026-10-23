<script setup lang="ts">
import { computed, ref } from "vue";
import type { QueueItem } from "@/composables/useUploadQueue";
import { useClipboard } from "@/composables/useClipboard";
import { categoryOf } from "@/scripts/uploads/upload";
import UploadLink from "./UploadLink.vue";
import { formatBytes } from "@/scripts/utility/sizeUtil";
import AppIcon from "@/components/ui/AppIcon.vue";
import BaseButton from "@/components/ui/BaseButton.vue";
import UploadProgress from "./UploadProgress.vue";
import { CATEGORY_ICONS } from "./categoryIcon";

const props = defineProps<{ items: QueueItem[]; hasFinished: boolean }>();
defineEmits<{ cancel: [id: number]; retry: [id: number]; dismiss: [id: number]; clear: [] }>();

const { copied, failed, copy } = useClipboard();
const copiedId = ref(0);
const copyLink = (item: QueueItem) => {
  copiedId.value = item.id;
  return copy(item.result!.url);
};

const statusText = (item: QueueItem) =>
  ({
    queued: "Waiting",
    uploading: `${Math.round(item.progress * 100)}%`,
    done: "Uploaded",
    cancelled: "Cancelled",
    failed: item.error,
    rejected: item.error
  })[item.status];

/** One line for screen readers, so they hear progress without every percent. */
const summary = computed(() => {
  const count = (status: QueueItem["status"]) =>
    props.items.filter((item) => item.status === status).length;
  const parts = [];
  if (count("uploading") + count("queued"))
    parts.push(`${count("uploading") + count("queued")} uploading`);
  if (count("done")) parts.push(`${count("done")} uploaded`);
  if (count("failed") + count("rejected")) {
    parts.push(`${count("failed") + count("rejected")} failed`);
  }
  return parts.join(", ");
});
</script>

<template>
  <section v-if="items.length" class="queue" aria-labelledby="queue-title">
    <div class="queue__head">
      <h2 id="queue-title" class="queue__title">On the way</h2>
      <BaseButton v-if="hasFinished" size="sm" variant="ghost" @click="$emit('clear')">
        Clear finished
      </BaseButton>
    </div>

    <ol class="queue__list">
      <li v-for="item in items" :key="item.id" class="job" :class="`job--${item.status}`">
        <AppIcon class="job__icon" :name="CATEGORY_ICONS[categoryOf(item.file.type)]" />
        <p class="job__name" :title="item.file.name">{{ item.file.name }}</p>
        <p class="job__size">{{ formatBytes(item.file.size) }}</p>

        <UploadProgress
          v-if="item.status !== 'rejected'"
          class="job__track"
          :progress="item.progress"
          :status="item.status"
          :label="`Uploading ${item.file.name}`"
        />

        <p class="job__status">
          <AppIcon v-if="item.status === 'done'" name="check" :size="16" />
          <AppIcon
            v-else-if="item.status === 'failed' || item.status === 'rejected'"
            name="alert"
            :size="16"
          />
          <span>{{ statusText(item) }}</span>
          <span v-if="item.status === 'done'" class="job__where">
            · {{ item.result!.visibility === "public" ? "Public" : "Private" }}
          </span>
        </p>

        <div class="job__actions">
          <BaseButton
            v-if="item.status === 'queued' || item.status === 'uploading'"
            size="sm"
            variant="ghost"
            @click="$emit('cancel', item.id)"
          >
            Cancel
          </BaseButton>
          <BaseButton
            v-else-if="item.status === 'failed' || item.status === 'cancelled'"
            size="sm"
            variant="secondary"
            @click="$emit('retry', item.id)"
          >
            Retry
          </BaseButton>
          <BaseButton
            v-else-if="item.status === 'rejected'"
            size="sm"
            variant="ghost"
            @click="$emit('dismiss', item.id)"
          >
            Remove
          </BaseButton>
        </div>

        <!-- Arrived: the file's ticket, like a new short link or paste gets. -->
        <div v-if="item.status === 'done'" class="ticket">
          <a class="ticket__link" :href="item.result!.url" target="_blank" rel="noopener">
            <UploadLink :url="item.result!.url" />
          </a>
          <BaseButton size="sm" @click="copyLink(item)">
            <AppIcon :name="copiedId === item.id && copied ? 'check' : 'copy'" :size="16" />
            {{
              copiedId === item.id && copied
                ? "Copied"
                : copiedId === item.id && failed
                  ? "Copy failed"
                  : "Copy link"
            }}
          </BaseButton>
        </div>
      </li>
    </ol>

    <p class="visually-hidden" role="status">{{ copied ? "Link copied to clipboard" : summary }}</p>
  </section>
</template>

<style scoped>
.queue {
  display: grid;
  gap: var(--sp-3);
}

.queue__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp-3);
}

.queue__title {
  font-family: var(--font-board);
  font-size: var(--fs-md);
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.queue__list {
  display: grid;
  margin: 0;
  padding: 0;
  list-style: none;
  border-top: var(--edge) solid var(--c-hairline);
}

.job {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  grid-template-areas:
    "icon name size"
    "track track track"
    "status status actions"
    "ticket ticket ticket";
  align-items: center;
  gap: var(--sp-2) var(--sp-3);
  padding: var(--sp-3) 0;
  border-bottom: var(--edge) solid var(--c-hairline);
  animation: arrive var(--dur-base) var(--ease-out);
}

.job__icon {
  grid-area: icon;
  color: var(--c-ink-soft);
}

.job__name {
  grid-area: name;
  overflow: hidden;
  font-weight: 600;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.job__size {
  grid-area: size;
  font-size: var(--fs-sm);
  color: var(--c-ink-soft);
  font-variant-numeric: tabular-nums;
}

.job__track {
  grid-area: track;
}

.job__status {
  grid-area: status;
  display: flex;
  align-items: center;
  gap: var(--sp-1);
  min-width: 0;
  font-size: var(--fs-sm);
  font-weight: 600;
  color: var(--c-ink-soft);
  font-variant-numeric: tabular-nums;
}

.job--done .job__status {
  color: var(--c-action);
}

.job--failed .job__status,
.job--rejected .job__status {
  color: var(--c-danger);
}

.job__where {
  color: var(--c-ink-soft);
  font-weight: 500;
}

.job__actions {
  grid-area: actions;
  justify-self: end;
}

.ticket {
  grid-area: ticket;
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  margin-top: var(--sp-1);
  padding: var(--sp-2) var(--sp-2) var(--sp-2) var(--sp-4);
  border: var(--edge) dashed var(--c-edge);
  border-radius: var(--radius-md);
  background: var(--c-field);
  animation: print 720ms var(--ease-out);
}

.ticket__link {
  display: flex;
  flex: 1;
  min-width: 0;
  color: var(--c-ink);
  text-decoration-color: var(--c-line);
  text-decoration-thickness: 2px;
}

@keyframes print {
  from {
    clip-path: inset(0 0 100% 0);
  }
  to {
    clip-path: inset(0 0 0 0);
  }
}

@keyframes arrive {
  from {
    opacity: 0;
    transform: translateY(-6px);
  }
}
</style>
