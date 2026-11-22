import { Limits } from "@/constants/limits";
import { readSaved, removeSaved, writeSaved } from "@/scripts/utility/savedForOwner";

/**
 * The API's GitHub relink always comes back to `/account`. A confirmation started elsewhere (the API
 * keys page, vb2007/vb2007.hu-api#511) keeps here where to go back to, for as long as GitHub's
 * confirmation lasts, and `/account`'s route guard sends the browser on with the relink's query.
 * It's in sessionStorage, so only this tab follows it, and it's read once whatever comes back.
 */
export const GITHUB_RETURN_STORAGE_KEY = "account-github-return";

/** Keeps that GitHub was opened to confirm something done at `path`. */
export const saveGithubReturn = (path: string) =>
  writeSaved(GITHUB_RETURN_STORAGE_KEY, {
    id: path,
    deadline: Date.now() + Limits.Github.reauthMinutes * 60 * 1000
  });

/** Forgets it: GitHub was opened for something on the account page itself. */
export const clearGithubReturn = () => removeSaved(GITHUB_RETURN_STORAGE_KEY);

/** Where to go back to, read once: "" when nothing was kept, it's too old or it can't be read. */
export const takeGithubReturn = (): string => {
  const saved = readSaved(GITHUB_RETURN_STORAGE_KEY);
  clearGithubReturn();
  return saved && saved.deadline > Date.now() ? saved.id : "";
};
