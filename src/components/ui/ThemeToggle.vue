<script setup lang="ts">
import { computed } from "vue";
import { setTheme, isDarkMode } from "@/scripts/utility/themeState";
import { THEMES } from "@/constants/theme";
import AppIcon from "./AppIcon.vue";

const label = computed(() => (isDarkMode.value ? "Switch to light theme" : "Switch to dark theme"));

const toggleTheme = () => {
  setTheme(isDarkMode.value ? THEMES.LIGHT : THEMES.DARK);
};
</script>

<template>
  <button class="toggle" type="button" :aria-label="label" :title="label" @click="toggleTheme">
    <span class="toggle__icon" :class="{ 'toggle__icon--dark': isDarkMode }">
      <AppIcon name="sun" :size="22" />
      <AppIcon name="moon" :size="22" />
    </span>
  </button>
</template>

<style scoped>
.toggle {
  display: grid;
  place-items: start center;
  flex: none;
  width: 2.75rem;
  height: 2.75rem;
  padding: 0;
  border: var(--edge) solid var(--c-edge);
  border-radius: 50%;
  background: var(--c-panel);
  color: var(--c-ink);
  overflow: hidden;
  cursor: pointer;
  transition:
    transform var(--dur-quick) var(--ease-out),
    background-color var(--dur-quick) ease;
}

.toggle:hover {
  background: var(--c-field-deep);
  transform: translateY(-1px);
}

.toggle:active {
  transform: translateY(1px) scale(0.96);
}

/* Two icons stacked in a column; the theme slides the right one into the window. */
.toggle__icon {
  display: grid;
  gap: 1.5rem;
  transform: translateY(0.5625rem);
  transition: transform var(--dur-base) var(--ease-out);
}

.toggle__icon--dark {
  transform: translateY(-2.3125rem);
}
</style>
