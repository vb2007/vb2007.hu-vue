import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAdminSuspension } from "@/composables/useAdminSuspension";
import { Messages } from "@/constants/messages";
import { anAdminUser } from "@/__tests__/helpers/admin";
import { jsonResponse, mockFetch } from "@/__tests__/helpers/fetch";

describe("useAdminSuspension", () => {
  let fetchMock: ReturnType<typeof mockFetch>;

  beforeEach(() => {
    fetchMock = mockFetch();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("suspends the account and keeps the API's word on it", async () => {
    const suspended = anAdminUser("a b", { suspendedAt: "2026-11-06T10:00:00.000Z" });
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        message: "User suspended successfully: their session was ended.",
        user: suspended
      })
    );
    const { isSaving, error, saved, setSuspension } = useAdminSuspension();

    const saving = setSuspension("a b", true);
    expect(isSaving.value).toBe(true);

    expect(await saving).toEqual(suspended);
    expect(fetchMock).toHaveBeenCalledWith("https://api.test/admin/users/a%20b/suspension", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ suspended: true }),
      credentials: "include"
    });
    expect(saved.value).toBe("User suspended successfully: their session was ended.");
    expect(error.value).toBe("");
    expect(isSaving.value).toBe(false);
  });

  it("shows the API's refusal, and forgets the last change's word", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { message: "User unsuspended successfully.", user: anAdminUser("a") })
    );
    const { error, saved, setSuspension } = useAdminSuspension();
    await setSuspension("a", false);
    expect(saved.value).toBe("User unsuspended successfully.");

    fetchMock.mockResolvedValueOnce(
      jsonResponse(409, { error: "The superuser's account can't be suspended." })
    );
    expect(await setSuspension("a", true)).toBeNull();

    expect(error.value).toBe("The superuser's account can't be suspended.");
    expect(saved.value).toBe("");
  });

  it.each([
    [true, Messages.Admin.suspendFailed],
    [false, Messages.Admin.unsuspendFailed]
  ])("words a failure without the API's message (suspended: %s)", async (suspended, failure) => {
    fetchMock.mockResolvedValueOnce(jsonResponse(502, undefined, "Bad Gateway"));
    const { error, setSuspension } = useAdminSuspension();

    await setSuspension("a", suspended);

    expect(error.value).toBe(`${failure}: Bad Gateway`);
  });
});
