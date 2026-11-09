import { afterEach, describe, expect, it } from "vitest";
import { Limits } from "@/constants/limits";
import {
  emailFromHistory,
  emailPrefillState,
  PREFILL_EMAIL_KEY
} from "@/scripts/authentication/emailPrefill";

const longest = `${"a".repeat(Limits.Email.maxLength - "@x.hu".length)}@x.hu`;

describe("emailPrefill", () => {
  afterEach(() => {
    window.history.replaceState(null, "");
  });

  it("keeps the address under a key of its own, apart from the router's", () => {
    expect(PREFILL_EMAIL_KEY).toBe("prefillEmail");
    expect(emailPrefillState("anna@example.com")).toEqual({ prefillEmail: "anna@example.com" });
  });

  it("carries the address as typed, trimmed, whatever its shape", () => {
    expect(emailPrefillState("  Anna@Example.com ")).toEqual({ prefillEmail: "Anna@Example.com" });
    expect(emailPrefillState("ann@exampl")).toEqual({ prefillEmail: "ann@exampl" });
    expect(emailPrefillState(longest)).toEqual({ prefillEmail: longest });
  });

  it("carries nothing for a blank or too long address", () => {
    expect(emailPrefillState("")).toBeUndefined();
    expect(emailPrefillState("   ")).toBeUndefined();
    expect(emailPrefillState(`${longest}x`)).toBeUndefined();
  });

  it("reads the address the page was opened with", () => {
    window.history.replaceState({ prefillEmail: " anna@example.com " }, "");
    expect(emailFromHistory()).toBe("anna@example.com");
    window.history.replaceState({ prefillEmail: longest }, "");
    expect(emailFromHistory()).toBe(longest);
  });

  it.each([
    ["no state", null],
    ["other state", { uploadsOwner: "anna" }],
    ["a number", { prefillEmail: 7 }],
    ["an object", { prefillEmail: { address: "anna@example.com" } }],
    ["nothing", { prefillEmail: "" }],
    ["blanks", { prefillEmail: "   " }],
    ["too long an address", { prefillEmail: `${longest}x` }]
  ])("reads no address from %s", (_, state) => {
    window.history.replaceState(state, "");
    expect(emailFromHistory()).toBe("");
  });
});
