import { Limits } from "@/constants/limits";
import { readSaved, removeSaved, writeSaved } from "@/scripts/utility/savedForOwner";

/**
 * The API's GitHub relink always comes back to `/account`. A confirmation started elsewhere (the API
 * keys page, vb2007/vb2007.hu-api#511) keeps here where to go back to, for as long as GitHub's
 * confirmation lasts, and `/account`'s route guard sends the browser on with the relink's query
 * added to the one kept (an API key deep link's, which fills the create form in again).
 * A GitHub login started on the authorize page (vb2007/vb2007.hu-api#575) keeps it the same way,
 * and the routes it lands on (`/`, `/login`) send the browser back there.
 * It's in sessionStorage, so only this tab follows it, and it's read once whatever comes back.
 */
export const GITHUB_RETURN_STORAGE_KEY = "account-github-return";

/**
 * Keeps that GitHub was opened from `path` (a full path, with its query), for as long as what it
 * was opened for lasts: a confirmation by default, a login's `Limits.Github.loginMinutes`.
 */
export const saveGithubReturn = (path: string, minutes = Limits.Github.reauthMinutes) =>
  writeSaved(GITHUB_RETURN_STORAGE_KEY, { id: path, deadline: Date.now() + minutes * 60 * 1000 });

/** Forgets it: GitHub was opened for something on the account page itself. */
export const clearGithubReturn = () => removeSaved(GITHUB_RETURN_STORAGE_KEY);

/** Where to go back to, read once: "" when nothing was kept, it's too old or it can't be read. */
export const takeGithubReturn = (): string => {
  const saved = readSaved(GITHUB_RETURN_STORAGE_KEY);
  clearGithubReturn();
  return saved && saved.deadline > Date.now() ? saved.id : "";
};
