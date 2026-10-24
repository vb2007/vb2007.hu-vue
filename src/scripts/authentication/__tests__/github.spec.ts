import { beforeEach, describe, expect, it, vi } from "vitest";
import { oauthErrorMessage, unlinkGithub } from "@/scripts/authentication/github";
import { githubLinked, githubLogin } from "@/scripts/authentication/authState";
import { jsonResponse, mockFetch } from "@/__tests__/helpers/fetch";

describe("oauthErrorMessage", () => {
  it.each([
    ["accessDenied", "GitHub login was cancelled, so nothing changed."],
    ["invalidState", "The GitHub login took too long or was started elsewhere. Please try again."],
    ["githubError", "GitHub couldn't finish the login. Please try again in a moment."],
    [
      "noVerifiedEmail",
      "Your GitHub account has no verified primary e-mail address. Verify one on GitHub, then try again."
    ],
    [
      "emailExists",
      "An account already uses your GitHub e-mail address. Log in with your password, then link GitHub on your account page."
    ],
    ["githubAlreadyLinked", "That GitHub account is already linked to another account here."],
    [
      "notLoggedIn",
      "Your session ended before GitHub could be linked. Log in, then link GitHub again."
    ],
    ["notConfigured", "GitHub login isn't available right now."]
  ])("explains %s", (code, message) => {
    expect(oauthErrorMessage(code)).toBe(message);
  });

  it("falls back to a general message for a code it doesn't know", () => {
    expect(oauthErrorMessage("somethingNew")).toBe("GitHub login failed. Please try again.");
  });
});

describe("unlinkGithub", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("unlinks GitHub and forgets the linked account", async () => {
    const fetchMock = mockFetch();
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { message: "GitHub account unlinked." }));
    githubLinked.value = true;
    githubLogin.value = "octocat";

    expect(await unlinkGithub()).toBe("");
    expect(fetchMock).toHaveBeenCalledWith("https://api.test/auth/github/link", {
      method: "DELETE",
      credentials: "include"
    });
    expect(githubLinked.value).toBe(false);
    expect(githubLogin.value).toBe("");
  });

  it("returns the API's reason and keeps the link when it refuses", async () => {
    mockFetch().mockResolvedValueOnce(
      jsonResponse(403, { error: "This account has no password." })
    );
    githubLinked.value = true;

    expect(await unlinkGithub()).toBe("This account has no password.");
    expect(githubLinked.value).toBe(true);
  });

  it("says so when the API can't be reached", async () => {
    mockFetch().mockRejectedValueOnce(new TypeError("Failed to fetch"));

    expect(await unlinkGithub()).toBe("Error connecting to server");
  });
});
