import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  DELETE_INTENT_STORAGE_KEY,
  clearDeleteIntent,
  saveDeleteIntent,
  takeDeleteIntent
} from "@/scripts/authentication/deleteIntent";

describe("deleteIntent", () => {
  beforeEach(() => sessionStorage.clear());

  it("keeps whose delete GitHub is confirming, until the confirmation would run out", () => {
    vi.useFakeTimers({ now: new Date("2026-11-03T12:00:00Z") });

    saveDeleteIntent("me");

    expect(JSON.parse(sessionStorage.getItem(DELETE_INTENT_STORAGE_KEY)!)).toEqual({
      id: "me",
      deadline: new Date("2026-11-03T12:10:00Z").getTime()
    });
  });

  it("gives the username back once, then forgets it", () => {
    saveDeleteIntent("me");

    expect(takeDeleteIntent()).toBe("me");
    expect(sessionStorage.getItem(DELETE_INTENT_STORAGE_KEY)).toBeNull();
    expect(takeDeleteIntent()).toBe("");
  });

  it("drops a delete that went to GitHub too long ago", () => {
    vi.useFakeTimers();
    saveDeleteIntent("me");

    vi.setSystemTime(Date.now() + 10 * 60 * 1000);

    expect(takeDeleteIntent()).toBe("");
    expect(sessionStorage.getItem(DELETE_INTENT_STORAGE_KEY)).toBeNull();
  });

  it("still takes it just before then", () => {
    vi.useFakeTimers();
    saveDeleteIntent("me");

    vi.setSystemTime(Date.now() + 10 * 60 * 1000 - 1);

    expect(takeDeleteIntent()).toBe("me");
  });

  it("is forgotten when the delete is cancelled", () => {
    saveDeleteIntent("me");

    clearDeleteIntent();

    expect(takeDeleteIntent()).toBe("");
  });

  it.each([
    ["nothing kept", null],
    ["unreadable", "{"],
    ["no username", JSON.stringify({ deadline: Date.now() + 60_000 })],
    ["no deadline", JSON.stringify({ id: "me" })],
    ["a deadline that isn't a time", JSON.stringify({ id: "me", deadline: "soon" })]
  ])("ignores what can't be a delete intent: %s", (_name, stored) => {
    if (stored !== null) sessionStorage.setItem(DELETE_INTENT_STORAGE_KEY, stored);

    expect(takeDeleteIntent()).toBe("");
    expect(sessionStorage.getItem(DELETE_INTENT_STORAGE_KEY)).toBeNull();
  });

  it("gets by without storage", () => {
    const refuse = () => {
      throw new DOMException("The storage is off.", "SecurityError");
    };
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(refuse);
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(refuse);
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(refuse);

    expect(() => saveDeleteIntent("me")).not.toThrow();
    expect(() => clearDeleteIntent()).not.toThrow();
    expect(takeDeleteIntent()).toBe("");
  });
});
