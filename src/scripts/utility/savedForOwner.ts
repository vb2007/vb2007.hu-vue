/**
 * Something kept in sessionStorage for one owner (e.g. a normalized e-mail address or a username)
 * until a deadline, such as a code's resend cooldown or a delete GitHub is confirming.
 */
export interface SavedForOwner {
  id: string;
  deadline: number;
}

/**
 * What's kept under `key`, or null when there's none, it can't be read or storage is off. It
 * doesn't look at the deadline: the caller decides what a passed one means.
 */
export const readSaved = (key: string): SavedForOwner | null => {
  try {
    const saved = JSON.parse(sessionStorage.getItem(key) ?? "null");
    return typeof saved?.id === "string" && Number.isFinite(saved.deadline) ? saved : null;
  } catch {
    return null;
  }
};

export const writeSaved = (key: string, saved: SavedForOwner) => {
  try {
    sessionStorage.setItem(key, JSON.stringify(saved));
  } catch {
    // Storage is off or full: it just won't survive leaving the page.
  }
};

export const removeSaved = (key: string) => {
  try {
    sessionStorage.removeItem(key);
  } catch {
    // Storage is off: nothing was kept.
  }
};
