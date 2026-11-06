import type {
  AdminStatsResponse,
  AdminUser,
  AdminUserDetails,
  MailBudgetResponse
} from "@/types/api/admin";

const MB = 1024 ** 2;
const GB = 1024 ** 3;

/** The site's totals as `GET /admin/stats` answers them, with the API's default upload settings. */
export const someStats = (): AdminStatsResponse => ({
  users: 42,
  pastes: 1250,
  shortUrls: 35,
  uploads: { total: 80, public: 12, private: 68, storedBytes: 500 * MB },
  pendingRegistrations: 3,
  settings: { defaultUploadQuotaBytes: 10 * GB, maxFileSizeBytes: 100 * MB }
});

/** Today's mail as `GET /admin/mail-budget` answers it, with the API's default limit of 250. */
export const aMailBudget = (overrides: Partial<MailBudgetResponse> = {}): MailBudgetResponse => ({
  sentToday: 12,
  dailyLimit: 250,
  warningAt: 200,
  registrationStopsAt: 200,
  resetsAt: "2026-11-07T00:00:00.000Z",
  ...overrides
});

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
