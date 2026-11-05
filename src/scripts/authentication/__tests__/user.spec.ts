import { beforeEach, describe, expect, it, vi } from "vitest";
import { deferResponse, jsonResponse, mockFetch } from "@/__tests__/helpers/fetch";

// user.ts caches the session lookup at module level, so each test imports fresh copies
// of it and of the auth state it writes to.
const load = async () => {
  vi.resetModules();
  const user = await import("@/scripts/authentication/user");
  const authState = await import("@/scripts/authentication/authState");
  return { ...user, ...authState };
};

/** What the API's `isAuthenticated` answers without a session, or with one it ended. */
const notLoggedIn = () =>
  jsonResponse(403, { error: "You must be logged in to perform this action." });

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
    fetchMock.mockResolvedValueOnce(notLoggedIn());
    const { restoreSession } = await load();

    await Promise.all([restoreSession(), restoreSession()]);
    await restoreSession();

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("stays logged out when there is no session", async () => {
    fetchMock.mockResolvedValueOnce(notLoggedIn());
    const { restoreSession, isLoggedIn, isSessionChecked, sessionEnded } = await load();

    await restoreSession();

    expect(isLoggedIn.value).toBe(false);
    expect(isSessionChecked.value).toBe(true);
    // A visitor never had a session here, so none ended.
    expect(sessionEnded.value).toBe(false);
    expect(console.error).not.toHaveBeenCalled();
  });

  it("stays logged out when the API is unreachable", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const { restoreSession, isLoggedIn, isSessionChecked } = await load();

    await restoreSession();

    expect(isLoggedIn.value).toBe(false);
    expect(isSessionChecked.value).toBe(true);
  });
});

