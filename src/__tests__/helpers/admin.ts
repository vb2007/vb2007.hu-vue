import type { AdminUser } from "@/scripts/admin/adminUser";

const GB = 1024 ** 3;

/** A user as the admin list returns them, on the default 10 GB quota; override what a test cares about. */
export const anAdminUser = (
  id: string,
  {
    uploads,
    ...overrides
  }: Partial<Omit<AdminUser, "uploads">> & {
    uploads?: Partial<AdminUser["uploads"]>;
  } = {}
): AdminUser => ({
  id,
  username: `user-${id}`,
  email: `${id}@example.com`,
  createdAt: "2026-01-10T12:00:00.000Z",
  isSuperuser: false,
  uploads: { usedBytes: 2 * GB, count: 12, quotaBytes: 10 * GB, hasCustomQuota: false, ...uploads },
  ...overrides
});
