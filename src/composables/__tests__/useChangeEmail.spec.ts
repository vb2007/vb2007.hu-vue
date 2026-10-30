import { beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";
import { jsonResponse, mockFetch } from "@/__tests__/helpers/fetch";
import { mountComposable } from "@/__tests__/helpers/host";
import {
  COOLDOWN_MESSAGE,
  COOLDOWN_STORAGE_KEY,
  useChangeEmail
} from "@/composables/useChangeEmail";
import { emailVerified, pendingEmail, userEmail } from "@/scripts/authentication/authState";

/** `GET /user` while a change waits for its code, shaped like the API's answer. */
const waitingUser = {
  email: "old@example.com",
  username: "vb",
  hasPassword: true,
  emailVerified: false,
  pendingEmail: "new@example.com"
};

/** Mounted, since its countdown stops with the component. */
const useEmail = () => mountComposable(useChangeEmail).api;

describe("useChangeEmail", () => {
  let fetchMock: ReturnType<typeof mockFetch>;

  beforeEach(() => {
    fetchMock = mockFetch();
    vi.spyOn(console, "error").mockImplementation(() => {});
    userEmail.value = "old@example.com";
    sessionStorage.clear();
  });

  /** The countdown kept for after a reload, if any. */
  const savedCooldown = () => JSON.parse(sessionStorage.getItem(COOLDOWN_STORAGE_KEY) ?? "null");

  describe("change", () => {
    it("asks for a code and refreshes the user, who now has the address waiting", async () => {
      fetchMock
        .mockResolvedValueOnce(
          jsonResponse(202, {
            message:
              "A confirmation code was sent to new@example.com: send it to POST /user/email/confirm to switch to that address."
          })
        )
        .mockResolvedValueOnce(jsonResponse(200, waitingUser));
      const email = useEmail();

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
      expect(userEmail.value).toBe("old@example.com");
      expect(pendingEmail.value).toBe("new@example.com");
      // The API's message names the endpoint; the waiting address says it on the page instead.
      expect(email.changeMessage.value).toBe("");
      expect(email.changeError.value).toBe("");
      expect(email.isChanging.value).toBe(false);
    });

    it("waits the API's minute before the form can ask for another code", async () => {
      vi.useFakeTimers();
      fetchMock
        .mockResolvedValueOnce(jsonResponse(202, { message: "Sent." }))
        .mockResolvedValueOnce(jsonResponse(200, waitingUser));
      const email = useEmail();

      await email.change("new@example.com", "secret-password");

      expect(email.cooldown.remaining.value).toBe(60);
      vi.advanceTimersByTime(60_000);
      expect(email.cooldown.active.value).toBe(false);
    });

    it("keeps the wait for the account across a reload", async () => {
      vi.useFakeTimers();
      fetchMock
        .mockResolvedValueOnce(jsonResponse(202, { message: "Sent." }))
        .mockResolvedValueOnce(jsonResponse(200, waitingUser));
      userEmail.value = "Old@Example.com";
      await useEmail().change("new@example.com", "secret-password");
      expect(savedCooldown()).toEqual({ id: "old@example.com", deadline: Date.now() + 60_000 });

      vi.advanceTimersByTime(20_000);
      expect(useEmail().cooldown.remaining.value).toBe(40);

      userEmail.value = "someone@example.com";
      expect(useEmail().cooldown.active.value).toBe(false);
    });

    it("keeps the waiting address itself when the refresh fails", async () => {
      fetchMock
        .mockResolvedValueOnce(jsonResponse(202, { message: "Sent." }))
        .mockResolvedValueOnce(jsonResponse(500));
      const email = useEmail();

      expect(await email.change(" New@Example.com ", "secret-password")).toBe(true);

      expect(pendingEmail.value).toBe("new@example.com");
      expect(userEmail.value).toBe("old@example.com");
    });

    it("changes nothing and says so for the current address", async () => {
      fetchMock
        .mockResolvedValueOnce(
          jsonResponse(200, { message: "E-mail address updated successfully." })
        )
        .mockResolvedValueOnce(jsonResponse(200, { email: "new@example.com", username: "vb" }));
      const email = useEmail();

      expect(await email.change("new@example.com", "secret-password")).toBe(true);

      expect(userEmail.value).toBe("new@example.com");
      expect(pendingEmail.value).toBe("");
      expect(email.changeMessage.value).toBe("E-mail address updated successfully.");
      expect(email.cooldown.active.value).toBe(false);
    });

    it("falls back to its own message when the API sends none", async () => {
      fetchMock
        .mockResolvedValueOnce(jsonResponse(200))
        .mockResolvedValueOnce(jsonResponse(200, { email: "new@example.com" }));
      const email = useEmail();

      expect(await email.change("new@example.com", "secret-password")).toBe(true);

      expect(email.changeMessage.value).toBe("E-mail address updated.");
    });

    it("stores the address itself when the refresh after a 200 fails", async () => {
      fetchMock
        .mockResolvedValueOnce(
          jsonResponse(200, { message: "E-mail address updated successfully." })
        )
        .mockResolvedValueOnce(jsonResponse(500));
      const email = useEmail();

      expect(await email.change(" New@Example.com ", "secret-password")).toBe(true);

      expect(userEmail.value).toBe("new@example.com");
    });

    it.each([
      [400, "The e-mail address is invalid: must match name@provider.com format."],
      [400, "Disposable (temporary) e-mail addresses can't be used: use a permanent one."],
      [400, "This e-mail address's domain can't receive e-mail: check it for typos."],
      [403, "The provided password is incorrect."],
      [409, "An account with this E-mail address already exists."]
    ])("shows the API's %i and keeps the address", async (status, error) => {
      fetchMock.mockResolvedValueOnce(jsonResponse(status, { error }));
      const email = useEmail();

      expect(await email.change("new@example.com", "secret-password")).toBe(false);

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(email.changeError.value).toBe(error);
      expect(email.changeMessage.value).toBe("");
      expect(userEmail.value).toBe("old@example.com");
      expect(pendingEmail.value).toBe("");
      expect(email.cooldown.active.value).toBe(false);
      expect(email.isChanging.value).toBe(false);
    });

    it("shows what the API has after a failed mail, which it stored anyway", async () => {
      const error = "The e-mail couldn't be sent: please try again later.";
      fetchMock
        .mockResolvedValueOnce(jsonResponse(503, { error }))
        .mockResolvedValueOnce(jsonResponse(200, waitingUser));
      const email = useEmail();

      expect(await email.change("new@example.com", "secret-password")).toBe(false);

      expect(fetchMock).toHaveBeenNthCalledWith(2, "https://api.test/user", {
        method: "GET",
        credentials: "include"
      });
      expect(email.changeError.value).toBe(error);
      expect(pendingEmail.value).toBe("new@example.com");
      expect(email.cooldown.active.value).toBe(false);
    });

    it("counts down the API's retryAfter after a 429, with a message that has no number", async () => {
      vi.useFakeTimers();
      fetchMock
        .mockResolvedValueOnce(
          jsonResponse(429, {
            error: "A code was sent just now: wait 42 seconds before requesting another one.",
            retryAfter: 42
          })
        )
        .mockResolvedValueOnce(jsonResponse(200, waitingUser));
      const email = useEmail();

      expect(await email.change("other@example.com", "secret-password")).toBe(false);

      // The code it waits for went out elsewhere, e.g. from another tab, so the user is refreshed.
      expect(fetchMock).toHaveBeenNthCalledWith(2, "https://api.test/user", {
        method: "GET",
        credentials: "include"
      });
      expect(pendingEmail.value).toBe("new@example.com");
      expect(email.changeError.value).toBe(COOLDOWN_MESSAGE);
      expect(email.cooldown.remaining.value).toBe(42);
      expect(savedCooldown()).toEqual({ id: "old@example.com", deadline: Date.now() + 42_000 });
      vi.advanceTimersByTime(42_000);
      await nextTick();
      expect(email.cooldown.active.value).toBe(false);
      expect(email.changeError.value).toBe("");
    });

    it("waits a minute after a rate limiter's 429, and keeps its message after", async () => {
      vi.useFakeTimers();
      fetchMock.mockResolvedValueOnce(
        jsonResponse(429, { error: "Too many failed attempts: try again later." })
      );
      const email = useEmail();

      await email.change("new@example.com", "secret-password");

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(email.changeError.value).toBe("Too many failed attempts: try again later.");
      expect(email.cooldown.remaining.value).toBe(60);
      vi.advanceTimersByTime(60_000);
      await nextTick();
      expect(email.cooldown.active.value).toBe(false);
      expect(email.changeError.value).toBe("Too many failed attempts: try again later.");
    });

    it("explains a 429 that isn't JSON", async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse(429));
      const email = useEmail();

      await email.change("new@example.com", "secret-password");

      expect(email.changeError.value).toBe("Too many requests: try again later.");
      expect(email.cooldown.remaining.value).toBe(60);
    });

    it("names the status when the error isn't JSON", async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse(500, undefined, "Internal Server Error"));
      const email = useEmail();

      expect(await email.change("new@example.com", "secret-password")).toBe(false);

      expect(email.changeError.value).toBe("Failed to change e-mail: Internal Server Error");
    });

    it("reports an unreachable server", async () => {
      fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
      const email = useEmail();

      expect(await email.change("new@example.com", "secret-password")).toBe(false);

      expect(email.changeError.value).toBe("Error connecting to server");
      expect(userEmail.value).toBe("old@example.com");
      expect(email.isChanging.value).toBe(false);
    });
  });

  describe("confirm", () => {
    beforeEach(() => {
      pendingEmail.value = "new@example.com";
    });

    /** A change that's waiting, with the minute before another code still running. */
    const useWaitingEmail = () => {
      const email = useEmail();
      email.cooldown.start(30, "old@example.com");
      return email;
    };

    const wrongCode = "The code is wrong, expired or already used: check it or request a new one.";

    it("sends the code and refreshes the user, who now has the new address", async () => {
      fetchMock
        .mockResolvedValueOnce(
          jsonResponse(200, { message: "E-mail address updated successfully." })
        )
        .mockResolvedValueOnce(
          jsonResponse(200, {
            ...waitingUser,
            email: "new@example.com",
            emailVerified: true,
            pendingEmail: null
          })
        );
      const email = useWaitingEmail();

      const confirming = email.confirm("123456");
      expect(email.isConfirming.value).toBe(true);

      expect(await confirming).toBe(true);
      expect(fetchMock).toHaveBeenNthCalledWith(1, "https://api.test/user/email/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: "123456" }),
        credentials: "include"
      });
      expect(fetchMock).toHaveBeenNthCalledWith(2, "https://api.test/user", {
        method: "GET",
        credentials: "include"
      });
      expect(userEmail.value).toBe("new@example.com");
      expect(pendingEmail.value).toBe("");
      expect(emailVerified.value).toBe(true);
      expect(email.changeMessage.value).toBe("E-mail address updated successfully.");
      expect(email.confirmError.value).toBe("");
      expect(email.isConfirming.value).toBe(false);
      // Nothing waits any more, so the API takes a new address at once, also after a reload.
      expect(email.cooldown.active.value).toBe(false);
      expect(savedCooldown()).toBeNull();
    });

    it("switches to the address itself when the refresh fails", async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse(200)).mockResolvedValueOnce(jsonResponse(500));
      const email = useEmail();

      expect(await email.confirm("123456")).toBe(true);

      expect(userEmail.value).toBe("new@example.com");
      expect(pendingEmail.value).toBe("");
      expect(emailVerified.value).toBe(true);
      expect(email.changeMessage.value).toBe("E-mail address updated.");
    });

    it("shows a wrong code's 400 as the code's error, once the change is known to wait", async () => {
      fetchMock
        .mockResolvedValueOnce(jsonResponse(400, { error: wrongCode }))
        .mockResolvedValueOnce(jsonResponse(200, waitingUser));
      const email = useWaitingEmail();

      expect(await email.confirm("000000")).toBe(false);

      expect(fetchMock).toHaveBeenNthCalledWith(2, "https://api.test/user", {
        method: "GET",
        credentials: "include"
      });
      expect(email.codeError.value).toBe(wrongCode);
      expect(email.confirmError.value).toBe("");
      expect(pendingEmail.value).toBe("new@example.com");
      expect(email.cooldown.active.value).toBe(true);
      expect(email.isConfirming.value).toBe(false);
    });

    it("keeps the change waiting after a 400 when the refresh fails", async () => {
      fetchMock
        .mockResolvedValueOnce(jsonResponse(400, { error: wrongCode }))
        .mockResolvedValueOnce(jsonResponse(500));
      const email = useEmail();

      await email.confirm("000000");

      expect(email.codeError.value).toBe(wrongCode);
      expect(pendingEmail.value).toBe("new@example.com");
    });

    it("names the address when the code had expired, and the change with it", async () => {
      fetchMock
        .mockResolvedValueOnce(jsonResponse(400, { error: wrongCode }))
        .mockResolvedValueOnce(jsonResponse(200, { ...waitingUser, pendingEmail: null }));
      const email = useEmail();

      await email.confirm("123456");

      expect(pendingEmail.value).toBe("");
      expect(email.codeError.value).toBe("");
      // Without the field, the API's "check it" no longer fits.
      expect(email.confirmError.value).toBe(
        "new@example.com wasn't confirmed: its code expired. Send a new one with Change e-mail."
      );
    });

    it("shows a rate limiter's 429 apart from the code, and keeps the change waiting", async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse(429, { error: "Too many failed attempts: try again later." })
      );
      const email = useEmail();

      expect(await email.confirm("000000")).toBe(false);

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(email.confirmError.value).toBe("Too many failed attempts: try again later.");
      expect(email.codeError.value).toBe("");
      expect(pendingEmail.value).toBe("new@example.com");
      expect(userEmail.value).toBe("old@example.com");
    });

    it.each([
      [403, "This e-mail address is reserved for the superuser."],
      [409, "An account with this E-mail address already exists."]
    ])("refreshes the user after a %i, since the API dropped the change", async (status, error) => {
      fetchMock
        .mockResolvedValueOnce(jsonResponse(status, { error }))
        .mockResolvedValueOnce(jsonResponse(200, { ...waitingUser, pendingEmail: null }));
      const email = useWaitingEmail();

      expect(await email.confirm("123456")).toBe(false);

      expect(fetchMock).toHaveBeenNthCalledWith(2, "https://api.test/user", {
        method: "GET",
        credentials: "include"
      });
      expect(email.confirmError.value).toBe(`new@example.com wasn't confirmed. ${error}`);
      expect(pendingEmail.value).toBe("");
      expect(userEmail.value).toBe("old@example.com");
      expect(email.cooldown.active.value).toBe(false);
      expect(savedCooldown()).toBeNull();
    });

    it("drops the waiting change itself when that refresh fails", async () => {
      fetchMock
        .mockResolvedValueOnce(jsonResponse(409, { error: "Taken." }))
        .mockResolvedValueOnce(jsonResponse(500));
      const email = useEmail();

      await email.confirm("123456");

      expect(pendingEmail.value).toBe("");
      expect(email.confirmError.value).toBe("new@example.com wasn't confirmed. Taken.");
      expect(userEmail.value).toBe("old@example.com");
    });

    it("still ends the countdown when the browser's storage is off", async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse(200)).mockResolvedValueOnce(jsonResponse(500));
      const email = useWaitingEmail();
      vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
        throw new DOMException("Storage is disabled", "SecurityError");
      });

      expect(await email.confirm("123456")).toBe(true);

      expect(email.cooldown.active.value).toBe(false);
    });

    it("names the status when the error isn't JSON", async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse(500, undefined, "Internal Server Error"));
      const email = useEmail();

      expect(await email.confirm("123456")).toBe(false);

      expect(email.confirmError.value).toBe("Failed to confirm e-mail: Internal Server Error");
      expect(pendingEmail.value).toBe("new@example.com");
    });

    it("reports an unreachable server", async () => {
      fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
      const email = useEmail();

      expect(await email.confirm("123456")).toBe(false);

      expect(email.confirmError.value).toBe("Error connecting to server");
      expect(pendingEmail.value).toBe("new@example.com");
      expect(email.isConfirming.value).toBe(false);
    });
  });
});