describe("fetchUserDetails", () => {
  it("forgets a session the API ended, and says it ended", async () => {
    fetchMock.mockResolvedValueOnce(notLoggedIn());
    const { fetchUserDetails, isLoggedIn, pendingEmail, userEmail, username, sessionEnded } =
      await load();
    isLoggedIn.value = true;
    userEmail.value = "me@example.com";
    username.value = "me";
    pendingEmail.value = "new@example.com";

    expect(await fetchUserDetails()).toBe(false);

    expect(isLoggedIn.value).toBe(false);
    expect(userEmail.value).toBe("");
    expect(username.value).toBe("");
    expect(pendingEmail.value).toBe("");
    expect(sessionEnded.value).toBe(true);
    expect(console.error).not.toHaveBeenCalled();
  });

  it.each([
    ["a 500", () => fetchMock.mockResolvedValueOnce(jsonResponse(500))],
    ["no connection", () => fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"))],
    // E.g. a proxy's block page in front of the API, which isn't the API's answer.
    ["a 403 without the API's error", () => fetchMock.mockResolvedValueOnce(jsonResponse(403))]
  ])("keeps the session after %s, which says nothing about it", async (_, answer) => {
    answer();
    const { fetchUserDetails, isLoggedIn, userEmail, sessionEnded } = await load();
    isLoggedIn.value = true;
    userEmail.value = "me@example.com";

    expect(await fetchUserDetails()).toBe(false);

    expect(isLoggedIn.value).toBe(true);
    expect(userEmail.value).toBe("me@example.com");
    expect(sessionEnded.value).toBe(false);
  });

  it("drops the ended session's notice once logged in again", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { email: "me@example.com" }));
    const { fetchUserDetails, sessionEnded } = await load();
    sessionEnded.value = true;

    await fetchUserDetails();

    expect(sessionEnded.value).toBe(false);
  });

  it("ignores the page load's 403 when it answers after a login", async () => {
    const pageLoad = deferResponse(fetchMock);
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, {}))
      .mockResolvedValueOnce(jsonResponse(200, { email: "me@example.com" }));
    const { restoreSession, login, loginStatus, isLoggedIn, userEmail, sessionEnded } =
      await load();

    const restoring = restoreSession();
    await login("me@example.com", "secret");
    expect(isLoggedIn.value).toBe(true);

    // The lookup from before the login answers last, for the cookie-less request it was.
    pageLoad.respond(notLoggedIn());
    await restoring;

    expect(loginStatus.value).toBe("success");
    expect(isLoggedIn.value).toBe(true);
    expect(userEmail.value).toBe("me@example.com");
    expect(sessionEnded.value).toBe(false);
  });

  it("ignores an older lookup's user when it answers after a newer 403", async () => {
    const older = deferResponse(fetchMock);
    fetchMock.mockResolvedValueOnce(notLoggedIn());
    const { fetchUserDetails, isLoggedIn, userEmail, sessionEnded } = await load();
    isLoggedIn.value = true;

    const first = fetchUserDetails();
    expect(await fetchUserDetails()).toBe(false);
    older.respond(jsonResponse(200, { email: "me@example.com" }));

    // It answers for itself, but the newer lookup's logged-out state stays.
    expect(await first).toBe(true);
    expect(isLoggedIn.value).toBe(false);
    expect(userEmail.value).toBe("");
    expect(sessionEnded.value).toBe(true);
  });

  it("still applies an older lookup's user when the newer one failed", async () => {
    const older = deferResponse(fetchMock);
    fetchMock.mockResolvedValueOnce(jsonResponse(500));
    const { fetchUserDetails, isLoggedIn, userEmail } = await load();

    const first = fetchUserDetails();
    expect(await fetchUserDetails()).toBe(false);
    older.respond(jsonResponse(200, { email: "me@example.com" }));

    expect(await first).toBe(true);
    expect(isLoggedIn.value).toBe(true);
    expect(userEmail.value).toBe("me@example.com");
  });

  it("still applies an older lookup's 403 when the newer one got no answer", async () => {
    const older = deferResponse(fetchMock);
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const { fetchUserDetails, isLoggedIn, sessionEnded } = await load();
    isLoggedIn.value = true;

    const first = fetchUserDetails();
    expect(await fetchUserDetails()).toBe(false);
    older.respond(notLoggedIn());

    expect(await first).toBe(false);
    expect(isLoggedIn.value).toBe(false);
    expect(sessionEnded.value).toBe(true);
  });

  it("ignores a lookup sent before the page forgot the user", async () => {
    const lookup = deferResponse(fetchMock);
    const { fetchUserDetails, clearSession, isLoggedIn, userEmail } = await load();

    const pending = fetchUserDetails();
    clearSession();
    lookup.respond(jsonResponse(200, { email: "me@example.com" }));

    expect(await pending).toBe(true);
    expect(isLoggedIn.value).toBe(false);
    expect(userEmail.value).toBe("");
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
    fetchMock.mockResolvedValueOnce(jsonResponse(200, {})).mockResolvedValueOnce(notLoggedIn());
    const { login, loginStatus, isLoggedIn } = await load();

    await login("me@example.com", "secret");

    expect(loginStatus.value).toMatch(/didn't keep the session/);
    expect(isLoggedIn.value).toBe(false);
  });

  it("shows the API's error message", async () => {
    // The API's one answer for an unknown address, a wrong password and a GitHub-only account.
    fetchMock.mockResolvedValueOnce(
      jsonResponse(403, {
        error:
          "Incorrect e-mail address or password. If you signed up with GitHub, log in with GitHub."
      })
    );
    const { login, loginStatus, isLoggedIn } = await load();

    // Only a 429 says how long to wait.
    await expect(login("me@example.com", "nope")).resolves.toBeUndefined();

    expect(loginStatus.value).toBe(
      "Incorrect e-mail address or password. If you signed up with GitHub, log in with GitHub."
    );
    expect(isLoggedIn.value).toBe(false);
  });

  it("clears the last status while it asks again, so the same refusal shows afresh", async () => {
    const response = deferResponse(fetchMock);
    const { login, loginStatus } = await load();
    loginStatus.value = "Wrong password.";

    const pending = login("me@example.com", "nope");

    expect(loginStatus.value).toBe("");
    response.respond(jsonResponse(403, { error: "Wrong password." }));
    await pending;
    expect(loginStatus.value).toBe("Wrong password.");
  });

  it.each([
    [900, "in 15 minutes"],
    [841, "in 15 minutes"],
    [61, "in 2 minutes"],
    [60, "in a minute"],
    [5, "in a minute"]
  ])(
    "says how long a lockout of %i seconds lasts, rounded up to minutes, and returns its wait",
    async (seconds, wait) => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse(429, {
          error: "Too many failed attempts: try again later.",
          retryAfter: seconds
        })
      );
      const { login, loginStatus } = await load();

      // The wait the form holds its key for.
      await expect(login("me@example.com", "nope")).resolves.toBe(seconds);

      expect(loginStatus.value).toBe(
        `Too many failed attempts. Try again ${wait}, or log in with GitHub below if it's linked to your account.`
      );
    }
  );

  it.each([
    ["without a retryAfter", { error: "Too many failed attempts: try again later." }],
    ["with a null retryAfter", { retryAfter: null }],
    ["with a negative retryAfter", { retryAfter: -30 }],
    ["with a zero retryAfter", { retryAfter: 0 }],
    ["with a retryAfter that isn't a number", { retryAfter: "900" }]
  ])("still explains a lockout %s, only without the wait", async (_, body) => {
    fetchMock.mockResolvedValueOnce(jsonResponse(429, body));
    const { login, loginStatus } = await load();

    // No known wait, so nothing to hold the key for.
    await expect(login("me@example.com", "nope")).resolves.toBe(0);

    expect(loginStatus.value).toBe(
      "Too many failed attempts. Try again later, or log in with GitHub below if it's linked to your account."
    );
  });

  it("explains a lockout whose 429 has no body", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(429));
    const { login, loginStatus } = await load();

    await login("me@example.com", "nope");

    expect(loginStatus.value).toMatch(/^Too many failed attempts\. Try again later,/);
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
      sessionEnded,
      userEmail,
      username
    } = await load();
    isLoggedIn.value = true;
    sessionEnded.value = true;
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
    // Logging out on purpose isn't a session that ended elsewhere.
    expect(sessionEnded.value).toBe(false);
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

  it("stays logged out when a lookup sent before it answers afterwards", async () => {
    // E.g. the account's refresh on coming back from GitHub, then Log out straight away.
    const lookup = deferResponse(fetchMock);
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { message: "Logged out." }));
    const { fetchUserDetails, logout, isLoggedIn, sessionEnded } = await load();
    isLoggedIn.value = true;

    const pending = fetchUserDetails();
    await logout();
    lookup.respond(jsonResponse(200, { email: "me@example.com" }));
    await pending;

    expect(isLoggedIn.value).toBe(false);
    expect(sessionEnded.value).toBe(false);
  });
});
