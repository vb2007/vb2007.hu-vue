export const THEME_STORAGE_KEY = "theme";

export const THEMES = {
  LIGHT: "light",
  DARK: "dark"
} as const;

export type ThemeMode = (typeof THEMES)[keyof typeof THEMES];
