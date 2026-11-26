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
  linkedAppIds,
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

describe("linkedAppIds", () => {
  it("names each app the link asks a scope of once, never a built-in area or a malformed one", () => {
    expect(
      linkedAppIds({
        newApiKey: "1",
        scopes:
          "spotdl:submit,pastes:read,admin:x,shorturls:x,spotdl:read,Spotdl:x,app_1:x,kiwix-2:search"
      })
    ).toEqual(["spotdl", "kiwix-2"]);
    expect(
      linkedAppIds({ newApiKey: "1", scopes: `${"a".repeat(65)}:x,${"b".repeat(64)}:x` })
    ).toEqual(["b".repeat(64)]);
  });

  it("looks nothing up without newApiKey", () => {
    expect(linkedAppIds({ scopes: "spotdl:submit" })).toEqual([]);
  });

  it("looks up at most 5 apps", () => {
    const scopes = Array.from({ length: 7 }, (_, i) => `app${i}:x`).join();
    expect(linkedAppIds({ newApiKey: "1", scopes })).toEqual([
      "app0",
      "app1",
      "app2",
      "app3",
      "app4"
    ]);
  });
});

describe("apiKeyLink", () => {
  it("is nothing without newApiKey", () => {
    expect(apiKeyLink({ name: "Bot", scopes: "pastes:read" })).toBeUndefined();
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
    expect(apiKeyLink({ newApiKey: "1", ...query })).toEqual({
      name: "",
      scopes,
      apps: [],
      leftOut: ""
    });
  });

  it("leaves out unknown and admin scopes, which a link never ticks, naming them", () => {
    expect(
      apiKeyLink({ newApiKey: "1", scopes: "admin:read,spotdl:submit,uploads:read,spotdl:submit" })
    ).toEqual({
      name: "",
      scopes: ["uploads:read"],
      apps: [],
      leftOut: Messages.ApiKeys.scopesLeftOut(["admin:read", "spotdl:submit"], 0)
    });
  });

  it("ticks the scopes the looked-up apps have, after the API's, labelled with the app's name", () => {
    const apps = [
      { id: "spotdl", name: "spotdl-web", scopes: ["spotdl:submit", "spotdl:read"] },
      { id: "kiwix-2", name: "Kiwix", scopes: ["kiwix-2:search"] }
    ];
    expect(
      apiKeyLink(
        { newApiKey: "1", scopes: "kiwix-2:search,spotdl:submit,spotdl:admin,uploads:read" },
        apps
      )
    ).toEqual({
      name: "",
      scopes: ["uploads:read", "spotdl:submit", "kiwix-2:search"],
      apps: [
        { scope: "spotdl:submit", label: "spotdl-web: submit" },
        { scope: "kiwix-2:search", label: "Kiwix: search" }
      ],
      leftOut: Messages.ApiKeys.scopesLeftOut(["spotdl:admin"], 0)
    });
  });

  it("leaves out the scopes of the apps it couldn't check, saying so apart", () => {
    expect(
      apiKeyLink(
        { newApiKey: "1", scopes: "spotdl:submit,spotdl:read,kiwix:search,nobody:x,uploads:read" },
        [],
        ["spotdl", "kiwix"]
      )
    ).toEqual({
      name: "",
      scopes: ["uploads:read"],
      apps: [],
      leftOut: `${Messages.ApiKeys.scopesLeftOut(["nobody:x"], 0)} ${Messages.ApiKeys.appsUnchecked(2)}`
    });
    expect(apiKeyLink({ newApiKey: "1", scopes: "spotdl:submit" }, [], ["spotdl"])!.leftOut).toBe(
      Messages.ApiKeys.appsUnchecked(1)
    );
  });

  it("names only letters and a colon, counting the other scope-shaped values, so a link can't put its own text on the page", () => {
    const scopes = [
      "Your account is locked. Call +1 555 0100",
      "your-account-is-locked:call-555-0100",
      "x".repeat(30) + ":" + "y".repeat(10),
      "Spotdl:submit",
      "spotdl:",
      "spotdl:Submit",
      "<b>a:b</b>",
      "shortUrls:admin",
      "-app:submit",
      "app:-submit",
      "app_1:submit",
      "app-1:submit-2",
      "pastes:read"
    ];
    expect(apiKeyLink({ newApiKey: "1", scopes })!.leftOut).toBe(
      Messages.ApiKeys.scopesLeftOut(["shortUrls:admin"], 3)
    );
    expect(
      apiKeyLink({ newApiKey: "1", scopes: `${"x".repeat(29)}:${"y".repeat(10)}` })!.leftOut
    ).toBe(Messages.ApiKeys.scopesLeftOut([`${"x".repeat(29)}:${"y".repeat(10)}`], 0));
  });

  it.each([
    ["app-1:x", "The link asked for a scope it can't set, so it's left out."],
    ["app-1:x,app-2:y", "The link asked for 2 scopes it can't set, so they're left out."]
  ])("only counts %s", (scopes, leftOut) => {
    expect(apiKeyLink({ newApiKey: "1", scopes })!.leftOut).toBe(leftOut);
  });

  it("names at most 5 left-out scopes, counting the rest", () => {
    const scopes = Array.from({ length: 7 }, (_, i) => `app:${"abcdefg"[i]}`);
    expect(apiKeyLink({ newApiKey: "1", scopes })!.leftOut).toBe(
      Messages.ApiKeys.scopesLeftOut(scopes.slice(0, 5), 2)
    );
  });

  it.each([
    [" Deploy bot ", " Deploy bot "],
    [["First", "Second"], "First"],
    [null, ""]
  ])("keeps the name %j as given: %j", (name, expected) => {
    expect(apiKeyLink({ newApiKey: "1", name })!.name).toBe(expected);
  });
});
