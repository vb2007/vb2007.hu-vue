import { Messages } from "@/constants/messages";
import type { ClearRateLimitsBody } from "@/types/api/admin";

/** One part of a dotted IPv4 address, 0 to 255 without a leading zero, like Node's `isIP`. */
const IPV4_PART = /(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]\d|\d)/.source;
const IPV4 = new RegExp(`^${IPV4_PART}(?:\\.${IPV4_PART}){3}$`);
/** Hex groups, colons and an embedded IPv4 tail, then an optional zone (`fe80::1%eth0`). */
const IPV6_SHAPE = /^([0-9a-f:.]*:[0-9a-f:.]*)(?:%[\w.:-]+)?$/i;

/**
 * Whether `value` is an IPv4 or IPv6 address, as the API's `net.isIP` decides. The URL parser
 * checks the IPv6 groups, once the shape leaves nothing else in the brackets.
 */
export const isIpAddress = (value: string): boolean => {
  if (IPV4.test(value)) return true;
  const address = value.match(IPV6_SHAPE)?.[1];
  return address !== undefined && URL.canParse(`http://[${address}]/`);
};

/** The IP field's problem: "" when it's empty or an address. */
export const ipError = (ip: string): string => {
  const value = ip.trim();
  return value && !isIpAddress(value) ? Messages.Admin.invalidIp : "";
};

/** The e-mail field's problem: the API needs one of the two fields. */
export const rateLimitTargetError = (email: string, ip: string): string =>
  email.trim() || ip.trim() ? "" : Messages.Admin.rateLimitTargetMissing;

/** What to send: each field trimmed, and left out while it's empty, as the API refuses a blank one. */
export const rateLimitBody = (email: string, ip: string): ClearRateLimitsBody => {
  const body: ClearRateLimitsBody = {};
  if (email.trim()) body.email = email.trim();
  if (ip.trim()) body.ip = ip.trim();
  return body;
};

/** What a clear was for, e.g. "anna@example.com and 203.0.113.7". */
export const rateLimitTarget = ({ email, ip }: ClearRateLimitsBody): string =>
  [email, ip].filter(Boolean).join(" and ");
