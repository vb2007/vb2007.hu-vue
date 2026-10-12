<script setup lang="ts">
import { RouterLink } from "vue-router";
import type { Stop } from "@/constants/stops";
import AppIcon from "@/components/ui/AppIcon.vue";
import StopMarker from "@/components/ui/StopMarker.vue";

/**
 * A wayfinding sign: one row per destination, each carrying its own description and way in.
 * Nothing is shared between rows, so pointing at one never changes another. Grows with the data.
 */
defineProps<{ stops: Stop[] }>();
</script>

<template>
  <ul class="directory">
    <li
      v-for="(stop, index) in stops"
      :key="stop.id"
      class="directory__item"
      :style="{ '--i': index }"
    >
      <RouterLink v-if="stop.status === 'open'" :to="stop.to" class="sign sign--open">
        <StopMarker status="open" class="sign__marker" />
        <span class="sign__name">{{ stop.label }}</span>
        <span class="sign__blurb">{{ stop.blurb }}</span>
        <span class="sign__way" aria-hidden="true">
          <AppIcon name="arrow" :size="26" />
        </span>
      </RouterLink>
      <div v-else class="sign sign--planned">
        <StopMarker status="planned" class="sign__marker" />
        <span class="sign__name">{{ stop.label }}</span>
        <span class="sign__blurb">{{ stop.blurb }}</span>
        <span class="sign__chip">Planned</span>
      </div>
    </li>
  </ul>
</template>

<style scoped>
.directory {
  display: grid;
  margin: 0;
  padding: 0;
  list-style: none;
  overflow: hidden;
  border: var(--edge) solid var(--c-edge);
  border-radius: var(--radius-lg);
  background: var(--c-panel);
  box-shadow:
    inset 0 2px 0 light-dark(oklch(1 0 0 / 0.75), oklch(1 0 0 / 0.08)),
    var(--shadow-panel);
}

.directory__item + .directory__item {
  border-top: var(--edge) solid var(--c-hairline);
}

.sign {
  --marker-bg: var(--c-panel);

  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  grid-template-areas:
    "marker name way"
    ". blurb way";
  align-items: center;
  gap: var(--sp-1) var(--sp-4);
  padding: var(--sp-4) var(--sp-5);
  color: var(--c-ink);
  text-decoration: none;
  animation: board-in var(--dur-slow) var(--ease-out) backwards;
  animation-delay: calc(var(--i) * 70ms);
}

.sign__marker {
  grid-area: marker;
}

.sign__name {
  grid-area: name;
  font-family: var(--font-board);
  font-size: var(--fs-lg);
  font-weight: 700;
  line-height: 1;
  letter-spacing: 0.02em;
  text-transform: uppercase;
}

.sign__blurb {
  grid-area: blurb;
  color: var(--c-ink-soft);
  text-wrap: pretty;
}

.sign__way,
.sign__chip {
  grid-area: way;
  justify-self: end;
}

/* The direction arrow is a key you press: hard underside, slides on hover. */
.sign__way {
  display: grid;
  place-items: center;
  width: 3rem;
  height: 3rem;
  border-radius: var(--radius-sm);
  background: var(--c-action);
  color: var(--c-on-action);
  box-shadow: 0 0.25rem 0 var(--c-action-deep);
  transition:
    transform var(--dur-base) var(--ease-out),
    box-shadow var(--dur-base) var(--ease-out);
}

.sign--open {
  transition: background-color var(--dur-quick) ease;
}

.sign--open:hover {
  --marker-bg: var(--c-action);
  background: var(--c-panel-sunk);
}

.sign--open:hover .sign__way {
  transform: translateX(0.375rem);
}

.sign--open:active .sign__way {
  transform: translate(0.375rem, 0.25rem);
  box-shadow: 0 0 0 var(--c-action-deep);
  transition-duration: 60ms;
}

.sign--open :deep(.marker) {
  transition:
    transform var(--dur-base) var(--ease-out),
    background-color var(--dur-quick) ease;
}

.sign--open:hover :deep(.marker) {
  transform: scale(1.25);
}

.sign--open:focus-visible {
  outline: 3px solid var(--c-line);
  outline-offset: -5px;
  border-radius: var(--radius-lg);
}

.sign--planned .sign__name {
  color: var(--c-ink-soft);
}

.sign__chip {
  padding: 0.15rem var(--sp-2) 0.15rem 1.1rem;
  border-radius: 999px;
  background:
    repeating-linear-gradient(-45deg, var(--c-on-works) 0 2px, transparent 2px 5px) left / 0.6rem
      100% no-repeat,
    var(--c-works);
  color: var(--c-on-works);
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  white-space: nowrap;
}

/* Wide enough for one line: marker, name, description, way in. */
@media (min-width: 46rem) {
  .sign {
    grid-template-columns: auto 11rem minmax(0, 1fr) auto;
    grid-template-areas: "marker name blurb way";
    gap: var(--sp-5);
    padding: var(--sp-5) var(--sp-6);
  }
}

@keyframes board-in {
  from {
    opacity: 0;
    clip-path: inset(0 100% 0 0);
  }
  to {
    opacity: 1;
    clip-path: inset(0 0 0 0);
  }
}
</style>
