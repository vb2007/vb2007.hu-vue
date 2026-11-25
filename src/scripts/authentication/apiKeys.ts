import type { LocationQuery } from "vue-router";
import { ApiKeyLinkQuery } from "@/constants/auth";
import { Limits } from "@/constants/limits";
import { Messages } from "@/constants/messages";
import { displayNameEarlyError, displayNameError } from "@/scripts/authentication/displayName";
import { formatDate } from "@/scripts/utility/dateUtil";
import type { ApiKey, ApiKeyLifetime, ApiKeyScope } from "@/types/api/apiKeys";

/** An API key name's problem, "" when it has none, like the API's `apiKeyNameError`. */
export const apiKeyNameError = (name: string) =>
  displayNameError(name, Limits.ApiKeys.nameMaxLength, Messages.ApiKeys);

export const apiKeyNameEarlyError = (name: string) =>
  displayNameEarlyError(name, Limits.ApiKeys.nameMaxLength, Messages.ApiKeys);

/**
 * How a key's lifetime is picked: a number of days, never expiring, or, when rotating, the
 * lifetime it already has (its `expiresInDays` left out of the body).
 */
export type LifetimeChoice = "days" | "never" | "keep";

/** The days typed, when they're a whole number the API takes (1 to 365). */
const daysOf = (days: string): number | undefined => {
  const trimmed = days.trim();
  if (!/^\d+$/.test(trimmed)) return undefined;
  const value = Number(trimmed);
  return value >= Limits.ApiKeys.expiryMinDays && value <= Limits.ApiKeys.expiryMaxDays
    ? value
    : undefined;
};

/** The days field's problem, "" when there's none or the choice isn't a number of days. */
export const lifetimeError = (choice: LifetimeChoice, days: string) =>
  choice !== "days" || daysOf(days) !== undefined
    ? ""
    : Messages.ApiKeys.lifetimeInvalid(Limits.ApiKeys.expiryMinDays, Limits.ApiKeys.expiryMaxDays);

/** What goes in `expiresInDays`: `undefined` to leave it out (keep the lifetime). Check it first. */
export const lifetimeOf = (choice: LifetimeChoice, days: string): ApiKeyLifetime | undefined =>
  choice === "keep" ? undefined : choice === "never" ? null : daysOf(days)!;

/** The scope areas, in the API's order, with the site's name for each. */
export const SCOPE_AREAS: readonly { area: string; label: string }[] = [
  { area: "account", label: "Account" },
  { area: "pastes", label: "Pastes" },
  { area: "shortUrls", label: "Short links" },
  { area: "uploads", label: "Uploads" },
  { area: "admin", label: "Admin" }
];

export const isAdminScope = (scope: ApiKeyScope) => scope.startsWith("admin:");

/** The scopes this account may give a key: the `admin:` ones only for the superuser, like the API. */
export const grantableScopes = (superuser: boolean) =>
  Limits.ApiKeys.scopes.filter((scope) => superuser || !isAdminScope(scope));

/**
 * What the deep link (see `ApiKeyLinkQuery`) fills "Create an API key" in with, `undefined` without
 * it. The name is kept as given, for the form to check. Of the scopes, the ones this account may
 * give a key, in the API's order, and the rest (unknown, or `admin:` ones), which are left out.
 */
export const apiKeyLink = (query: LocationQuery, superuser: boolean) => {
  if (!(ApiKeyLinkQuery.open in query)) return undefined;
  const wanted = new Set(
    [query[ApiKeyLinkQuery.scopes]]
      .flat()
      .join()
      .split(",")
      .map((scope) => scope.trim())
      .filter(Boolean)
  );
  const scopes = grantableScopes(superuser).filter((scope) => wanted.has(scope));
  return {
    name: [query[ApiKeyLinkQuery.keyName]].flat()[0] ?? "",
    scopes,
    dropped: [...wanted].filter((scope) => !scopes.some((kept) => kept === scope))
  };
};

export type ApiKeyPrefill = NonNullable<ReturnType<typeof apiKeyLink>>;

const DAY_MS = 24 * 60 * 60 * 1000;

/** The key's lifetime in days, which a rotate that keeps it starts again; `null` for never. */
export const lifetimeDaysOf = (key: Pick<ApiKey, "createdAt" | "expiresAt">) =>
  key.expiresAt === null
    ? null
    : Math.round((Date.parse(key.expiresAt) - Date.parse(key.createdAt)) / DAY_MS);

/** Whether the key no longer works by its age; one that never expires never is. */
export const isExpired = (key: Pick<ApiKey, "expiresAt">, now = Date.now()) =>
  key.expiresAt !== null && Date.parse(key.expiresAt) <= now;

/**
 * A key's dates as its rows say them, the user's and the admin's: when it was made, when it
 * expires (or ran out, as of `now`, flagged `expired`), and its last use.
 */
export const apiKeyDates = (key: ApiKey, now = Date.now()) => {
  const expired = isExpired(key, now);
  return [
    { text: `Created ${formatDate(key.createdAt)}`, expired: false },
    {
      text:
        key.expiresAt === null
          ? "Never expires"
          : `${expired ? "Expired" : "Expires"} ${formatDate(key.expiresAt)}`,
      expired
    },
    {
      text: key.lastUsedAt ? `Last used ${formatDate(key.lastUsedAt)}` : "Never used",
      expired: false
    }
  ];
};
