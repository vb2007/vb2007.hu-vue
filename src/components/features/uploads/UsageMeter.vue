<script setup lang="ts">
import { computed } from "vue";
import { CATEGORY_LABELS, type UploadUsage } from "@/scripts/uploads/upload";
import { formatBytes } from "@/scripts/utility/sizeUtil";
import AppIcon from "@/components/ui/AppIcon.vue";
import StationBoard from "@/components/ui/StationBoard.vue";
import StatusMessage from "@/components/ui/StatusMessage.vue";
import { CATEGORY_ICONS } from "./categoryIcon";

/** From this share of the quota up, the meter warns that space is running out. */
const NEARLY_FULL = 0.9;

const props = defineProps<{ usage: UploadUsage | null; errorMessage: string }>();

// These only render once usage has arrived.
const share = computed(() => Math.min(1, props.usage!.usedBytes / props.usage!.quotaBytes));

/** "0.4%", and "<0.1%" rather than a misleading "0%" for a little use. */
const shareLabel = computed(() => {
  if (share.value > 0 && share.value < 0.001) return "<0.1%";
  return new Intl.NumberFormat(undefined, { style: "percent", maximumFractionDigits: 1 }).format(
    share.value
  );
});

const remaining = computed(() => Math.max(0, props.usage!.quotaBytes - props.usage!.usedBytes));
</script>

<template>
  <StationBoard title="Storage">
    <StatusMessage v-if="errorMessage" tone="error">{{ errorMessage }}</StatusMessage>
    <p v-else-if="!usage" class="note">Loading your storage…</p>

    <template v-if="usage">
      <div class="gauge">
        <p class="gauge__figure">
          <span class="gauge__used">{{ formatBytes(usage.usedBytes) }}</span
          >{{ " " }}<span class="gauge__of">of {{ formatBytes(usage.quotaBytes) }} used</span>
        </p>
        <div
          class="gauge__line"
          role="meter"
          aria-label="Storage used"
          aria-valuemin="0"
          :aria-valuemax="usage.quotaBytes"
          :aria-valuenow="usage.usedBytes"
          :aria-valuetext="`${formatBytes(usage.usedBytes)} of ${formatBytes(usage.quotaBytes)}`"
          :style="{ '--share': share }"
          :class="{ 'gauge__line--some': share > 0 }"
        >
          <span class="gauge__stop gauge__stop--from" />
          <span class="gauge__rail"><span class="gauge__run" /><span class="gauge__here" /></span>
          <span class="gauge__stop gauge__stop--to" :class="{ 'gauge__stop--full': share >= 1 }" />
        </div>
        <p class="gauge__scale">
          <span>{{ shareLabel }}</span>
          <span>{{ formatBytes(remaining) }} left</span>
        </p>
      </div>

      <StatusMessage v-if="share >= 1" tone="error">
        Your storage is full. Delete some uploads to make room for new ones.
      </StatusMessage>
      <StatusMessage v-else-if="share >= NEARLY_FULL" tone="info">
        Your storage is almost full: {{ formatBytes(remaining) }} left.
      </StatusMessage>

      <ul class="split" aria-label="Storage by file type">
        <li
          v-for="part in usage.byCategory"
          :key="part.category"
          class="split__row"
          :class="{ 'split__row--empty': part.count === 0 }"
          :style="{ '--part': usage.usedBytes ? part.bytes / usage.usedBytes : 0 }"
        >
          <AppIcon class="split__icon" :name="CATEGORY_ICONS[part.category]" :size="18" />
          <span class="split__name">{{ CATEGORY_LABELS[part.category] }}</span>
          <span class="split__count">
            {{ part.count }} {{ part.count === 1 ? "file" : "files" }}
          </span>
          <span class="split__bytes">{{ formatBytes(part.bytes) }}</span>
          <span class="split__rail" aria-hidden="true">
            <span class="split__run" />
          </span>
        </li>
      </ul>
    </template>
  </StationBoard>
</template>

<style scoped>
.note {
  color: var(--c-ink-soft);
  font-weight: 600;
}

.gauge {
  display: grid;
  gap: var(--sp-3);
}

