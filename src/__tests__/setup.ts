import { afterEach, vi } from "vitest";
import { isLoggedIn, isSessionChecked, userEmail } from "@/scripts/authentication/authState";

// jsdom implements neither matchMedia nor the async clipboard API.
// Tests that care about the colour scheme replace matchMedia with their own mock.
Object.defineProperty(window, "matchMedia", {
  writable: true,
  configurable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false
  })
});

Object.defineProperty(navigator, "clipboard", {
  writable: true,
  configurable: true,
  value: { writeText: vi.fn(() => Promise.resolve()) }
});

// The auth state lives in module-level refs shared by every test in a file, so reset it after each one.
// loginStatus/registerStatus are reset by the specs that use them instead: importing user.ts or
// register.ts here would load the real modules before a spec's vi.mock() could replace them.
afterEach(() => {
  localStorage.clear();
  isLoggedIn.value = false;
  userEmail.value = "";
  isSessionChecked.value = false;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
