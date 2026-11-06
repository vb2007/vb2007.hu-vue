<script setup lang="ts">
/** An account's used-of-quota as a stretch of line (the Route Measure Rule), with the figure above it. */
import { computed } from "vue";
import type { AdminUser } from "@/types/api/admin";
import { formatBytes } from "@/scripts/utility/sizeUtil";

const props = defineProps<{ user: AdminUser }>();

const usage = computed(() => props.user.uploads);
/** Nothing more fits once used reaches the quota, including a quota of 0. */
const isFull = computed(() => usage.value.usedBytes >= usage.value.quotaBytes);
const share = computed(() =>
  usage.value.quotaBytes ? Math.min(1, usage.value.usedBytes / usage.value.quotaBytes) : 1
);
</script>

<template>
  <div class="measure" :class="{ 'measure--full': isFull }">
    <p class="measure__figure">
      <span class="measure__used">{{ formatBytes(usage.usedBytes) }}</span>
      of {{ formatBytes(usage.quotaBytes) }}
    </p>
    <span
      class="measure__line"
      role="meter"
      :aria-label="`Storage used by ${user.username}`"
      aria-valuemin="0"
      :aria-valuemax="usage.quotaBytes"
      :aria-valuenow="Math.min(usage.usedBytes, usage.quotaBytes)"
      :aria-valuetext="`${formatBytes(usage.usedBytes)} of ${formatBytes(usage.quotaBytes)}`"
      :style="{ '--share': share }"
      :class="{ 'measure__line--some': usage.usedBytes > 0 }"
    >
      <span class="measure__run" />
      <span class="measure__stop" />
    </span>
  </div>
</template>

<style scoped>
/* Used of quota as a stretch of line: the run ends in a ring where the user is, the rail ends at the quota. */
.measure {
  display: grid;
  gap: var(--sp-2);
}

.measure__figure {
  font-size: var(--fs-sm);
  font-weight: 600;
  color: var(--c-ink-soft);
  font-variant-numeric: tabular-nums;
}

.measure__used {
  color: var(--c-ink);
  font-weight: 700;
}

.measure__line {
  position: relative;
  display: block;
  height: 3px;
  margin: 0 0.4375rem;
  background: var(--c-hairline);
}

.measure__run {
  position: absolute;
  inset: 0 auto 0 0;
  /* Short of the terminus, so a nearly full run doesn't swallow it. */
  width: min(calc(var(--share) * 100%), calc(100% - 0.875rem));
  background: var(--c-line);
}

/* True to scale, except that any use at all shows a few pixels of green. */
.measure__line--some .measure__run {
  width: min(max(0.25rem, calc(var(--share) * 100%)), calc(100% - 0.875rem));
}

/* Full: the run reaches the terminus, which turns red. */
.measure--full .measure__run {
  width: 100%;
}

.measure__run::after,
.measure__stop {
  content: "";
  position: absolute;
  top: 50%;
  width: 0.625rem;
  height: 0.625rem;
  border: 3px solid var(--c-line);
  border-radius: 50%;
  background: var(--c-panel);
  transform: translate(50%, -50%);
}

.measure__run::after {
  right: 0;
}

/* The terminus at the quota. */
.measure__stop {
  right: 0;
  width: 0.875rem;
  height: 0.875rem;
  border-color: var(--c-ink-soft);
}

.measure--full .measure__run,
.measure--full .measure__run::after {
  background: var(--c-danger);
  border-color: var(--c-danger);
}

.measure--full .measure__stop {
  border-color: var(--c-danger);
  background: var(--c-danger);
}
</style>
