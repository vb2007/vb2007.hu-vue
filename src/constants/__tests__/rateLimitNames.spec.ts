import { describe, expect, it } from "vitest";
import { Limits } from "@/constants/limits";
import { Messages } from "@/constants/messages";
import type { RateLimitName } from "@/types/api/admin";

// The API's limiters in the order `DELETE /admin/rate-limits` lists them (vb2007/vb2007.hu-api#384):
// its `namedLimiters` (src/middlewares/rateLimit.ts), then `clearCodeFailuresOf`'s stored counts
// (src/helpers/admin.ts), with the passkey and MFA ones of vb2007/vb2007.hu-api#493.
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
  "passkeyOptionsPerIp",
  "passkeyLoginsPerIp",
  "passwordResetCodeFailures",
  "emailChangeCodeFailures",
  "registrationCodeFailures",
  "mfaCodeFailures",
  "mfaEmailSends",
  "securityNotices"
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
      "registrationCodeFailures",
      "mfaCodeFailures"
    ] as const) {
      expect(Messages.Admin.rateLimitNames[name]).toContain(
        `${Limits.Code.failedChecksPerDay} a day`
      );
    }
    expect(Limits.Code.failedChecksPerDay).toBe(20);
    // The API's MFA_EMAILS_PER_DAY and SECURITY_NOTICES_PER_DAY.
    expect(Messages.Admin.rateLimitNames.mfaEmailSends).toContain(
      `${Limits.Mfa.emailsPerDay} a day`
    );
    expect(Messages.Admin.rateLimitNames.securityNotices).toContain(
      `${Limits.Mfa.securityNoticesPerDay} a day`
    );
    expect([Limits.Mfa.emailsPerDay, Limits.Mfa.securityNoticesPerDay]).toEqual([10, 10]);
    expect(Messages.Admin.rateLimitNames.accountCodeChecksPerAccount).toContain("10 in 15 min");
  });

  it("keeps the API's own name for a limiter added later", () => {
    expect(Messages.Admin.rateLimitName("somethingNew")).toBe("somethingNew");
  });
});
