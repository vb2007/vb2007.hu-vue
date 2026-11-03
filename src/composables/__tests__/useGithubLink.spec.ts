import { effectScope } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { jsonResponse, mockFetch } from "@/__tests__/helpers/fetch";
import { useGithubLink } from "@/composables/useGithubLink";

const AUTHORIZE_URL = "https://github.com/login/oauth/authorize?client_id=abc&state=xyz";

describe("useGithubLink", () => {
  let fetchMock: ReturnType<typeof mockFetch>;
  const navigate = vi.fn<(url: string) => void>();

  beforeEach(() => {
    fetchMock = mockFetch();
    navigate.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("starts the link with the password and goes on to GitHub, staying busy", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { url: AUTHORIZE_URL }));
    const github = useGithubLink(navigate);

    const pending = github.link("hunter22");
    expect(github.isLinking.value).toBe(true);

    expect(await pending).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith("https://api.test/auth/github/link", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: "hunter22" })
    });
    expect(navigate).toHaveBeenCalledWith(AUTHORIZE_URL);
    // A second start would replace this one's proof, so it can't be started again meanwhile.
    expect(github.isLinking.value).toBe(true);
    expect(github.linkError.value).toBe("");
  });

  it("sends no body for an account without a password", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { url: AUTHORIZE_URL }));
    const github = useGithubLink(navigate);

    expect(await github.link()).toBe(true);

    expect(fetchMock).toHaveBeenCalledWith("https://api.test/auth/github/link", {
      method: "POST",
      credentials: "include"
    });
  });

  it("ignores a second start while the first is out", async () => {
    let answer!: (response: Response) => void;
    fetchMock.mockReturnValueOnce(new Promise<Response>((resolve) => (answer = resolve)));
    const github = useGithubLink(navigate);

    const first = github.link("hunter22");
    expect(await github.link("hunter22")).toBe(false);
    answer(jsonResponse(200, { url: AUTHORIZE_URL }));

    expect(await first).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledTimes(1);
  });

  it.each([
    [400, "You must provide your password to link or unlink GitHub."],
    [403, "The provided password is incorrect."],
    [429, "Too many failed attempts: try again later."]
  ])("shows the API's %i and can be tried again", async (status, error) => {
    fetchMock.mockResolvedValueOnce(jsonResponse(status, { error }));
    const github = useGithubLink(navigate);

    expect(await github.link("hunter22")).toBe(false);

    expect(github.linkError.value).toBe(error);
    expect(github.isLinking.value).toBe(false);
    expect(navigate).not.toHaveBeenCalled();
  });

  it("says to wait when a rate limiter answers without a message", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(429));
    const github = useGithubLink(navigate);

    expect(await github.link("hunter22")).toBe(false);

    expect(github.linkError.value).toBe("Too many requests: try again later.");
  });

  it("explains an API without GitHub configured instead of showing its code", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(503, { error: "notConfigured" }));
    const github = useGithubLink(navigate);

    expect(await github.link("hunter22")).toBe(false);

    expect(github.linkError.value).toBe("GitHub login isn't available right now.");
  });

  it("falls back to its own text with the status", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(500, undefined, "Internal Server Error"));
    const github = useGithubLink(navigate);

    expect(await github.link("hunter22")).toBe(false);

    expect(github.linkError.value).toBe("Failed to start linking GitHub: Internal Server Error");
  });

  it("reports an unreachable server", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const github = useGithubLink(navigate);

    expect(await github.link("hunter22")).toBe(false);

    expect(github.linkError.value).toBe("Error connecting to server");
    expect(github.isLinking.value).toBe(false);
  });

  it("navigates with location.assign by default, so Back returns here", async () => {
    const assign = vi.fn();
    vi.stubGlobal("location", { ...window.location, assign });
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { url: AUTHORIZE_URL }));

    await useGithubLink().link("hunter22");

    expect(assign).toHaveBeenCalledWith(AUTHORIZE_URL);
  });

  it("can be started again once the page comes back from the back/forward cache", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { url: AUTHORIZE_URL }));
    const scope = effectScope();
    const github = scope.run(() => useGithubLink(navigate))!;
    await github.link("hunter22");

    window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: false }));
    expect(github.isLinking.value).toBe(true);
    window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true }));
    expect(github.isLinking.value).toBe(false);

    scope.stop();
    github.isLinking.value = true;
    window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true }));
    expect(github.isLinking.value).toBe(true);
  });
});
