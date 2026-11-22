import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  GITHUB_RETURN_STORAGE_KEY,
  clearGithubReturn,
  saveGithubReturn,
  takeGithubReturn
} from "@/scripts/authentication/githubReturn";

describe("githubReturn", () => {
  beforeEach(() => sessionStorage.clear());
  afterEach(() => vi.useRealTimers());

  it("keeps where to come back to, until GitHub's confirmation would run out", () => {
    vi.useFakeTimers({ now: new Date("2026-11-22T12:00:00Z") });

    saveGithubReturn("/account/api-keys");

    expect(JSON.parse(sessionStorage.getItem(GITHUB_RETURN_STORAGE_KEY)!)).toEqual({
      id: "/account/api-keys",
      deadline: new Date("2026-11-22T12:10:00Z").getTime()
    });
  });

  it("gives it back once, then forgets it", () => {
    saveGithubReturn("/account/api-keys");

    expect(takeGithubReturn()).toBe("/account/api-keys");
    expect(takeGithubReturn()).toBe("");
  });

  it("drops one that's too old", () => {
    vi.useFakeTimers();
    saveGithubReturn("/account/api-keys");
    vi.setSystemTime(Date.now() + 10 * 60 * 1000);

    expect(takeGithubReturn()).toBe("");
    expect(sessionStorage.getItem(GITHUB_RETURN_STORAGE_KEY)).toBeNull();
  });

  it("is forgotten when GitHub is opened for the account page itself", () => {
    saveGithubReturn("/account/api-keys");
    clearGithubReturn();

    expect(takeGithubReturn()).toBe("");
  });
});
