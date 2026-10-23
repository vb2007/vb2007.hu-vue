<script setup lang="ts">
import { computed } from "vue";
import type { QueueStatus } from "@/composables/useUploadQueue";

/** The file's journey as a stretch of line: departure ring, the train's head, arrival ring. */
const props = defineProps<{ progress: number; status: QueueStatus; label: string }>();
const percent = computed(() => Math.round(props.progress * 100));
</script>

<template>
  <div
    class="track"
    :class="`track--${status}`"
    role="progressbar"
    :aria-label="label"
    aria-valuemin="0"
    aria-valuemax="100"
    :aria-valuenow="percent"
    :style="{ '--progress': progress }"
  >
    <span class="track__stop track__stop--from" />
    <span class="track__rail">
      <span class="track__run"><span class="track__head" /></span>
    </span>
    <span class="track__stop track__stop--to" />
  </div>
</template>

<style scoped>
.track {
  display: flex;
  align-items: center;
  width: 100%;
}

.track__stop {
  flex: none;
  width: 0.875rem;
  height: 0.875rem;
  border: 3px solid var(--c-line);
  border-radius: 50%;
  background: var(--c-panel);
}

.track__rail {
  position: relative;
  flex: 1;
  height: 4px;
  margin: 0 -1px;
  background: var(--c-hairline);
  /* Cut the run off where the line starts, but let the head stand above and past the end. */
  clip-path: inset(-1rem -0.5rem -1rem 0);
}

/* A full-width run slid in from the left, so progress moves on transform alone. */
.track__run {
  position: absolute;
  inset: 0;
  background: var(--c-line);
  transform: translateX(calc((var(--progress) - 1) * 100%));
  transition: transform var(--dur-base) var(--ease-out);
}

.track__head {
  position: absolute;
  top: 50%;
  right: 0;
  width: 0.75rem;
  height: 0.75rem;
  border-radius: 50%;
  background: var(--c-action);
  transform: translate(50%, -50%);
}

/* Only a moving upload has a head: waiting, finished or stopped ones show where the run got to. */
.track--queued .track__head,
.track--done .track__head,
.track--failed .track__head,
.track--cancelled .track__head {
  display: none;
}

.track--done .track__stop {
  border-color: var(--c-action);
  background: var(--c-action);
}

.track--failed .track__run {
  background: var(--c-danger);
}

.track--failed .track__stop--to {
  border-color: var(--c-danger);
}

.track--cancelled .track__run {
  background: var(--c-ink-soft);
}

.track--cancelled .track__stop {
  border-color: var(--c-ink-soft);
}
</style>
