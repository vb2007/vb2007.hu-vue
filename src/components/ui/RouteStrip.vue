<script setup lang="ts">
import { RouterLink, useRoute } from "vue-router";
import type { Stop } from "@/constants/stops";
import StopMarker from "./StopMarker.vue";

defineProps<{
  stops: Stop[];
  orientation?: "horizontal" | "vertical";
  label: string;
}>();

const emit = defineEmits<{ navigate: [] }>();
const route = useRoute();
</script>

<template>
  <nav :aria-label="label">
    <ul class="strip" :class="`strip--${orientation ?? 'horizontal'}`">
      <li
        v-for="stop in stops"
        :key="stop.id"
        class="strip__item"
        :class="`strip__item--${stop.status}`"
      >
        <RouterLink
          v-if="stop.status === 'open'"
          :to="stop.to"
          class="strip__stop"
          @click="emit('navigate')"
        >
          <StopMarker status="open" :current="route.path === stop.to" />
          <span class="strip__label">{{ stop.label }}</span>
        </RouterLink>
        <span v-else class="strip__stop strip__stop--planned" :title="`${stop.label}: planned`">
          <StopMarker status="planned" />
          <span class="strip__label">{{ stop.label }}</span>
          <span class="visually-hidden">(planned)</span>
        </span>
      </li>
    </ul>
  </nav>
</template>

<style scoped>
.strip {
  display: flex;
  align-items: center;
  padding: 0;
  margin: 0;
  list-style: none;
}

.strip__item {
  display: flex;
  align-items: center;
}

/* The line between two stops: solid while the route is open, dashed once it runs ahead of what exists. */
.strip__item + .strip__item::before {
  content: "";
  flex: none;
  width: clamp(0.5rem, 1.6vw, 1.5rem);
  height: 0;
  margin-inline: var(--sp-2);
  border-top: 5px solid var(--c-line);
  border-radius: 3px;
}

.strip__item + .strip__item--planned::before {
  border-top: 4px dashed var(--c-ink-soft);
}

.strip__stop {
  display: inline-flex;
  align-items: center;
  gap: var(--sp-2);
  padding: var(--sp-2) var(--sp-1);
  border-radius: var(--radius-sm);
  color: var(--c-ink);
  font-family: var(--font-board);
  font-size: 1.125rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  text-decoration: none;
  transition: background-color var(--dur-quick) ease;
}

a.strip__stop:hover {
  background: var(--c-field-deep);
}

a.strip__stop:hover :deep(.marker) {
  transform: scale(1.25);
}

a.strip__stop[aria-current="page"] {
  font-weight: 700;
}

.strip__stop--planned {
  color: var(--c-ink-soft);
  cursor: default;
}

/* Vertical form used inside the mobile drawer */
.strip--vertical {
  flex-direction: column;
  align-items: stretch;
  gap: 0;
}

.strip--vertical .strip__item {
  flex-direction: column;
  align-items: flex-start;
}

.strip--vertical .strip__item + .strip__item::before {
  width: 0;
  height: 1.25rem;
  margin: -0.5rem 0 -0.5rem calc(var(--sp-2) + 0.5625rem - 2.5px);
  border-top: 0;
  border-left: 5px solid var(--c-line);
}

.strip--vertical .strip__item + .strip__item--planned::before {
  border-top: 0;
  border-left: 4px dashed var(--c-ink-soft);
}
</style>
