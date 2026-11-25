import { describe, expect, expectTypeOf, it } from "vitest";
import { Limits } from "@/constants/limits";
import { Messages } from "@/constants/messages";
import {
  apiKeyLink,
  apiKeyNameEarlyError,
  apiKeyNameError,
  grantableScopes,
  isExpired,
  lifetimeDaysOf,
  lifetimeError,
  lifetimeOf,
  SCOPE_AREAS
} from "@/scripts/authentication/apiKeys";
import type { ApiKeyScope } from "@/types/api/apiKeys";

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

describe("the scope list", () => {
  it("names every scope of the type, and only those", () => {
    // `Limits` is typed `satisfies readonly ApiKeyScope[]`: this is the other half.
    expectTypeOf<Exclude<ApiKeyScope, (typeof Limits.ApiKeys.scopes)[number]>>().toBeNever();
    expect(new Set(Limits.ApiKeys.scopes).size).toBe(Limits.ApiKeys.scopes.length);
  });

  it("puts every scope in one of the form's areas", () => {
    for (const scope of grantableScopes(true)) {
      expect(SCOPE_AREAS.filter(({ area }) => scope.startsWith(`${area}:`))).toHaveLength(1);
    }
  });
});

describe("grantableScopes", () => {
  it("gives the admin scopes to the superuser only", () => {
    expect(grantableScopes(true)).toEqual(Limits.ApiKeys.scopes);
    expect(grantableScopes(false)).toEqual(Limits.ApiKeys.scopes.slice(0, 8));
    expect(grantableScopes(false).some((scope) => scope.startsWith("admin:"))).toBe(false);
  });
});

describe("apiKeyLink", () => {
  it("is nothing without newApiKey", () => {
    expect(apiKeyLink({ name: "Bot", scopes: "pastes:read" }, false)).toBeUndefined();
  });

  it.each([
    ["missing", {}, []],
    ["empty", { scopes: "" }, []],
    ["valueless", { scopes: null }, []],
    [
      "spaced and repeated",
      { scopes: " pastes:write , pastes:read,,pastes:write " },
      ["pastes:read", "pastes:write"]
    ],
    [
      "a repeated param's",
      { scopes: ["pastes:write", null, "account:read,pastes:read"] },
      ["account:read", "pastes:read", "pastes:write"]
    ]
  ])("reads %s scopes, in the API's order, once each", (_case, query, scopes) => {
    expect(apiKeyLink({ newApiKey: "1", ...query }, false)).toEqual({
      name: "",
      scopes,
      dropped: []
    });
  });

  it("leaves out unknown scopes, and the admin ones but for the superuser, naming them", () => {
    const query = { newApiKey: "1", scopes: "admin:read,spotdl:submit,uploads:read,spotdl:submit" };
    expect(apiKeyLink(query, false)).toEqual({
      name: "",
      scopes: ["uploads:read"],
      dropped: ["admin:read", "spotdl:submit"]
    });
    expect(apiKeyLink(query, true)).toEqual({
      name: "",
      scopes: ["uploads:read", "admin:read"],
      dropped: ["spotdl:submit"]
    });
  });

  it.each([
    [" Deploy bot ", " Deploy bot "],
    [["First", "Second"], "First"],
    [null, ""]
  ])("keeps the name %j as given: %j", (name, expected) => {
    expect(apiKeyLink({ newApiKey: "1", name }, false)!.name).toBe(expected);
  });
});
