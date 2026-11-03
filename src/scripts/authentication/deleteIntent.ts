import { Limits } from "@/constants/limits";
import { StorageKeys } from "@/constants/storage";

/**
 * An account without a password confirms a delete with GitHub first (vb2007/vb2007.hu-api#245),
 * which leaves the page. What's kept meanwhile: whose account, and until when it still counts.
 */
interface SavedIntent {
  username: string;
  deadline: number;
}

/** Keeps that `username` went to GitHub to confirm deleting their account. */
export const saveDeleteIntent = (username: string) => {
  const intent: SavedIntent = {
    username,
    deadline: Date.now() + Limits.Github.reauthMinutes * 60 * 1000
  };
  try {
    sessionStorage.setItem(StorageKeys.deleteIntent, JSON.stringify(intent));
  } catch {
    // Storage is off or full: the user comes back to the usual notice and opens the form again.
  }
};

export const clearDeleteIntent = () => {
  try {
    sessionStorage.removeItem(StorageKeys.deleteIntent);
  } catch {
    // Storage is off: nothing was kept.
  }
};

/**
 * The username a delete was being confirmed for, read once: it's cleared either way. Empty when
 * nothing was kept, it's older than the GitHub confirmation lasts, or it can't be read.
 */
export const takeDeleteIntent = (): string => {
  let saved: Partial<SavedIntent> | null = null;
  try {
    saved = JSON.parse(sessionStorage.getItem(StorageKeys.deleteIntent) ?? "null");
  } catch {
    // Unreadable, or storage is off.
  }
  clearDeleteIntent();

  return typeof saved?.username === "string" &&
    typeof saved.deadline === "number" &&
    saved.deadline > Date.now()
    ? saved.username
    : "";
};
