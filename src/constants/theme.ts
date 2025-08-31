export const THEME_STORAGE_KEY = "theme";

export const THEMES = {
  LIGHT: "light",
  DARK: "dark",
  AUTO: "auto"
} as const;

export type ThemeMode = (typeof THEMES)[keyof typeof THEMES];
