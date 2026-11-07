import { beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";
import { jsonResponse, mockFetch } from "@/__tests__/helpers/fetch";
import { mountComposable } from "@/__tests__/helpers/host";
import { COOLDOWN_STORAGE_KEY, useChangeEmail } from "@/composables/useChangeEmail";
import { Messages } from "@/constants/messages";
import {
  emailVerified,
  isLoggedIn,
  pendingEmail,
  sessionEnded,
  userEmail
} from "@/scripts/authentication/authState";

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
        .mockResolvedValueOnce(jsonResponse(200, {}))
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
      [
        403,
        "The superuser's e-mail address can't be changed here: change SUPERUSER_EMAIL in .env instead."
      ],
      [403, "The provided password is incorrect."],
      [409, "This account has no password: set one before changing the e-mail address."]
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
      expect(email.changeError.value).toBe(Messages.EmailCode.cooldown);
      expect(email.cooldown.remaining.value).toBe(42);
      expect(savedCooldown()).toEqual({
        id: "old@example.com",
        deadline: Date.now() + 42_000,
        note: Messages.EmailCode.cooldown
      });
      vi.advanceTimersByTime(42_000);
      await nextTick();
      expect(email.cooldown.active.value).toBe(false);
      expect(email.changeError.value).toBe("");
    });

    it.each([
      ["wrong passwords", "Too many failed attempts: try again later.", 900],
      ["e-mails", "Too many e-mails requested: try again later.", 3600]
    ])(
      "shows a rate limiter's 429 for too many %s, and waits its retryAfter",
      async (_, error, retryAfter) => {
        vi.useFakeTimers();
        fetchMock.mockResolvedValueOnce(jsonResponse(429, { error, retryAfter }));
        const email = useEmail();

        await email.change("new@example.com", "secret-password");

        // Not the cooldown: nothing was mailed, so the user isn't refreshed.
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(email.changeError.value).toBe(error);
        expect(email.cooldown.remaining.value).toBe(retryAfter);
        vi.advanceTimersByTime(retryAfter * 1000);
        await nextTick();
        expect(email.cooldown.active.value).toBe(false);
        expect(email.changeError.value).toBe("");
      }
    );

    it("waits a minute after a 429 without a retryAfter", async () => {
      vi.useFakeTimers();
      fetchMock.mockResolvedValueOnce(
        jsonResponse(429, { error: "Too many failed attempts: try again later." })
      );
      const email = useEmail();

      expect(await email.change("new@example.com", "secret-password")).toBe(false);

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(email.changeError.value).toBe("Too many failed attempts: try again later.");
      expect(email.cooldown.remaining.value).toBe(60);
    });

    it("explains a rate limited wait again after a reload", async () => {
      vi.useFakeTimers();
      const error = "Too many failed attempts: try again later.";
      fetchMock.mockResolvedValueOnce(jsonResponse(429, { error, retryAfter: 900 }));
      await useEmail().change("new@example.com", "wrong-password");
      expect(savedCooldown()).toEqual({
        id: "old@example.com",
        deadline: Date.now() + 900_000,
        note: error
      });

      vi.advanceTimersByTime(20_000);
      const reloaded = useEmail();
      expect(reloaded.changeError.value).toBe("");
      reloaded.showWait();

      expect(reloaded.changeError.value).toBe(error);
      expect(reloaded.cooldown.remaining.value).toBe(880);
    });

    it("has nothing to explain once the wait is over", () => {
      const email = useEmail();
      email.changeError.value = "stale";

      email.showWait();

      expect(email.changeError.value).toBe("stale");
    });

    it("keeps another error when the countdown ends", async () => {
      vi.useFakeTimers();
      fetchMock.mockResolvedValueOnce(jsonResponse(500, { error: "Something broke." }));
      const email = useEmail();
      email.cooldown.start(5, "old@example.com");

      await email.change("new@example.com", "secret-password");
      vi.advanceTimersByTime(5_000);
      await nextTick();

      expect(email.changeError.value).toBe("Something broke.");
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
      isLoggedIn.value = true;
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
      fetchMock
        .mockResolvedValueOnce(jsonResponse(200, {}))
        .mockResolvedValueOnce(jsonResponse(500));
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

    it.each([
      [400, wrongCode],
      [409, "An account with this E-mail address already exists."]
    ])(
      "counts a %i as confirmed when the refresh finds the new address, e.g. from another tab",
      async (status, error) => {
        fetchMock.mockResolvedValueOnce(jsonResponse(status, { error })).mockResolvedValueOnce(
          jsonResponse(200, {
            ...waitingUser,
            email: "new@example.com",
            emailVerified: true,
            pendingEmail: null
          })
        );
        const email = useWaitingEmail();

        expect(await email.confirm("123456")).toBe(true);

        // The same as this tab's own 200: the code step goes, and the address is the new one.
        expect(userEmail.value).toBe("new@example.com");
        expect(pendingEmail.value).toBe("");
        expect(emailVerified.value).toBe(true);
        expect(email.changeMessage.value).toBe("E-mail address updated.");
        expect(email.confirmError.value).toBe("");
        expect(email.codeError.value).toBe("");
        expect(email.isConfirming.value).toBe(false);
        expect(email.cooldown.active.value).toBe(false);
        expect(savedCooldown()).toBeNull();
      }
    );

    it("keeps a newer change waiting when the old one was confirmed elsewhere", async () => {
      fetchMock
        .mockResolvedValueOnce(jsonResponse(400, { error: wrongCode }))
        .mockResolvedValueOnce(
          jsonResponse(200, {
            ...waitingUser,
            email: "new@example.com",
            emailVerified: true,
            pendingEmail: "other@example.com"
          })
        );
      const email = useWaitingEmail();

      expect(await email.confirm("123456")).toBe(false);

      // Another tab confirmed new@example.com, then asked for other@example.com: that one waits.
      expect(pendingEmail.value).toBe("other@example.com");
      expect(email.codeError.value).toBe(wrongCode);
      expect(email.changeMessage.value).toBe("");
      expect(email.confirmError.value).toBe("");
      expect(email.cooldown.active.value).toBe(true);
    });

    it("shows a rate limiter's 429 apart from the code, and keeps the change waiting", async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse(429, { error: "Too many failed attempts: try again later.", retryAfter: 900 })
      );
      const email = useEmail();

      expect(await email.confirm("000000")).toBe(false);

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(email.confirmError.value).toBe("Too many failed attempts: try again later.");
      expect(email.codeError.value).toBe("");
      expect(pendingEmail.value).toBe("new@example.com");
      expect(userEmail.value).toBe("old@example.com");
      // The hold waits the limiter's retryAfter out.
      expect(email.confirmHold.remaining.value).toBe(900);
    });

    it("holds confirming for the daily cap's wait, but not changing the address", async () => {
      vi.useFakeTimers();
      const error = "Too many failed attempts: try again later.";
      fetchMock.mockResolvedValueOnce(jsonResponse(429, { error, retryAfter: 86_400 }));
      const email = useEmail();

      await email.confirm("123456");

      expect(email.confirmHold.isHeld()).toBe(true);
      expect(email.confirmHold.remaining.value).toBe(86_400);
      expect(email.cooldown.active.value).toBe(false);

      vi.advanceTimersByTime(86_400_000);
      await nextTick();
      expect(email.confirmHold.isHeld()).toBe(false);
      expect(email.confirmError.value).toBe("");
    });

    // PATCH /user/email mails a code to these as to any address; only the confirm refuses them
    // (vb2007/vb2007.hu-api#291).
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
      // The 403 is an answer the page shows, not a fault to log; the 409 still is one.
      expect(console.error).toHaveBeenCalledTimes(status === 403 ? 0 : 1);
    });

    it("keeps the code step after a 409 that left the change waiting", async () => {
      // Another account took the address between the API's check and its switch.
      const error = "An account with this E-mail address already exists.";
      fetchMock
        .mockResolvedValueOnce(jsonResponse(409, { error }))
        .mockResolvedValueOnce(jsonResponse(200, waitingUser));
      const email = useWaitingEmail();

      expect(await email.confirm("123456")).toBe(false);

      expect(email.confirmError.value).toBe(error);
      expect(email.codeError.value).toBe("");
      expect(pendingEmail.value).toBe("new@example.com");
      expect(email.cooldown.active.value).toBe(true);
    });

    it.each([
      [403, "You must be logged in to perform this action."],
      [400, wrongCode]
    ])(
      "says nothing of the change after a %i when the session has ended",
      async (status, error) => {
        const notLoggedIn = { error: "You must be logged in to perform this action." };
        fetchMock
          .mockResolvedValueOnce(jsonResponse(status, { error }))
          .mockResolvedValueOnce(jsonResponse(403, notLoggedIn));
        const email = useWaitingEmail();

        expect(await email.confirm("123456")).toBe(false);

        // One check logged the page out (the client's after a 403, the refresh after a 400); the
        // account page says why, not that the change failed.
        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(isLoggedIn.value).toBe(false);
        expect(sessionEnded.value).toBe(true);
        expect(email.confirmError.value).toBe("");
        expect(email.codeError.value).toBe("");
        expect(email.isConfirming.value).toBe(false);
      }
    );

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
      fetchMock
        .mockResolvedValueOnce(jsonResponse(200, {}))
        .mockResolvedValueOnce(jsonResponse(500));
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
