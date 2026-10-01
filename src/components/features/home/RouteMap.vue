<script setup lang="ts">
import { computed, ref } from "vue";
import { RouterLink } from "vue-router";
import type { Line } from "@/constants/stops";
import AppIcon from "@/components/ui/AppIcon.vue";
import StopMarker from "@/components/ui/StopMarker.vue";

const props = defineProps<{ line: Line; hereId?: string; initialId?: string }>();

const activeId = ref(props.initialId ?? props.line.stops[0].id);
const active = computed(() => props.line.stops.find((stop) => stop.id === activeId.value)!);

/* Stops from this index on sit on the lower track, after the 45-degree bend. */
const bendAfter = computed(() => props.line.stops.findIndex((stop) => stop.status === "planned"));
const trackOf = (index: number) => (index < bendAfter.value ? "upper" : "lower");
</script>

<template>
  <div class="map" :style="{ '--stops': line.stops.length }">
    <p class="map__line"><span class="map__roundel" aria-hidden="true" />{{ line.name }} line</p>

    <ol class="map__stops">
      <li
        v-for="(stop, index) in line.stops"
        :key="stop.id"
        class="stop"
        :class="[
          `stop--${stop.status}`,
          `stop--${trackOf(index)}`,
          {
            'stop--last': index === line.stops.length - 1,
            'stop--first-lower': index === bendAfter,
            'stop--before-bend': index === bendAfter - 1
          }
        ]"
        :style="{ '--i': index }"
      >
        <button
          class="stop__button"
          type="button"
          :aria-pressed="activeId === stop.id"
          @click="activeId = stop.id"
          @mouseenter="activeId = stop.id"
          @focus="activeId = stop.id"
        >
          <StopMarker :status="stop.status" :current="stop.id === hereId" />
          <span class="stop__name">{{ stop.label }}</span>
          <span class="stop__chip" :class="`stop__chip--${stop.status}`">
            {{ stop.id === hereId ? "You are here" : stop.status === "open" ? "Open" : "Planned" }}
          </span>
        </button>
      </li>
      <li class="map__bend" aria-hidden="true" />
      <li class="map__detail">
        <div class="detail" aria-live="polite">
          <h3 class="detail__title">{{ active.label }}</h3>
          <p class="detail__text">
            {{ active.blurb }}
            <template v-if="active.status === 'planned'"> Not&nbsp;built&nbsp;yet.</template>
          </p>
          <RouterLink
            v-if="active.status === 'open' && active.id !== hereId"
            :to="active.to"
            class="detail__go"
          >
            Go to {{ active.label }}
            <AppIcon name="arrow" :size="18" />
          </RouterLink>
        </div>
      </li>
    </ol>
  </div>
</template>

<style scoped>
.map {
  --bend: 5.5rem;
  --cy: 0.6875rem; /* marker centre, measured from the top of a stop */
  --line-w: 5px;
  --marker-bg: var(--c-field);
  display: grid;
  gap: var(--sp-5);
}

