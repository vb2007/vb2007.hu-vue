<script setup lang="ts">
import { computed } from "vue";
import { setTheme, isDarkMode } from "@/scripts/utility/themeState";
import { THEMES } from "@/constants/theme";

const currentIcon = computed(() => {
  return isDarkMode.value ? "🌙" : "☀️";
});

const toggleTheme = () => {
  // Toggle between light and dark themes
  const newTheme = isDarkMode.value ? THEMES.LIGHT : THEMES.DARK;
  setTheme(newTheme);
};
</script>

<template>
  <div class="theme-switch">
    <button
      class="theme-switch__button"
      @click="toggleTheme"
      :aria-label="`Current theme: ${isDarkMode ? 'Dark' : 'Light'}. Click to toggle theme.`"
    >
      <span class="theme-switch__icon">{{ currentIcon }}</span>
    </button>
  </div>
</template>

<style scoped>
.theme-switch {
  display: inline-block;
}

.theme-switch__button {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  padding: 0;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 50%;
  color: #333;
  font-size: 1.2rem;
  cursor: pointer;
  transition: all 0.2s ease;
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
}

.theme-switch__button:hover {
  background: rgba(255, 255, 255, 0.15);
  border-color: rgba(255, 255, 255, 0.3);
  transform: scale(1.05);
}

.theme-switch__button:active {
  transform: scale(0.95);
}

.theme-switch__icon {
  font-size: 1.2rem;
  line-height: 1;
  transition: transform 0.2s ease;
}

.theme-switch__button:hover .theme-switch__icon {
  transform: rotate(15deg);
}

/* Dark mode styles */
@media (prefers-color-scheme: dark) {
  .theme-switch__button {
    color: #ffffff;
    background: rgba(0, 0, 0, 0.3);
    border-color: rgba(255, 255, 255, 0.1);
  }

  .theme-switch__button:hover {
    background: rgba(0, 0, 0, 0.4);
    border-color: rgba(255, 255, 255, 0.2);
  }
}

/* Manual theme overrides */
.dark-theme .theme-switch__button {
  color: #ffffff;
  background: rgba(0, 0, 0, 0.3);
  border-color: rgba(255, 255, 255, 0.1);
}

.dark-theme .theme-switch__button:hover {
  background: rgba(0, 0, 0, 0.4);
  border-color: rgba(255, 255, 255, 0.2);
}

.light-theme .theme-switch__button {
  color: #333;
  background: rgba(255, 255, 255, 0.1);
  border-color: rgba(255, 255, 255, 0.2);
}

.light-theme .theme-switch__button:hover {
  background: rgba(255, 255, 255, 0.15);
  border-color: rgba(255, 255, 255, 0.3);
}

@media screen and (max-width: 990px) {
  .theme-switch__button {
    width: 40px;
    height: 40px;
    font-size: 1.1rem;
  }

  .theme-switch__icon {
    font-size: 1.1rem;
  }
}
</style>
