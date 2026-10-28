import { beforeEach, describe, expect, it, vi } from "vitest";
import { jsonResponse, mockFetch } from "@/__tests__/helpers/fetch";
import { useChangeEmail } from "@/composables/useChangeEmail";
import { userEmail } from "@/scripts/authentication/authState";

describe("useChangeEmail", () => {
  let fetchMock: ReturnType<typeof mockFetch>;

  beforeEach(() => {
    fetchMock = mockFetch();
    vi.spyOn(console, "error").mockImplementation(() => {});
    userEmail.value = "old@example.com";
  });

  it("changes the address and refreshes the user", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, { message: "E-mail address updated successfully." }))
      .mockResolvedValueOnce(jsonResponse(200, { email: "new@example.com", username: "vb" }));
    const email = useChangeEmail();

    const pending = email.change("New@Example.com", "secret-password");
    expect(email.isChanging.value).toBe(true);

    expect(await pending).toBe(true);
    expect(fetchMock).toHaveBeenNthCalledWith(1, "https://api.test/user/email", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "New@Example.com", password: "secret-password" }),
      credentials: "include"
    });
    expect(fetchMock).toHaveBeenNthCalledWith(2, "https://api.test/user", {
      method: "GET",
      credentials: "include"
    });
    expect(userEmail.value).toBe("new@example.com");
    expect(email.changeMessage.value).toBe("E-mail address updated successfully.");
    expect(email.changeError.value).toBe("");
    expect(email.isChanging.value).toBe(false);
  });

  it("falls back to its own message when the API sends none", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200))
      .mockResolvedValueOnce(jsonResponse(200, { email: "new@example.com" }));
    const email = useChangeEmail();

    expect(await email.change("new@example.com", "secret-password")).toBe(true);

    expect(email.changeMessage.value).toBe("E-mail address updated.");
  });

  it.each([
    [400, "The e-mail address is invalid: must match name@provider.com format."],
    [403, "The provided password is incorrect."],
    [409, "An account with this E-mail address already exists."]
  ])("shows the API's %i and keeps the address", async (status, error) => {
    fetchMock.mockResolvedValueOnce(jsonResponse(status, { error }));
    const email = useChangeEmail();

    expect(await email.change("new@example.com", "secret-password")).toBe(false);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(email.changeError.value).toBe(error);
    expect(email.changeMessage.value).toBe("");
    expect(userEmail.value).toBe("old@example.com");
    expect(email.isChanging.value).toBe(false);
  });

  it("names the status when the error isn't JSON", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(500, undefined, "Internal Server Error"));
    const email = useChangeEmail();

    expect(await email.change("new@example.com", "secret-password")).toBe(false);

    expect(email.changeError.value).toBe("Failed to change e-mail: Internal Server Error");
  });

  it("reports an unreachable server", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const email = useChangeEmail();

    expect(await email.change("new@example.com", "secret-password")).toBe(false);

    expect(email.changeError.value).toBe("Error connecting to server");
    expect(userEmail.value).toBe("old@example.com");
    expect(email.isChanging.value).toBe(false);
  });
});
