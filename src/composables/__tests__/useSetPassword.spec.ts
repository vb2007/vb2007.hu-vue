import { beforeEach, describe, expect, it, vi } from "vitest";
import { jsonResponse, mockFetch } from "@/__tests__/helpers/fetch";
import { useSetPassword } from "@/composables/useSetPassword";
import { hasPassword } from "@/scripts/authentication/authState";

const REAUTH =
  "Confirm it's you first: log in with GitHub again (or relink it), then set the password within 10 minutes.";

describe("useSetPassword", () => {
  let fetchMock: ReturnType<typeof mockFetch>;

  beforeEach(() => {
    fetchMock = mockFetch();
    vi.spyOn(console, "error").mockImplementation(() => {});
    hasPassword.value = false;
  });

  it("sets the password and looks the user up again", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, { message: "Password set successfully." }))
      .mockResolvedValueOnce(
        jsonResponse(200, { email: "me@example.com", githubId: "583231", hasPassword: true })
      );
    const password = useSetPassword();

    const pending = password.setPassword("correct horse");
    expect(password.isSetting.value).toBe(true);

    expect(await pending).toBe(true);
    expect(fetchMock).toHaveBeenNthCalledWith(1, "https://api.test/user/password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: "correct horse" }),
      credentials: "include"
    });
    expect(fetchMock).toHaveBeenNthCalledWith(2, "https://api.test/user", {
      method: "GET",
      credentials: "include"
    });
    expect(hasPassword.value).toBe(true);
    expect(password.setError.value).toBe("");
    expect(password.isSetting.value).toBe(false);
  });

  it("counts the password as set even if the lookup afterwards fails", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, { message: "Password set successfully." }))
      .mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const password = useSetPassword();

    expect(await password.setPassword("correct horse")).toBe(true);

    expect(hasPassword.value).toBe(true);
  });

  it("asks for a GitHub confirmation when the API wants one", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(403, { error: REAUTH }));
    const password = useSetPassword();

    expect(await password.setPassword("correct horse")).toBe(false);

    expect(password.setError.value).toBe(REAUTH);
    expect(password.needsGithub.value).toBe(true);
    expect(hasPassword.value).toBe(false);
  });

  it.each([
    [400, "The password's too short: it must be between 8 and 128 characters."],
    [403, "You must be logged in to perform this action."],
    [409, "This account already has a password."],
    [429, "Too many failed attempts: try again later."]
  ])("shows the API's %i error without asking for GitHub", async (status, error) => {
    fetchMock.mockResolvedValueOnce(jsonResponse(status, { error }));
    const password = useSetPassword();

    expect(await password.setPassword("short")).toBe(false);

    expect(password.setError.value).toBe(error);
    expect(password.needsGithub.value).toBe(false);
    expect(password.isSetting.value).toBe(false);
  });

  it("forgets the GitHub confirmation request on the next try", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(403, { error: REAUTH }))
      .mockResolvedValueOnce(jsonResponse(500, undefined, "Internal Server Error"));
    const password = useSetPassword();
    await password.setPassword("correct horse");

    expect(await password.setPassword("correct horse")).toBe(false);

    expect(password.needsGithub.value).toBe(false);
    expect(password.setError.value).toBe("Failed to set the password: Internal Server Error");
  });

  it("reports an unreachable server", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const password = useSetPassword();

    expect(await password.setPassword("correct horse")).toBe(false);

    expect(password.setError.value).toBe("Error connecting to server");
    expect(password.isSetting.value).toBe(false);
  });
});
