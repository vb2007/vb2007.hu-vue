import { beforeEach, describe, expect, it, vi } from "vitest";
import { jsonResponse, mockFetch } from "@/__tests__/helpers/fetch";
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

  it("unlinks GitHub and forgets the login", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { message: "GitHub account unlinked successfully." })
    );
    const github = useGithubUnlink();

    const pending = github.unlink();
    expect(github.isUnlinking.value).toBe(true);

    expect(await pending).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith("https://api.test/auth/github/link", {
      method: "DELETE",
      credentials: "include"
    });
    expect(githubLinked.value).toBe(false);
    expect(githubLogin.value).toBe("");
    expect(github.unlinkError.value).toBe("");
    expect(github.isUnlinking.value).toBe(false);
  });

  it("shows the API's refusal and keeps GitHub linked", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(403, { error: "This account has no password." }));
    const github = useGithubUnlink();

    expect(await github.unlink()).toBe(false);

    expect(github.unlinkError.value).toBe("This account has no password.");
    expect(githubLinked.value).toBe(true);
    expect(githubLogin.value).toBe("octocat");
    expect(github.isUnlinking.value).toBe(false);
  });

  it("reports an unreachable server", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const github = useGithubUnlink();

    expect(await github.unlink()).toBe(false);

    expect(github.unlinkError.value).toBe("Error connecting to server");
    expect(githubLinked.value).toBe(true);
    expect(github.isUnlinking.value).toBe(false);
  });
});
