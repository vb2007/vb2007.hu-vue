import { ref, watch } from "vue";
import { THEME_STORAGE_KEY, THEMES, type ThemeMode } from "@/constants/theme";

export type Theme = ThemeMode;

// Get system preference
const getSystemTheme = (): "light" | "dark" => {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
};

// Get initial theme from localStorage or default to system preference
const getInitialTheme = (): Theme => {
  const saved = localStorage.getItem(THEME_STORAGE_KEY) as Theme | null;
  // If no saved preference, use system preference
  if (!saved) {
    return getSystemTheme() === "dark" ? THEMES.DARK : THEMES.LIGHT;
  }
  // If saved preference is "auto", convert to system preference
  if (saved === THEMES.AUTO) {
    return getSystemTheme() === "dark" ? THEMES.DARK : THEMES.LIGHT;
  }
  return saved;
};

// Reactive theme state
export const currentTheme = ref<Theme>(getInitialTheme());
export const isDarkMode = ref<boolean>(currentTheme.value === THEMES.DARK);

// Apply theme to document
const applyTheme = (theme: Theme) => {
  const root = document.documentElement;

  // Remove any existing theme classes
  root.classList.remove("light-theme", "dark-theme");

  // Apply the specific theme class
  root.classList.add(`${theme}-theme`);
  isDarkMode.value = theme === THEMES.DARK;
};

// Set theme function
export const setTheme = (theme: Theme) => {
  currentTheme.value = theme;
  localStorage.setItem(THEME_STORAGE_KEY, theme);
  applyTheme(theme);
};

// Watch for theme changes
watch(currentTheme, (newTheme) => {
  applyTheme(newTheme);
});

// Listen for system theme changes to update the theme automatically if no manual preference is set
const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
mediaQuery.addEventListener("change", (e) => {
  // Only auto-update if the user hasn't manually set a preference
  const savedTheme = localStorage.getItem(THEME_STORAGE_KEY);
  if (!savedTheme) {
    const newTheme = e.matches ? THEMES.DARK : THEMES.LIGHT;
    currentTheme.value = newTheme;
    applyTheme(newTheme);
  }
});

// Initialize theme on load
applyTheme(currentTheme.value);
