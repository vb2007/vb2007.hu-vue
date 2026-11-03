import { Limits } from "@/constants/limits";
import { readSaved, removeSaved, writeSaved } from "@/scripts/utility/savedForOwner";

/**
 * An account without a password confirms a delete with GitHub first (vb2007/vb2007.hu-api#245),
 * which leaves the page. Meanwhile this keeps whose account it was, until when it still counts,
 * so the delete form opens again on the way back.
 */
export const DELETE_INTENT_STORAGE_KEY = "account-delete-intent";

/** Keeps that `username` went to GitHub to confirm deleting their account. */
export const saveDeleteIntent = (username: string) =>
  writeSaved(DELETE_INTENT_STORAGE_KEY, {
    id: username,
    deadline: Date.now() + Limits.Github.reauthMinutes * 60 * 1000
  });

/** Forgets it: the delete was cancelled, or GitHub was opened for something else. */
export const clearDeleteIntent = () => removeSaved(DELETE_INTENT_STORAGE_KEY);

/**
 * The username a delete was being confirmed for, read once: it's cleared either way. Empty when
 * nothing was kept, it's older than the GitHub confirmation lasts, or it can't be read.
 */
export const takeDeleteIntent = (): string => {
  const saved = readSaved(DELETE_INTENT_STORAGE_KEY);
  clearDeleteIntent();
  return saved && saved.deadline > Date.now() ? saved.id : "";
};
