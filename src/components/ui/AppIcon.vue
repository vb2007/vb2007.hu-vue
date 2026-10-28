<script setup lang="ts">
import { computed } from "vue";

const ICONS = {
  check: "M4 12.5l5 5L20 6.5",
  alert: "M12 3a9 9 0 100 18 9 9 0 000-18zM12 7.5v5M12 16.2h.01",
  info: "M12 3a9 9 0 100 18 9 9 0 000-18zM12 11v5.5M12 7.8h.01",
  copy: "M9 9h10v10H9zM5 15V5h10",
  sun: "M12 8a4 4 0 100 8 4 4 0 000-8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4",
  moon: "M20 14.5A8.5 8.5 0 019.5 4a8.5 8.5 0 1010.5 10.5z",
  menu: "M4 7h16M4 12h16M4 17h16",
  close: "M6 6l12 12M18 6L6 18",
  arrow: "M5 12h14M13 6l6 6-6 6",
  upload: "M12 15.5V4M7 9l5-5 5 5M4 15v4.5h16V15",
  document: "M14 3H6v18h12V7zM14 3v4h4M9 12.5h6M9 16.5h6",
  image: "M4 5h16v14H4zM4 16l5-5 4 4 2-2 5 5M15.5 9.5h.01",
  video: "M4 5h16v14H4zM10 9v6l5-3z",
  audio: "M9 18V6l11-2v12M9 18a3 3 0 11-6 0 3 3 0 016 0zM20 16a3 3 0 11-6 0 3 3 0 016 0z",
  archive: "M4 4h16v4H4zM5 8v12h14V8M10 12h4",
  mail: "M3.5 5.5h17v13h-17zM3.5 6.5l8.5 6.5 8.5-6.5",
  lock: "M4.5 10.5h15V21h-15zM8 10.5V7a4 4 0 018 0v3.5",
  globe:
    "M12 3a9 9 0 100 18 9 9 0 000-18zM3 12h18M12 3c2.4 2.5 3.6 5.5 3.6 9s-1.2 6.5-3.6 9M12 3c-2.4 2.5-3.6 5.5-3.6 9s1.2 6.5 3.6 9",
  pencil: "M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4",
  trash: "M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13",
  chevron: "M6 9l6 6 6-6"
} as const;

/** Brand marks are filled shapes on their own grid, unlike the stroked icons above. */
const MARKS = {
  github: {
    viewBox: "0 0 16 16",
    d: "M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0016 8c0-4.42-3.58-8-8-8z"
  }
} as const;

export type IconName = keyof typeof ICONS | keyof typeof MARKS;

const props = defineProps<{ name: IconName; size?: number }>();

const mark = computed(() =>
  props.name in MARKS ? MARKS[props.name as keyof typeof MARKS] : undefined
);
</script>

<template>
  <svg
    v-if="mark"
    :width="size ?? 20"
    :height="size ?? 20"
    :viewBox="mark.viewBox"
    fill="currentColor"
    aria-hidden="true"
    focusable="false"
  >
    <path :d="mark.d" fill-rule="evenodd" />
  </svg>
  <svg
    v-else
    :width="size ?? 20"
    :height="size ?? 20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2.2"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    <path :d="ICONS[name as keyof typeof ICONS]" />
  </svg>
</template>
