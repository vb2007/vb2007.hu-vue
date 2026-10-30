import { describe, expect, it } from "vitest";
import { Pastebin, UrlShortening, UserManagement } from "@/constants/api";

describe("API endpoints", () => {
  it("builds the user management endpoints from VITE_API_BASE_URL", () => {
    expect(UserManagement.Authentication.register).toBe("https://api.test/auth/register");
    expect(UserManagement.Authentication.login).toBe("https://api.test/auth/login");
    expect(UserManagement.Authentication.logout).toBe("https://api.test/auth/logout");
    expect(UserManagement.Authentication.github).toBe("https://api.test/auth/github");
    expect(UserManagement.Authentication.githubLink).toBe("https://api.test/auth/github/link");
    expect(UserManagement.Authentication.registerVerify).toBe(
      "https://api.test/auth/register/verify"
    );
    expect(UserManagement.Authentication.registerResend).toBe(
      "https://api.test/auth/register/resend"
    );
    expect(UserManagement.Authentication.passwordReset).toBe(
      "https://api.test/auth/password-reset"
    );
    expect(UserManagement.Authentication.passwordResetConfirm).toBe(
      "https://api.test/auth/password-reset/confirm"
    );
    expect(UserManagement.Actions.user).toBe("https://api.test/user");
    expect(UserManagement.Actions.userEmail).toBe("https://api.test/user/email");
    expect(UserManagement.Actions.userPassword).toBe("https://api.test/user/password");
    expect(UserManagement.Actions.userEmailConfirm).toBe("https://api.test/user/email/confirm");
  });

  it("builds the URL shortening endpoints from VITE_API_BASE_URL", () => {
    expect(UrlShortening.redirect).toBe("https://api.test/r/");
    expect(UrlShortening.shortenUrl).toBe("https://api.test/shortenUrl/create");
    expect(UrlShortening.lookup).toBe("https://api.test/shortenUrl/:shortenedUrl");
  });

  it("builds the pastebin endpoints from VITE_API_BASE_URL", () => {
    expect(Pastebin.paste).toBe("https://api.test/paste");
    expect(Pastebin.pasteWithId).toBe("https://api.test/paste/:id");
    expect(Pastebin.pastesByUsername).toBe("https://api.test/pastes/:username");
  });
});
