import { Limits } from "@/constants/limits";

/**
 * The history-state key that carries an address from one auth page to the next. vue-router owns
 * the other keys of `history.state` (back, current, forward, position, scroll, replaced).
 */
export const PREFILL_EMAIL_KEY = "prefillEmail";

/** The address worth carrying: a string, trimmed, not empty, and short enough to be one. */
const clean = (value: unknown): string => {
  if (typeof value !== "string") return "";
  const address = value.trim();
  // A cut address is worse than none, so one too long is dropped whole. Its shape isn't checked:
  // a typo carried over is still the user's to fix on the next page.
  return address.length > Limits.Email.maxLength ? "" : address;
};

/**
 * The `state` for a link to Log in or Reset password that should open with `address` filled in;
 * nothing when there is none to carry. It stays in the browser's session history, out of the URL.
 */
export const emailPrefillState = (address: string): Record<string, string> | undefined => {
  const carried = clean(address);
  return carried ? { [PREFILL_EMAIL_KEY]: carried } : undefined;
};

/**
 * The address the page was opened with, or "". It belongs to the history entry, so a reload or
 * back and forward bring it again, while a page opened any other way starts empty.
 */
export const emailFromHistory = (): string =>
  clean((window.history.state as Record<string, unknown> | null)?.[PREFILL_EMAIL_KEY]);
