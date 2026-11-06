import type { AdminUser, AdminUserDetails } from "@/types/api/admin";

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
  suspendedAt: null,
  uploads: { usedBytes: 2 * GB, count: 12, quotaBytes: 10 * GB, hasCustomQuota: false, ...uploads },
  ...overrides
});

/**
 * A user as `GET /admin/users/:id` returns them: a confirmed password account without GitHub, owning
 * a few pastes and a short link besides `anAdminUser`'s uploads.
 */
export const anAdminUserDetails = (
  id: string,
  {
    uploads,
    counts,
    ...overrides
  }: Partial<Omit<AdminUserDetails, "uploads" | "counts">> & {
    uploads?: Partial<AdminUser["uploads"]>;
    counts?: Partial<AdminUserDetails["counts"]>;
  } = {}
): AdminUserDetails => {
  const user = anAdminUser(id, { uploads });
  return {
    ...user,
    hasPassword: true,
    emailVerified: true,
    pendingEmail: null,
    githubLogin: null,
    counts: { pastes: 3, shortUrls: 1, uploads: user.uploads.count, ...counts },
    ...overrides
  };
};
