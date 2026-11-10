import { describe, expect, it } from "vitest";
import { Limits } from "@/constants/limits";
import { Messages } from "@/constants/messages";
import type { RateLimitName } from "@/types/api/admin";

// The API's limiters in the order `DELETE /admin/rate-limits` lists them (vb2007/vb2007.hu-api#384).
const API_ORDER: RateLimitName[] = [
  "loginPerIp",
  "loginPerAccount",
  "loginPerEmail",
  "codeChecksPerIp",
  "codeChecksPerEmail",
  "resetLinkChecksPerIp",
  "mailSendsPerIp",
  "usernameChecksPerIp",
  "accountCodeChecksPerIp",
  "accountCodeChecksPerAccount",
  "passwordChecksPerIp",
  "passwordChecksPerAccount",
  "passwordResetCodeFailures",
  "emailChangeCodeFailures",
  "registrationCodeFailures"
];

describe("Messages.Admin.rateLimitNames", () => {
  it("has a plain name for every limiter, in the API's order", () => {
    expect(Object.keys(Messages.Admin.rateLimitNames)).toEqual(API_ORDER);
    for (const name of API_ORDER) {
      expect(Messages.Admin.rateLimitName(name)).toBe(Messages.Admin.rateLimitNames[name]);
      expect(Messages.Admin.rateLimitNames[name]).not.toBe(name);
    }
  });

  it("names the daily caps with the API's limit", () => {
    for (const name of [
      "passwordResetCodeFailures",
      "emailChangeCodeFailures",
      "registrationCodeFailures"
    ] as const) {
      expect(Messages.Admin.rateLimitNames[name]).toContain(
        `${Limits.Code.failedChecksPerDay} a day`
      );
    }
    expect(Limits.Code.failedChecksPerDay).toBe(20);
    expect(Messages.Admin.rateLimitNames.accountCodeChecksPerAccount).toContain("10 in 15 min");
  });

  it("keeps the API's own name for a limiter added later", () => {
    expect(Messages.Admin.rateLimitName("somethingNew")).toBe("somethingNew");
  });
});
