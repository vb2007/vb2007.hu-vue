import { beforeEach, describe, expect, it, vi } from "vitest";
import { THEME_STORAGE_KEY } from "@/constants/theme";

// themeState reads localStorage and matchMedia and registers a listener as soon as it is imported,
// so every test sets the stage first and then imports a fresh copy of the module.
let systemPrefersDark = false;
let emitSchemeChange: (matches: boolean) => void = () => {};

const loadThemeState = async () => {
  vi.resetModules();
  return import("@/scripts/utility/themeState");
};

const rootClasses = () => [...document.documentElement.classList];

beforeEach(() => {
  systemPrefersDark = false;
  document.documentElement.className = "";
  vi.spyOn(window, "matchMedia").mockImplementation(
    (query: string) =>
      ({
        matches: systemPrefersDark,
        media: query,
        addEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => {
          emitSchemeChange = (matches) => listener({ matches } as MediaQueryListEvent);
        }
      }) as unknown as MediaQueryList
  );
});

describe("themeState", () => {
  it("follows a light system preference when nothing is saved", async () => {
    const { currentTheme, isDarkMode } = await loadThemeState();

    expect(currentTheme.value).toBe("light");
    expect(isDarkMode.value).toBe(false);
    expect(rootClasses()).toEqual(["light-theme"]);
  });

  it("follows a dark system preference when nothing is saved", async () => {
    systemPrefersDark = true;

    const { currentTheme, isDarkMode } = await loadThemeState();

    expect(currentTheme.value).toBe("dark");
    expect(isDarkMode.value).toBe(true);
    expect(rootClasses()).toEqual(["dark-theme"]);
  });

  it("prefers a saved theme over the system preference", async () => {
    systemPrefersDark = true;
    localStorage.setItem(THEME_STORAGE_KEY, "light");

    const { currentTheme } = await loadThemeState();

    expect(currentTheme.value).toBe("light");
    expect(rootClasses()).toEqual(["light-theme"]);
  });

  it("setTheme saves the choice and swaps the root class", async () => {
    const { setTheme, currentTheme, isDarkMode } = await loadThemeState();

    setTheme("dark");

    expect(currentTheme.value).toBe("dark");
    expect(isDarkMode.value).toBe(true);
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
    expect(rootClasses()).toEqual(["dark-theme"]);
  });

  it("re-applies the theme when currentTheme is changed directly", async () => {
    const { currentTheme, isDarkMode } = await loadThemeState();

    currentTheme.value = "dark";
    await vi.waitFor(() => expect(rootClasses()).toEqual(["dark-theme"]));
    expect(isDarkMode.value).toBe(true);
  });

  it("tracks system changes while there is no saved preference", async () => {
    const { currentTheme } = await loadThemeState();

    emitSchemeChange(true);
    expect(currentTheme.value).toBe("dark");
    expect(rootClasses()).toEqual(["dark-theme"]);

    emitSchemeChange(false);
    expect(currentTheme.value).toBe("light");
    expect(rootClasses()).toEqual(["light-theme"]);
  });

  it("ignores system changes once the user picked a theme", async () => {
    const { currentTheme, setTheme } = await loadThemeState();
    setTheme("light");

    emitSchemeChange(true);

    expect(currentTheme.value).toBe("light");
    expect(rootClasses()).toEqual(["light-theme"]);
  });
});
