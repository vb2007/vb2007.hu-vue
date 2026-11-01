import { beforeEach, describe, expect, it, vi } from "vitest";
import { jsonResponse, mockFetch } from "@/__tests__/helpers/fetch";

// user.ts caches the session lookup at module level, so each test imports fresh copies
// of it and of the auth state it writes to.
const load = async () => {
  vi.resetModules();
  const user = await import("@/scripts/authentication/user");
  const authState = await import("@/scripts/authentication/authState");
  return { ...user, ...authState };
};

let fetchMock: ReturnType<typeof mockFetch>;

beforeEach(() => {
  fetchMock = mockFetch();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("restoreSession", () => {
  it("marks the user as logged in when the API knows the session", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { email: "me@example.com", username: "me" }));
    const { restoreSession, isLoggedIn, userEmail, username, isSessionChecked } = await load();

    await restoreSession();

    expect(fetchMock).toHaveBeenCalledWith("https://api.test/user", {
      method: "GET",
      credentials: "include"
    });
    expect(isLoggedIn.value).toBe(true);
    expect(userEmail.value).toBe("me@example.com");
    expect(username.value).toBe("me");
    expect(isSessionChecked.value).toBe(true);
  });

  it("knows the superuser, and only takes a real true for it", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { email: "me@example.com", username: "me", isSuperuser: true })
    );
    const { restoreSession, isSuperuser } = await load();
    await restoreSession();
    expect(isSuperuser.value).toBe(true);

    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { email: "me@example.com", isSuperuser: "yes" })
    );
    const fresh = await load();
    await fresh.restoreSession();
    expect(fresh.isSuperuser.value).toBe(false);
  });

  it("knows whether GitHub is linked from the user's githubId", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { email: "me@example.com", username: "me", githubId: "583231" })
    );
    const { restoreSession, githubLinked } = await load();
    await restoreSession();
    expect(githubLinked.value).toBe(true);

    fetchMock.mockResolvedValueOnce(jsonResponse(200, { email: "me@example.com", username: "me" }));
    const fresh = await load();
    await fresh.restoreSession();
    expect(fresh.githubLinked.value).toBe(false);
  });

  it("knows the GitHub login, and only takes a real true for hasPassword", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        email: "me@example.com",
        githubId: "583231",
        githubLogin: "octocat",
        hasPassword: true
      })
    );
    const { restoreSession, githubLogin, hasPassword } = await load();
    await restoreSession();
    expect(githubLogin.value).toBe("octocat");
    expect(hasPassword.value).toBe(true);

    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { email: "me@example.com", githubId: "583231", hasPassword: "yes" })
    );
    const fresh = await load();
    await fresh.restoreSession();
    expect(fresh.githubLogin.value).toBe("");
    expect(fresh.hasPassword.value).toBe(false);
  });

  it("knows a change waiting for its code, and only takes a real true for emailVerified", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        email: "me@example.com",
        emailVerified: true,
        pendingEmail: "new@example.com"
      })
    );
    const { restoreSession, emailVerified, pendingEmail } = await load();
    await restoreSession();
    expect(pendingEmail.value).toBe("new@example.com");
    expect(emailVerified.value).toBe(true);

    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { email: "me@example.com", emailVerified: "yes", pendingEmail: null })
    );
    const fresh = await load();
    await fresh.restoreSession();
    expect(fresh.pendingEmail.value).toBe("");
    expect(fresh.emailVerified.value).toBe(false);
  });

  it("leaves the username empty when the API doesn't send one", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { email: "me@example.com" }));
    const { restoreSession, isLoggedIn, username } = await load();

    await restoreSession();

    expect(isLoggedIn.value).toBe(true);
    expect(username.value).toBe("");
  });

  it("only asks the API once, however often it is called", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(401));
    const { restoreSession } = await load();

    await Promise.all([restoreSession(), restoreSession()]);
    await restoreSession();

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("stays logged out when there is no session", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(401));
    const { restoreSession, isLoggedIn, isSessionChecked } = await load();

    await restoreSession();

    expect(isLoggedIn.value).toBe(false);
    expect(isSessionChecked.value).toBe(true);
  });

  it("stays logged out when the API is unreachable", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const { restoreSession, isLoggedIn, isSessionChecked } = await load();

    await restoreSession();

    expect(isLoggedIn.value).toBe(false);
    expect(isSessionChecked.value).toBe(true);
  });
});

