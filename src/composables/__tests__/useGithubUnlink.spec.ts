import { nextTick } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { jsonResponse, mockFetch } from "@/__tests__/helpers/fetch";
import { mountComposable } from "@/__tests__/helpers/host";
import { useGithubUnlink } from "@/composables/useGithubUnlink";
import { githubLinked, githubLogin } from "@/scripts/authentication/authState";

describe("useGithubUnlink", () => {
  let fetchMock: ReturnType<typeof mockFetch>;

  beforeEach(() => {
    fetchMock = mockFetch();
    vi.spyOn(console, "error").mockImplementation(() => {});
    githubLinked.value = true;
    githubLogin.value = "octocat";
  });

  it("unlinks GitHub with the password and forgets the login", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { message: "GitHub account unlinked successfully." })
    );
    const github = mountComposable(useGithubUnlink).api;

    const pending = github.unlink("hunter22");
    expect(github.isUnlinking.value).toBe(true);

    expect(await pending).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith("https://api.test/auth/github/link", {
      method: "DELETE",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: "hunter22" })
    });
    expect(githubLinked.value).toBe(false);
    expect(githubLogin.value).toBe("");
    expect(github.unlinkError.value).toBe("");
    expect(github.isUnlinking.value).toBe(false);
  });

  it.each([
    [400, "You must provide your password to link or unlink GitHub."],
    [403, "The provided password is incorrect."],
    [403, "This account has no password."],
    [404, "No GitHub account is linked."],
    [429, "Too many failed attempts: try again later."]
  ])("shows the API's %i and keeps GitHub linked", async (status, error) => {
    fetchMock.mockResolvedValueOnce(jsonResponse(status, { error }));
    const github = mountComposable(useGithubUnlink).api;

    expect(await github.unlink("hunter22")).toBe(false);

    expect(github.unlinkError.value).toBe(error);
    expect(githubLinked.value).toBe(true);
    expect(githubLogin.value).toBe("octocat");
    expect(github.isUnlinking.value).toBe(false);
  });

  it("says to wait when a rate limiter answers without a message", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(429));
    const github = mountComposable(useGithubUnlink).api;

    expect(await github.unlink("hunter22")).toBe(false);

    expect(github.unlinkError.value).toBe("Too many requests: try again later.");
    // A 429 without a retryAfter waits a minute.
    expect(github.hold.remaining.value).toBe(60);
  });

  it("holds unlinking after the password checks' 429 until its wait ends", async () => {
    vi.useFakeTimers();
    const error = "Too many failed attempts: try again later.";
    fetchMock.mockResolvedValueOnce(jsonResponse(429, { error, retryAfter: 900 }));
    const github = mountComposable(useGithubUnlink).api;

    await github.unlink("hunter22");

    expect(github.hold.isHeld()).toBe(true);
    expect(github.hold.remaining.value).toBe(900);
    vi.advanceTimersByTime(900_000);
    await nextTick();
    expect(github.hold.isHeld()).toBe(false);
    expect(github.unlinkError.value).toBe("");
  });

  it("reports an unreachable server", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const github = mountComposable(useGithubUnlink).api;

    expect(await github.unlink("hunter22")).toBe(false);

    expect(github.unlinkError.value).toBe("Error connecting to server");
    expect(githubLinked.value).toBe(true);
    expect(github.isUnlinking.value).toBe(false);
  });
});
