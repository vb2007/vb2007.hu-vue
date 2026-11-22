import { describe, expect, it } from "vitest";
import { Limits } from "@/constants/limits";
import { Messages } from "@/constants/messages";
import {
  apiKeyNameEarlyError,
  apiKeyNameError,
  grantableScopes,
  isExpired,
  lifetimeDaysOf,
  lifetimeError,
  lifetimeOf
} from "@/scripts/authentication/apiKeys";

describe("apiKeyNameError", () => {
  it.each([
    ["Deploy script", ""],
    ["  Deploy  ", ""],
    ["", Messages.ApiKeys.nameMissing],
    ["   ", Messages.ApiKeys.nameMissing],
    ["two\nlines", Messages.ApiKeys.nameInvalidCharacters],
    ["zero​width", Messages.ApiKeys.nameInvalidCharacters],
    // The joiner inside an emoji is allowed, as in usernames.
    ["👩‍💻 bot", ""],
    ["a".repeat(64), ""],
    // Counted in characters: 64 emoji are 128 UTF-16 units.
    ["😀".repeat(64), ""],
    ["a".repeat(65), Messages.ApiKeys.nameTooLong(64)],
    // The API's order: a forbidden character before the length.
    [`${"a".repeat(65)}​b`, Messages.ApiKeys.nameInvalidCharacters]
  ])("checks %j", (name, error) => {
    expect(apiKeyNameError(name)).toBe(error);
  });

  it("shows only what more typing can't fix while typing", () => {
    expect(apiKeyNameEarlyError("")).toBe("");
    expect(apiKeyNameEarlyError("a".repeat(65))).toBe(Messages.ApiKeys.nameTooLong(64));
  });
});

describe("lifetimes", () => {
  const invalid = Messages.ApiKeys.lifetimeInvalid(1, 365);

  it.each([
    ["90", ""],
    [" 1 ", ""],
    ["365", ""],
    ["0", invalid],
    ["366", invalid],
    ["1.5", invalid],
    ["1e2", invalid],
    ["-3", invalid],
    ["", invalid]
  ])("checks %j days", (days, error) => {
    expect(lifetimeError("days", days)).toBe(error);
  });

  it("doesn't check the days when the key keeps its lifetime or never expires", () => {
    expect(lifetimeError("keep", "")).toBe("");
    expect(lifetimeError("never", "nope")).toBe("");
  });

  it("sends a number, null for never, and nothing to keep the lifetime", () => {
    expect(lifetimeOf("days", " 30 ")).toBe(30);
    expect(lifetimeOf("never", "30")).toBeNull();
    expect(lifetimeOf("keep", "30")).toBeUndefined();
  });

  it("reads a key's lifetime in days", () => {
    expect(
      lifetimeDaysOf({
        createdAt: "2026-11-21T10:00:00.000Z",
        expiresAt: "2027-02-19T10:00:00.000Z"
      })
    ).toBe(90);
    expect(lifetimeDaysOf({ createdAt: "2026-11-21T10:00:00.000Z", expiresAt: null })).toBeNull();
  });

  it("tells an expired key", () => {
    const now = Date.parse("2026-11-22T10:00:00.000Z");
    expect(isExpired({ expiresAt: "2026-11-22T09:59:59.000Z" }, now)).toBe(true);
    expect(isExpired({ expiresAt: "2026-11-22T10:00:00.000Z" }, now)).toBe(true);
    expect(isExpired({ expiresAt: "2026-11-23T10:00:00.000Z" }, now)).toBe(false);
    expect(isExpired({ expiresAt: null }, now)).toBe(false);
  });
});

describe("grantableScopes", () => {
  it("gives the admin scopes to the superuser only", () => {
    expect(grantableScopes(true)).toEqual(Limits.ApiKeys.scopes);
    expect(grantableScopes(false)).toEqual(Limits.ApiKeys.scopes.slice(0, 8));
    expect(grantableScopes(false).some((scope) => scope.startsWith("admin:"))).toBe(false);
  });
});