describe("login", () => {
  it("logs in once the session cookie is confirmed", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, {}))
      .mockResolvedValueOnce(jsonResponse(200, { email: "me@example.com" }));
    const { login, loginStatus, isLoggedIn } = await load();

    await login("me@example.com", "secret");

    expect(fetchMock).toHaveBeenNthCalledWith(1, "https://api.test/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "me@example.com", password: "secret" }),
      credentials: "include"
    });
    expect(loginStatus.value).toBe("success");
    expect(isLoggedIn.value).toBe(true);
  });

  it("explains when the browser dropped the session cookie", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, {})).mockResolvedValueOnce(jsonResponse(401));
    const { login, loginStatus, isLoggedIn } = await load();

    await login("me@example.com", "secret");

    expect(loginStatus.value).toMatch(/didn't keep the session/);
    expect(isLoggedIn.value).toBe(false);
  });

  it("shows the API's error message", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(401, { error: "Wrong password." }));
    const { login, loginStatus } = await load();

    await login("me@example.com", "nope");

    expect(loginStatus.value).toBe("Wrong password.");
  });

  it("falls back to unknown-error when the error body has no message", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(500, {}));
    const { login, loginStatus } = await load();

    await login("me@example.com", "nope");

    expect(loginStatus.value).toBe("unknown-error");
  });

  it("falls back to unknown-error when the error body is not JSON", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(502));
    const { login, loginStatus } = await load();

    await login("me@example.com", "nope");

    expect(loginStatus.value).toBe("unknown-error");
  });

  it("reports unknown-error when the API is unreachable", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const { login, loginStatus } = await load();

    await login("me@example.com", "secret");

    expect(loginStatus.value).toBe("unknown-error");
  });
});

describe("clearSession", () => {
  it("forgets the user locally without asking the API", async () => {
    const {
      clearSession,
      isLoggedIn,
      hasPassword,
      emailVerified,
      pendingEmail,
      userEmail,
      username
    } = await load();
    isLoggedIn.value = true;
    hasPassword.value = true;
    emailVerified.value = true;
    pendingEmail.value = "new@example.com";
    userEmail.value = "me@example.com";
    username.value = "me";

    clearSession();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(isLoggedIn.value).toBe(false);
    expect(hasPassword.value).toBe(false);
    expect(emailVerified.value).toBe(false);
    expect(pendingEmail.value).toBe("");
    expect(userEmail.value).toBe("");
    expect(username.value).toBe("");
  });
});

describe("logout", () => {
  it("asks the API to clear the cookie and resets the local state", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200));
    const {
      logout,
      isLoggedIn,
      isSuperuser,
      githubLinked,
      githubLogin,
      hasPassword,
      userEmail,
      username
    } = await load();
    isLoggedIn.value = true;
    isSuperuser.value = true;
    githubLinked.value = true;
    githubLogin.value = "octocat";
    hasPassword.value = true;
    userEmail.value = "me@example.com";
    username.value = "me";

    await logout();

    expect(fetchMock).toHaveBeenCalledWith("https://api.test/auth/logout", {
      method: "POST",
      credentials: "include",
      redirect: "manual"
    });
    expect(isLoggedIn.value).toBe(false);
    expect(userEmail.value).toBe("");
    expect(username.value).toBe("");
    expect(isSuperuser.value).toBe(false);
    expect(githubLinked.value).toBe(false);
    expect(githubLogin.value).toBe("");
    expect(hasPassword.value).toBe(false);
  });

  it("still logs out locally when the API is unreachable", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const { logout, isLoggedIn } = await load();
    isLoggedIn.value = true;

    await logout();

    expect(isLoggedIn.value).toBe(false);
  });
});
