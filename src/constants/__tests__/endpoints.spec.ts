import { describe, expect, it } from "vitest";
import { API_BASE_URL, Endpoints } from "@/constants/endpoints";

describe("Endpoints", () => {
  it("builds on VITE_API_BASE_URL", () => {
    expect(API_BASE_URL).toBe("https://api.test");
  });

  // The API's routers, method and path, plus whether the session cookie goes along.
  it.each([
    [Endpoints.Auth.register, "POST", "/auth/register", false],
    [Endpoints.Auth.registerResend, "POST", "/auth/register/resend", false],
    [Endpoints.Auth.registerVerify, "POST", "/auth/register/verify", true],
    [Endpoints.Auth.usernameAvailable, "GET", "/auth/username-available", false],
    [Endpoints.Auth.login, "POST", "/auth/login", true],
    [Endpoints.Auth.logout, "POST", "/auth/logout", true],
    [Endpoints.Auth.passwordReset, "POST", "/auth/password-reset", false],
    [Endpoints.Auth.passwordResetConfirm, "POST", "/auth/password-reset/confirm", false],
    [Endpoints.Auth.passwordResetConfirmLink, "POST", "/auth/password-reset/confirm-link", false],
    [Endpoints.Auth.github, "GET", "/auth/github", false],
    [Endpoints.Auth.githubStartLink, "POST", "/auth/github/link", true],
    [Endpoints.Auth.githubUnlink, "DELETE", "/auth/github/link", true],
    [Endpoints.Auth.mfaMethods, "GET", "/auth/mfa", true],
    [Endpoints.Auth.mfaEmail, "POST", "/auth/mfa/email", true],
    [Endpoints.Auth.mfaVerify, "POST", "/auth/mfa/verify", true],
    [Endpoints.Auth.mfaVerifyLink, "POST", "/auth/mfa/verify-link", true],
    [Endpoints.Auth.mfaPasskeyOptions, "POST", "/auth/mfa/passkey/options", true],
    [Endpoints.Auth.passkeyOptions, "POST", "/auth/passkey/options", true],
    [Endpoints.Auth.passkeyLogin, "POST", "/auth/passkey", true],
    [Endpoints.User.get, "GET", "/user", true],
    [Endpoints.User.remove, "DELETE", "/user", true],
    [Endpoints.User.setPassword, "POST", "/user/password", true],
    [Endpoints.User.changePassword, "PATCH", "/user/password", true],
    [Endpoints.User.changeEmail, "PATCH", "/user/email", true],
    [Endpoints.User.confirmEmail, "POST", "/user/email/confirm", true],
    [Endpoints.User.mfaEmailOn, "PUT", "/user/mfa/email", true],
    [Endpoints.User.mfaEmailOff, "DELETE", "/user/mfa/email", true],
    [Endpoints.User.mfaTotpSetup, "POST", "/user/mfa/totp", true],
    [Endpoints.User.mfaTotpConfirm, "POST", "/user/mfa/totp/confirm", true],
    [Endpoints.User.mfaTotpOff, "DELETE", "/user/mfa/totp", true],
    [Endpoints.User.mfaRecoveryCodes, "POST", "/user/mfa/recovery-codes", true],
    [Endpoints.User.passkeys, "GET", "/user/passkeys", true],
    [Endpoints.User.passkeyOptions, "POST", "/user/passkeys/options", true],
    [Endpoints.User.addPasskey, "POST", "/user/passkeys", true],
    [Endpoints.User.renamePasskey, "PATCH", "/user/passkeys/:id", true],
    [Endpoints.User.removePasskey, "DELETE", "/user/passkeys/:id", true],
    [Endpoints.User.apiKeys, "GET", "/user/api-keys", true],
    [Endpoints.User.createApiKey, "POST", "/user/api-keys", true],
    [Endpoints.User.rotateApiKey, "POST", "/user/api-keys/:id/rotate", true],
    [Endpoints.User.removeApiKey, "DELETE", "/user/api-keys/:id", true],
    [Endpoints.ShortUrl.redirect, "GET", "/r/:shortenedUrl", false],
    [Endpoints.ShortUrl.lookup, "GET", "/shortenUrl/:shortenedUrl", false],
    [Endpoints.ShortUrl.create, "POST", "/shortenUrl", true],
    [Endpoints.ShortUrl.list, "GET", "/shortenUrls", true],
    [Endpoints.ShortUrl.remove, "DELETE", "/shortenUrl/:shortenedUrl", true],
    [Endpoints.Pastebin.list, "GET", "/pastes/:username", true],
    [Endpoints.Pastebin.get, "GET", "/paste/:id", true],
    [Endpoints.Pastebin.create, "POST", "/paste", true],
    [Endpoints.Pastebin.update, "PATCH", "/paste/:id", true],
    [Endpoints.Pastebin.remove, "DELETE", "/paste/:id", true],
    [Endpoints.Uploads.list, "GET", "/uploads", true],
    [Endpoints.Uploads.usage, "GET", "/uploads/usage", true],
    [Endpoints.Uploads.get, "GET", "/upload/:id", true],
    [Endpoints.Uploads.upload, "POST", "/upload", true],
    [Endpoints.Uploads.update, "PATCH", "/upload/:id", true],
    [Endpoints.Uploads.remove, "DELETE", "/upload/:id", true],
    [Endpoints.Sharex.upload, "GET", "/sharex/upload.sxcu", false],
    [Endpoints.Sharex.paste, "GET", "/sharex/paste.sxcu", false],
    [Endpoints.Sharex.shorten, "GET", "/sharex/shorten.sxcu", false],
    [Endpoints.Docs.index, "GET", "/docs", false],
    [Endpoints.Docs.admin, "GET", "/docs/admin", true],
    [Endpoints.Admin.users, "GET", "/admin/users", true],
    [Endpoints.Admin.user, "GET", "/admin/users/:id", true],
    [Endpoints.Admin.renameUser, "PATCH", "/admin/users/:id", true],
    [Endpoints.Admin.logoutUser, "POST", "/admin/users/:id/logout", true],
    [Endpoints.Admin.revokeUserApiKeys, "DELETE", "/admin/users/:id/api-keys", true],
    [Endpoints.Admin.deleteUser, "DELETE", "/admin/users/:id", true],
    [Endpoints.Admin.resetUserMfa, "DELETE", "/admin/users/:id/mfa", true],
    [Endpoints.Admin.setUploadQuota, "PATCH", "/admin/users/:id/upload-quota", true],
    [Endpoints.Admin.setSuspension, "PATCH", "/admin/users/:id/suspension", true],
    [Endpoints.Admin.userUploads, "GET", "/admin/users/:id/uploads", true],
    [Endpoints.Admin.pastes, "GET", "/admin/pastes", true],
    [Endpoints.Admin.shortUrls, "GET", "/admin/short-urls", true],
    [Endpoints.Admin.uploads, "GET", "/admin/uploads", true],
    [Endpoints.Admin.pendingRegistrations, "GET", "/admin/pending-registrations", true],
    [Endpoints.Admin.removePendingRegistration, "DELETE", "/admin/pending-registrations/:id", true],
    [Endpoints.Admin.clearRateLimits, "DELETE", "/admin/rate-limits", true],
    [Endpoints.Admin.stats, "GET", "/admin/stats", true],
    [Endpoints.Admin.mailBudget, "GET", "/admin/mail-budget", true]
  ])("declares %o", (endpoint, method, path, credentials) => {
    expect(endpoint).toMatchObject({ method, path, credentials });
  });

  it("logs out without following the API's redirect", () => {
    expect(Endpoints.Auth.logout.redirect).toBe("manual");
  });
});
