import { describe, expect, it } from "vitest";
import { Messages } from "@/constants/messages";
import {
  ipError,
  isIpAddress,
  rateLimitBody,
  rateLimitTarget,
  rateLimitTargetError
} from "@/scripts/admin/rateLimits";

describe("isIpAddress", () => {
  it.each([
    "203.0.113.7",
    "0.0.0.0",
    "255.255.255.255",
    "::1",
    "::",
    "2001:db8::8a2e:370:7334",
    "2001:0db8:0000:0000:0000:ff00:0042:8329",
    "::ffff:203.0.113.7",
    "fe80::1%eth0"
  ])("takes %s", (value) => {
    expect(isIpAddress(value)).toBe(true);
  });

  it.each([
    "",
    "203.0.113",
    "203.0.113.256",
    "203.0.113.07",
    "1.2.3.4.5",
    "example.com",
    "2001:db8:::1",
    "2001:db8::g",
    "1:2:3:4:5:6:7:8:9",
    "::1]/x[",
    "fe80::1%",
    " 203.0.113.7"
  ])("refuses %o", (value) => {
    expect(isIpAddress(value)).toBe(false);
  });
});

describe("ipError", () => {
  it("is quiet while empty or an address, around spaces too", () => {
    expect(ipError("")).toBe("");
    expect(ipError("  ")).toBe("");
    expect(ipError(" 203.0.113.7 ")).toBe("");
  });

  it("names anything else", () => {
    expect(ipError("localhost")).toBe(Messages.Admin.invalidIp);
  });
});

describe("rateLimitTargetError", () => {
  it("wants an e-mail, an IP or both", () => {
    expect(rateLimitTargetError(" ", "")).toBe(Messages.Admin.rateLimitTargetMissing);
    expect(rateLimitTargetError("anna@example.com", "")).toBe("");
    expect(rateLimitTargetError("", "::1")).toBe("");
  });
});

describe("rateLimitBody", () => {
  it("trims each field and leaves an empty one out", () => {
    expect(rateLimitBody(" Anna@example.com ", " ::1 ")).toEqual({
      email: "Anna@example.com",
      ip: "::1"
    });
    expect(rateLimitBody("anna@example.com", " ")).toEqual({ email: "anna@example.com" });
    expect(rateLimitBody("", "::1")).toEqual({ ip: "::1" });
  });
});

describe("rateLimitTarget", () => {
  it("names what was sent", () => {
    expect(rateLimitTarget({ email: "anna@example.com", ip: "::1" })).toBe(
      "anna@example.com and ::1"
    );
    expect(rateLimitTarget({ ip: "::1" })).toBe("::1");
  });
});
