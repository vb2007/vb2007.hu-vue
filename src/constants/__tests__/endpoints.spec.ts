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
    [Endpoints.Auth.githubLink, "GET", "/auth/github/link", true],
    [Endpoints.Auth.githubStartLink, "POST", "/auth/github/link", true],
    [Endpoints.Auth.githubUnlink, "DELETE", "/auth/github/link", true],
    [Endpoints.User.get, "GET", "/user", true],
    [Endpoints.User.remove, "DELETE", "/user", true],
    [Endpoints.User.setPassword, "POST", "/user/password", true],
    [Endpoints.User.changePassword, "PATCH", "/user/password", true],
    [Endpoints.User.changeEmail, "PATCH", "/user/email", true],
    [Endpoints.User.confirmEmail, "POST", "/user/email/confirm", true],
    [Endpoints.ShortUrl.redirect, "GET", "/r/:shortenedUrl", false],
    [Endpoints.ShortUrl.lookup, "GET", "/shortenUrl/:shortenedUrl", false],
    [Endpoints.ShortUrl.create, "POST", "/shortenUrl/create", true],
    [Endpoints.Pastebin.list, "GET", "/pastes/:username", true],
    [Endpoints.Pastebin.get, "GET", "/paste/:id", true],
    [Endpoints.Pastebin.create, "POST", "/paste", true],
    [Endpoints.Pastebin.update, "PATCH", "/paste/:id", true],
    [Endpoints.Pastebin.remove, "DELETE", "/paste/:id", true],
    [Endpoints.Uploads.list, "GET", "/uploads", true],
    [Endpoints.Uploads.usage, "GET", "/uploads/usage", true],
    [Endpoints.Uploads.upload, "POST", "/upload", true],
    [Endpoints.Uploads.update, "PATCH", "/upload/:id", true],
    [Endpoints.Uploads.remove, "DELETE", "/upload/:id", true],
    [Endpoints.Admin.users, "GET", "/admin/users", true],
    [Endpoints.Admin.setUploadQuota, "PATCH", "/admin/users/:id/upload-quota", true],
    [Endpoints.Admin.userUploads, "GET", "/admin/users/:id/uploads", true],
    [Endpoints.Admin.pendingRegistrations, "GET", "/admin/pending-registrations", true],
    [Endpoints.Admin.removePendingRegistration, "DELETE", "/admin/pending-registrations/:id", true],
    [Endpoints.Admin.clearRateLimits, "DELETE", "/admin/rate-limits", true]
  ])("declares %o", (endpoint, method, path, credentials) => {
    expect(endpoint).toMatchObject({ method, path, credentials });
  });

  it("logs out without following the API's redirect", () => {
    expect(Endpoints.Auth.logout.redirect).toBe("manual");
  });
});
