import { describe, expect, it } from "vitest";
import { UrlShortening, UserManagement } from "@/constants/api";

describe("API endpoints", () => {
  it("builds the user management endpoints from VITE_API_BASE_URL", () => {
    expect(UserManagement.Authentication.register).toBe("https://api.test/auth/register");
    expect(UserManagement.Authentication.login).toBe("https://api.test/auth/login");
    expect(UserManagement.Authentication.logout).toBe("https://api.test/auth/logout");
    expect(UserManagement.Actions.users).toBe("https://api.test/users");
    expect(UserManagement.Actions.user).toBe("https://api.test/user");
    expect(UserManagement.Actions.userWithId).toBe("https://api.test/users/:id");
  });

  it("builds the URL shortening endpoints from VITE_API_BASE_URL", () => {
    expect(UrlShortening.redirect).toBe("https://api.test/r/");
    expect(UrlShortening.shortenUrl).toBe("https://api.test/shortenUrl/create");
  });
});
