import { describe, expect, it } from "vitest";
import { oauthErrorMessage } from "@/scripts/authentication/github";

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
