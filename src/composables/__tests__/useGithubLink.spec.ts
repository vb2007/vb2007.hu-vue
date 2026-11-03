import { effectScope, type EffectScope } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { jsonResponse, mockFetch } from "@/__tests__/helpers/fetch";
import { LEAVING_GRACE_MS, useGithubLink } from "@/composables/useGithubLink";
import { githubLinked, githubLogin } from "@/scripts/authentication/authState";

const AUTHORIZE_URL = "https://github.com/login/oauth/authorize?client_id=abc&state=xyz";

describe("useGithubLink", () => {
  let fetchMock: ReturnType<typeof mockFetch>;
  const navigate = vi.fn<(url: string) => void>();
  let scopes: EffectScope[];

  /** In a scope of its own, like a component's, so its window listener goes with the test. */
  const useLink = (...args: Parameters<typeof useGithubLink>) => {
    const scope = effectScope();
    scopes.push(scope);
    return { scope, ...scope.run(() => useGithubLink(...args))! };
  };

  beforeEach(() => {
    fetchMock = mockFetch();
    navigate.mockReset();
    scopes = [];
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => scopes.forEach((scope) => scope.stop()));

  it("starts the link with the password and goes on to GitHub, staying busy", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { url: AUTHORIZE_URL }));
    const github = useLink(navigate);

    const pending = github.link("hunter22");
    expect(github.isLinking.value).toBe(true);

    expect(await pending).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith("https://api.test/auth/github/link", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: "hunter22" }),
      signal: expect.any(AbortSignal)
    });
    expect(navigate).toHaveBeenCalledWith(AUTHORIZE_URL);
    // A second start would replace this one's proof, so it can't be started again meanwhile.
    expect(github.isLinking.value).toBe(true);
    expect(github.isStalled.value).toBe(false);
    expect(github.linkError.value).toBe("");
  });

  it("sends no body for an account without a password", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { url: AUTHORIZE_URL }));
    const github = useLink(navigate);

    expect(await github.link()).toBe(true);

    expect(fetchMock).toHaveBeenCalledWith("https://api.test/auth/github/link", {
      method: "POST",
      credentials: "include",
      signal: expect.any(AbortSignal)
    });
  });

  it("ignores a second start while the first is out", async () => {
    let answer!: (response: Response) => void;
    fetchMock.mockReturnValueOnce(new Promise<Response>((resolve) => (answer = resolve)));
    const github = useLink(navigate);

    const first = github.link("hunter22");
    expect(await github.link("hunter22")).toBe(false);
    answer(jsonResponse(200, { url: AUTHORIZE_URL }));

    expect(await first).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledTimes(1);
  });

  it("says when the browser should have left, and can be given up on then", async () => {
    vi.useFakeTimers();
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, { url: AUTHORIZE_URL }))
      .mockResolvedValueOnce(jsonResponse(200, { url: AUTHORIZE_URL }));
    const github = useLink(navigate);
    await github.link("hunter22");

    await vi.advanceTimersByTimeAsync(LEAVING_GRACE_MS - 1);
    expect(github.isStalled.value).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(github.isStalled.value).toBe(true);
    expect(github.isLinking.value).toBe(true);

    github.stop();
    expect(github.isLinking.value).toBe(false);
    expect(github.isStalled.value).toBe(false);
    expect(await github.link("hunter22")).toBe(true);
    expect(navigate).toHaveBeenCalledTimes(2);
  });

  it.each([
    [400, "You must provide your password to link or unlink GitHub."],
    [403, "The provided password is incorrect."],
    [429, "Too many failed attempts: try again later."]
  ])("shows the API's %i and can be tried again", async (status, error) => {
    fetchMock.mockResolvedValueOnce(jsonResponse(status, { error }));
    const github = useLink(navigate);

    expect(await github.link("hunter22")).toBe(false);

    expect(github.linkError.value).toBe(error);
    expect(github.isLinking.value).toBe(false);
    expect(navigate).not.toHaveBeenCalled();
  });

  it("says to wait when a rate limiter answers without a message", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(429));
    const github = useLink(navigate);

    expect(await github.link("hunter22")).toBe(false);

    expect(github.linkError.value).toBe("Too many requests: try again later.");
  });

  it("explains an API without GitHub configured instead of showing its code", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(503, { error: "notConfigured" }));
    const github = useLink(navigate);

    expect(await github.link("hunter22")).toBe(false);

    expect(github.linkError.value).toBe("GitHub login isn't available right now.");
  });

  it("falls back to its own text with the status", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(500, undefined, "Internal Server Error"));
    const github = useLink(navigate);

    expect(await github.link("hunter22")).toBe(false);

    expect(github.linkError.value).toBe("Failed to start linking GitHub: Internal Server Error");
  });

  it("reports an unreachable server", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const github = useLink(navigate);

    expect(await github.link("hunter22")).toBe(false);

    expect(github.linkError.value).toBe("Error connecting to server");
    expect(github.isLinking.value).toBe(false);
  });

  it("doesn't go to GitHub once the page that asked is gone", async () => {
    fetchMock.mockImplementationOnce(
      (_url, init) =>
        new Promise<Response>((_resolve, reject) =>
          init!.signal!.addEventListener("abort", () =>
            reject(new DOMException("Aborted", "AbortError"))
          )
        )
    );
    const github = useLink(navigate);

    const pending = github.link("hunter22");
    github.scope.stop();

    expect(await pending).toBe(false);
    expect(navigate).not.toHaveBeenCalled();
    expect(github.linkError.value).toBe("");
    expect(console.error).not.toHaveBeenCalled();
  });

  it("doesn't go to GitHub when the page goes while the answer is being read", async () => {
    let readBody!: (body: unknown) => void;
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: "",
      json: () => new Promise((resolve) => (readBody = resolve))
    } as Response);
    const github = useLink(navigate);

    const pending = github.link("hunter22");
    await vi.waitFor(() => expect(readBody).toBeDefined());
    github.scope.stop();
    readBody({ url: AUTHORIZE_URL });

    expect(await pending).toBe(false);
    expect(navigate).not.toHaveBeenCalled();
  });

  it("navigates with location.assign by default, so Back returns here", async () => {
    const assign = vi.fn();
    vi.stubGlobal("location", { ...window.location, assign });
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { url: AUTHORIZE_URL }));

    await useLink().link("hunter22");

    expect(assign).toHaveBeenCalledWith(AUTHORIZE_URL);
  });

  it("starts afresh and reloads the account once the page comes back from the back/forward cache", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, { url: AUTHORIZE_URL }))
      .mockResolvedValueOnce(
        jsonResponse(200, { email: "vb@example.com", githubId: "583231", githubLogin: "octocat" })
      );
    const github = useLink(navigate);
    await github.link("hunter22");

    window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: false }));
    expect(github.isLinking.value).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true }));
    expect(github.isLinking.value).toBe(false);
    await vi.waitFor(() => expect(githubLinked.value).toBe(true));
    expect(fetchMock).toHaveBeenLastCalledWith("https://api.test/user", {
      method: "GET",
      credentials: "include"
    });
    expect(githubLogin.value).toBe("octocat");

    github.scope.stop();
    github.isLinking.value = true;
    window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true }));
    expect(github.isLinking.value).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
