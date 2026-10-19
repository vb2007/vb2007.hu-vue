<script setup lang="ts">
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
  lock: "M4.5 10.5h15V21h-15zM8 10.5V7a4 4 0 018 0v3.5",
  globe:
    "M12 3a9 9 0 100 18 9 9 0 000-18zM3 12h18M12 3c2.4 2.5 3.6 5.5 3.6 9s-1.2 6.5-3.6 9M12 3c-2.4 2.5-3.6 5.5-3.6 9s1.2 6.5 3.6 9",
  pencil: "M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4",
  trash: "M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13",
  chevron: "M6 9l6 6 6-6"
} as const;

export type IconName = keyof typeof ICONS;

defineProps<{ name: IconName; size?: number }>();
</script>

<template>
  <svg
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
    <path :d="ICONS[name]" />
  </svg>
</template>