.map__line {
  display: inline-flex;
  align-items: center;
  gap: var(--sp-3);
  font-family: var(--font-board);
  font-size: var(--fs-md);
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.map__roundel {
  width: 1.5rem;
  height: 1.5rem;
  border-radius: 50%;
  background: var(--c-line);
  box-shadow: inset 0 0 0 4px var(--c-field);
}

.map__stops {
  display: grid;
  gap: var(--sp-5);
  padding: 0;
  margin: 0;
  list-style: none;
}

.stop {
  position: relative;
}

.stop__button {
  display: grid;
  justify-items: start;
  gap: var(--sp-2);
  width: 100%;
  padding: 0;
  border: 0;
  background: none;
  text-align: left;
  cursor: pointer;
}

.stop__name {
  font-family: var(--font-board);
  font-size: 1.5rem;
  font-weight: 700;
  line-height: 1;
  letter-spacing: 0.03em;
  text-transform: uppercase;
  transition: transform var(--dur-base) var(--ease-out);
}

.stop__button:hover .stop__name {
  transform: translateX(4px);
}

.stop__button:hover :deep(.marker),
.stop__button[aria-pressed="true"] :deep(.marker) {
  transform: scale(1.3);
}

.stop--planned .stop__name {
  color: var(--c-ink-soft);
}

.stop__chip {
  padding: 0.1rem var(--sp-2);
  border-radius: 999px;
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.stop__chip--open {
  background: var(--c-action);
  color: var(--c-on-action);
}

.stop__chip--planned {
  padding-left: 1.1rem;
  background:
    repeating-linear-gradient(-45deg, var(--c-on-works) 0 2px, transparent 2px 5px) left / 0.6rem
      100% no-repeat,
    var(--c-works);
  color: var(--c-on-works);
}

/* Mobile: one vertical line down the left edge */
.stop {
  padding-left: var(--sp-5);
}

.stop__button {
  grid-template-columns: auto 1fr;
  align-items: center;
  column-gap: var(--sp-4);
}

.stop__chip {
  grid-column: 2;
}

.stop:not(.stop--last)::before {
  content: "";
  position: absolute;
  left: calc(var(--sp-5) + 0.5625rem - var(--line-w) / 2);
  top: var(--cy);
  height: calc(100% + var(--sp-5));
  border-left: var(--line-w) solid var(--c-line);
  transform-origin: top;
  animation: draw-down 520ms var(--ease-out) backwards;
  animation-delay: calc(var(--i) * 140ms + 120ms);
}

.stop--planned:not(.stop--last)::before,
.stop--before-bend::before {
  border-left-style: dashed;
}

.stop:nth-child(n + 1) :deep(.marker) {
  animation: pop 360ms var(--ease-out) backwards;
  animation-delay: calc(var(--i) * 140ms);
}

.map__bend {
  display: none;
}

.map__detail {
  list-style: none;
}

.detail {
  display: grid;
  gap: var(--sp-2);
  align-content: start;
  padding: var(--sp-4) var(--sp-5);
  border: var(--edge) solid var(--c-edge);
  border-radius: var(--radius-md);
  background: var(--c-panel);
  box-shadow: 0 0.25rem 0 var(--c-field-deep);
}

.detail__title {
  font-size: var(--fs-lg);
  text-transform: uppercase;
}

.detail__text {
  color: var(--c-ink-soft);
}

.detail__go {
  display: inline-flex;
  align-items: center;
  gap: var(--sp-2);
  justify-self: start;
  font-weight: 600;
  transition: gap var(--dur-base) var(--ease-out);
}

.detail__go:hover {
  gap: var(--sp-3);
}

@media (min-width: 52rem) {
  .map__stops {
    grid-template-columns: repeat(2, minmax(0, 1fr)) var(--bend) repeat(3, minmax(0, 1fr));
    grid-template-rows: var(--bend) auto;
    gap: 0;
  }

  .stop {
    padding-left: 0;
    padding-right: var(--sp-3);
  }

  .stop__button {
    grid-template-columns: none;
    column-gap: 0;
  }

  .stop__chip {
    grid-column: auto;
  }

  .stop__button :deep(.marker) {
    margin-left: 0;
  }

  .stop--upper {
    grid-row: 1;
    grid-column: calc(var(--i) + 1);
  }

  .stop--lower {
    grid-row: 2;
    grid-column: calc(var(--i) + 2);
    padding-top: 0;
  }

  /* Horizontal segment from each marker to the next one on the same track */
  .stop:not(.stop--last)::before {
    left: 0.5625rem;
    top: var(--cy);
    width: 100%;
    height: 0;
    border-left: 0;
    border-top: var(--line-w) solid var(--c-line);
    transform: translateY(-50%);
    transform-origin: left;
    animation-name: draw-across;
  }

  .stop--planned:not(.stop--last)::before,
  .stop--first-lower::before {
    border-top-style: dashed;
  }

  .stop--first-lower::before {
    display: none;
  }

  .map__bend {
    display: block;
    position: relative;
    grid-row: 1;
    grid-column: 3;
    pointer-events: none;
  }

  /* 45-degree diagonal from the upper track to the lower track */
  .map__bend::before {
    content: "";
    position: absolute;
    left: 0;
    top: var(--cy);
    width: calc(var(--bend) * 1.41421);
    border-top: var(--line-w) dashed var(--c-ink-soft);
    transform-origin: left center;
    transform: translateY(-50%) rotate(45deg);
    animation: draw-across 520ms var(--ease-out) backwards;
    animation-delay: calc(var(--i, 1) * 140ms + 300ms);
  }

  /* The lower track starts at the bend's end */
  .map__bend::after {
    content: "";
    position: absolute;
    left: calc(var(--bend) - 1px);
    top: calc(var(--bend) + var(--cy));
    width: 0.75rem;
    border-top: var(--line-w) dashed var(--c-ink-soft);
    transform: translateY(-50%);
  }

  .map__detail {
    grid-column: 1 / 3;
    grid-row: 2;
    align-self: start;
    margin: var(--sp-5) var(--sp-5) 0 0;
  }
}

@keyframes draw-across {
  from {
    clip-path: inset(0 100% 0 0);
  }
  to {
    clip-path: inset(-1rem -1rem -1rem 0);
  }
}

@keyframes draw-down {
  from {
    clip-path: inset(0 0 100% 0);
  }
  to {
    clip-path: inset(0 -1rem -1rem -1rem);
  }
}

@keyframes pop {
  from {
    transform: scale(0);
  }
}
</style>