.gauge__figure {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: var(--sp-1) var(--sp-2);
}

.gauge__used {
  font-family: var(--font-board);
  font-size: var(--fs-lg);
  font-weight: 700;
  line-height: 1;
  font-variant-numeric: tabular-nums;
}

.gauge__of {
  color: var(--c-ink-soft);
  font-weight: 600;
}

/* The quota as a stretch of line: departure ring, the travelled run, where you are, terminus at the quota. */
.gauge__line {
  --at: calc(var(--share) * 100%);

  display: flex;
  align-items: center;
}

.gauge__stop {
  flex: none;
  width: 1rem;
  height: 1rem;
  border: 3px solid var(--c-line);
  border-radius: 50%;
  background: var(--c-panel);
}

.gauge__stop--from {
  border-color: var(--c-action);
  background: var(--c-action);
}

.gauge__stop--to {
  width: 1.375rem;
  height: 1.375rem;
  border-width: 4px;
}

.gauge__stop--full {
  border-color: var(--c-danger);
  background: var(--c-danger);
}

.gauge__rail {
  position: relative;
  flex: 1;
  height: 5px;
  margin: 0 -1px;
  background: var(--c-hairline);
}

.gauge__run {
  position: absolute;
  inset: 0 auto 0 0;
  width: var(--at);
  background: var(--c-line);
  transform-origin: left;
  animation: travel var(--dur-slow) var(--ease-out);
}

/* True to scale, except that any use at all shows at least a few pixels of green. */
.gauge__line--some {
  --at: max(0.25rem, calc(var(--share) * 100%));
}

.gauge__here {
  position: absolute;
  top: 50%;
  left: var(--at);
  width: 1.125rem;
  height: 1.125rem;
  border: 4px solid var(--c-action);
  border-radius: 50%;
  background: var(--c-panel);
  transform: translate(-50%, -50%);
  animation: arrive var(--dur-slow) var(--ease-out);
}

@keyframes travel {
  from {
    transform: scaleX(0);
  }
}

@keyframes arrive {
  from {
    opacity: 0;
    transform: translate(-50%, -50%) scale(0.4);
  }
}

.gauge__scale {
  display: flex;
  justify-content: space-between;
  gap: var(--sp-3);
  font-size: var(--fs-sm);
  font-weight: 600;
  color: var(--c-ink-soft);
  font-variant-numeric: tabular-nums;
}

.split {
  display: grid;
  margin: 0;
  padding: 0;
  list-style: none;
  border-top: var(--edge) solid var(--c-hairline);
}

.split__row {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto auto;
  grid-template-areas:
    "icon name count bytes"
    "bar bar bar bar";
  align-items: center;
  gap: var(--sp-1) var(--sp-3);
  padding: var(--sp-3) 0;
  border-bottom: var(--edge) solid var(--c-hairline);
}

.split__icon {
  grid-area: icon;
  color: var(--c-action);
}

.split__name {
  grid-area: name;
  font-weight: 600;
}

.split__count {
  grid-area: count;
  font-size: var(--fs-sm);
  color: var(--c-ink-soft);
  font-variant-numeric: tabular-nums;
}

.split__bytes {
  grid-area: bytes;
  min-width: 4.5rem;
  font-weight: 600;
  text-align: right;
  font-variant-numeric: tabular-nums;
}

/* Each type's share of what you use, as a run along its own rail, ending in a stop. */
.split__rail {
  grid-area: bar;
  position: relative;
  height: 3px;
  margin-right: 0.375rem;
  background: var(--c-hairline);
}

.split__run {
  position: absolute;
  inset: 0 auto 0 0;
  width: calc(var(--part) * 100%);
  background: var(--c-line);
}

.split__run::after {
  content: "";
  position: absolute;
  top: 50%;
  right: 0;
  width: 0.625rem;
  height: 0.625rem;
  border: 3px solid var(--c-line);
  border-radius: 50%;
  background: var(--c-panel);
  transform: translate(50%, -50%);
}

.split__row--empty .split__icon,
.split__row--empty .split__name,
.split__row--empty .split__bytes {
  color: var(--c-ink-soft);
}

.split__row--empty .split__run {
  display: none;
}
</style>
