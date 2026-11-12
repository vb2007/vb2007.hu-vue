import { beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";
import { jsonResponse, mockFetch } from "@/__tests__/helpers/fetch";
import { mountComposable } from "@/__tests__/helpers/host";
import {
  COOLDOWN_STORAGE_KEY,
  RESEND_COOLDOWN_SECONDS,
  useRegisterCode
} from "@/composables/useRegisterCode";
import { Messages } from "@/constants/messages";
import { fetchUserDetails } from "@/scripts/authentication/user";

vi.mock("@/scripts/authentication/user", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/scripts/authentication/user")>()),
  fetchUserDetails: vi.fn()
}));

const invalidCode = "The code is wrong, expired or already used: check it or request a new one.";

/** The step as it is right after the API mailed `me@example.com` its code. */
const openStep = () => {
  const { api } = mountComposable(useRegisterCode);
  api.open("me@example.com", "sent", RESEND_COOLDOWN_SECONDS);
  return api;
};

describe("useRegisterCode", () => {
  let fetchMock: ReturnType<typeof mockFetch>;

  beforeEach(() => {
    fetchMock = mockFetch();
    vi.mocked(fetchUserDetails).mockReset();
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.useFakeTimers();
    sessionStorage.clear();
  });

  it("starts closed, with resending allowed", () => {
    const { api } = mountComposable(useRegisterCode);

    expect(api.email.value).toBe("");
    expect(api.resendWaiting.value).toBe(false);
  });

  it("opens for the address and holds resending back for a minute", () => {
    const step = openStep();

    expect(RESEND_COOLDOWN_SECONDS).toBe(60);
    expect(step.email.value).toBe("me@example.com");
    expect(step.notice.value).toBe("sent");
    expect(step.resendWaiting.value).toBe(true);
    expect(step.cooldown.remaining.value).toBe(60);

    vi.advanceTimersByTime(60_000);
    expect(step.resendWaiting.value).toBe(false);
  });

  it("opens for a code that already arrived without holding resending back", () => {
    const { api } = mountComposable(useRegisterCode);

    api.open("me@example.com", "earlier");

    expect(api.notice.value).toBe("earlier");
    expect(api.resendWaiting.value).toBe(false);
  });

  it("holds back only the address the countdown started for", () => {
    const step = openStep();
    step.leave();

    step.open("you@example.com", "earlier");
    expect(step.resendWaiting.value).toBe(false);

    step.open(" Me@Example.com ", "earlier");
    expect(step.resendWaiting.value).toBe(true);
  });

  it("keeps the countdown for the normalized address, so a reload can pick it up", () => {
    const { api, wrapper } = mountComposable(useRegisterCode);
    api.open(" Me@Example.com ", "sent", RESEND_COOLDOWN_SECONDS);

    expect(COOLDOWN_STORAGE_KEY).toBe("register-cooldown");
    expect(JSON.parse(sessionStorage.getItem(COOLDOWN_STORAGE_KEY)!).id).toBe("me@example.com");

    // A reload: the page and its countdown are gone, the kept deadline isn't.
    wrapper.unmount();
    vi.advanceTimersByTime(20_000);
    const { api: reloaded } = mountComposable(useRegisterCode);
    reloaded.open("me@example.com", "earlier");

    expect(reloaded.resendWaiting.value).toBe(true);
    expect(reloaded.cooldown.remaining.value).toBe(40);
  });

  it("resumes nothing for another address", () => {
    openStep();
    const { api: reloaded } = mountComposable(useRegisterCode);

    reloaded.open("you@example.com", "earlier");

    expect(reloaded.resendWaiting.value).toBe(false);
  });

  it.each([
    ["a resend, without a note", 200, {}, 60, {}],
    [
      "a rate limiter's 429, with its message",
      429,
      { error: "Too many e-mails requested: try again later.", retryAfter: 3412 },
      3412,
      { note: "Too many e-mails requested: try again later." }
    ]
  ])("keeps the countdown after %s", async (_, status, body, seconds, note) => {
    fetchMock.mockResolvedValueOnce(jsonResponse(status, body));
    const step = openStep();
    vi.advanceTimersByTime(60_000);

    await step.resend();

    const kept = JSON.parse(sessionStorage.getItem(COOLDOWN_STORAGE_KEY)!);
    expect(kept).toStrictEqual({
      id: "me@example.com",
      deadline: Date.now() + seconds * 1000,
      ...note
    });
  });

  it("explains a wait still running in the page when storage is off", async () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("Storage is off");
    });
    fetchMock.mockResolvedValueOnce(
      jsonResponse(429, { error: "Too many e-mails requested: try again later.", retryAfter: 3412 })
    );
    const step = openStep();
    vi.advanceTimersByTime(60_000);
    await step.resend();
    step.leave();

    step.open("me@example.com", "earlier");

    expect(sessionStorage.getItem(COOLDOWN_STORAGE_KEY)).toBeNull();
    expect(step.resendWaiting.value).toBe(true);
    expect(step.codeError.value).toBe("Too many e-mails requested: try again later.");
    setItem.mockRestore();
  });

  it("explains a rate limited wait it picks up after a reload, until it ends", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(429, { error: "Too many e-mails requested: try again later.", retryAfter: 3412 })
    );
    const step = openStep();
    vi.advanceTimersByTime(60_000);
    await step.resend();

    const { api: reloaded } = mountComposable(useRegisterCode);
    reloaded.open("me@example.com", "earlier");

    expect(reloaded.resendWaiting.value).toBe(true);
    expect(reloaded.codeError.value).toBe("Too many e-mails requested: try again later.");
    await nextTick();
    vi.advanceTimersByTime(3_412_000);
    await nextTick();
    expect(reloaded.codeError.value).toBe("");
  });

  it("picks up a wait after a sent code without an error", () => {
    openStep();

    const { api: reloaded } = mountComposable(useRegisterCode);
    reloaded.open("me@example.com", "earlier");

    expect(reloaded.resendWaiting.value).toBe(true);
    expect(reloaded.codeError.value).toBe("");
  });

  it("forgets an old error when opened again", () => {
    const step = openStep();
    step.codeError.value = invalidCode;

    step.open("you@example.com", "sent", RESEND_COOLDOWN_SECONDS);

    expect(step.email.value).toBe("you@example.com");
    expect(step.codeError.value).toBe("");
  });

  it("closes again, dropping its errors but not the countdown", () => {
    const step = openStep();
    step.codeError.value = "Error connecting to server";
    step.codeFieldError.value = invalidCode;

    step.leave();

    expect(step.email.value).toBe("");
    expect(step.codeError.value).toBe("");
    expect(step.codeFieldError.value).toBe("");
    expect(step.cooldown.active.value).toBe(true);
  });

  describe("verify", () => {
    it("creates the account, which the API logs in", async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse(201, { message: "User vb registered successfully." })
      );
      vi.mocked(fetchUserDetails).mockResolvedValueOnce(true);
      const step = openStep();

      const pending = step.verify(" 123 456 ", "vb", "password");
      expect(step.isVerifying.value).toBe(true);

      expect(await pending).toBe("logged-in");
      expect(fetchMock).toHaveBeenCalledWith("https://api.test/auth/register/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "me@example.com",
          code: "123456",
          username: "vb",
          password: "password"
        }),
        credentials: "include"
      });
      expect(fetchUserDetails).toHaveBeenCalled();
      expect(step.codeError.value).toBe("");
      expect(step.isVerifying.value).toBe(false);
    });

    it("tells when the account exists but the browser dropped the session", async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse(201, {}));
      vi.mocked(fetchUserDetails).mockResolvedValueOnce(false);
      const step = openStep();

      expect(await step.verify("123456", "vb", "password")).toBe("created");
    });

    it.each([
      ["nothing", ""],
      ["too few digits", "12345"],
      ["too many digits", "1234567"],
      ["letters", "12a456"]
    ])("doesn't spend a try on %s", async (_, code) => {
      const step = openStep();

      expect(await step.verify(code, "vb", "password")).toBe("failed");

      expect(fetchMock).not.toHaveBeenCalled();
      expect(step.codeFieldError.value).toBe("Enter the 6-digit code from the e-mail.");
      expect(step.codeError.value).toBe("");
    });

    it.each([
      [400, invalidCode, "codeFieldError", false],
      [429, "Too many failed attempts: try again later.", "codeError", true]
    ] as const)(
      "shows the API's message for a %i response as %s",
      async (status, error, shownAs, logged) => {
        fetchMock.mockResolvedValueOnce(jsonResponse(status, { error, retryAfter: 900 }));
        const step = openStep();
        step.codeError.value = "old";

        expect(await step.verify("123456", "vb", "password")).toBe("failed");

        expect(step[shownAs].value).toBe(error);
        expect(step[shownAs === "codeError" ? "codeFieldError" : "codeError"].value).toBe("");
        expect(fetchUserDetails).not.toHaveBeenCalled();
        // A wrong code is an answer, not a fault: only the rate limit is logged.
        if (logged) {
          expect(console.error).toHaveBeenCalledWith("Failed to confirm the code: ", status);
        } else {
          expect(console.error).not.toHaveBeenCalled();
        }
        expect(step.isVerifying.value).toBe(false);
      }
    );

    it("holds confirming for the address until the code checks' wait ends", async () => {
      const error = "Too many failed attempts: try again later.";
      fetchMock.mockResolvedValueOnce(jsonResponse(429, { error, retryAfter: 86_400 }));
      const step = openStep();
      expect(step.verifyWaiting.value).toBe(false);

      await step.verify("123456", "vb", "password");

      expect(step.verifyWaiting.value).toBe(true);
      expect(step.verifyHold.remaining.value).toBe(86_400);
      expect(step.verifyCapped.value).toBe(true);

      // The limiter counts per address, so another one can be confirmed at once.
      step.open("ME@example.com", "earlier");
      expect(step.verifyWaiting.value).toBe(true);
      step.open("you@example.com", "earlier");
      expect(step.verifyWaiting.value).toBe(false);

      step.open("me@example.com", "earlier");
      step.codeError.value = error;
      vi.advanceTimersByTime(86_400_000);
      await nextTick();
      expect(step.verifyWaiting.value).toBe(false);
      expect(step.codeError.value).toBe("");
    });

    it.each([
      [
        "a username taken meanwhile, whose code still works",
        409,
        "This username is already taken.",
        "fix-form",
        {
          field: "username",
          message:
            "That username was taken in the meantime: pick another one. Your code works for up to 15 minutes after it was sent."
        }
      ],
      [
        "an address that already has an account",
        409,
        "An account with this E-mail address already exists.",
        "account-exists",
        {
          field: "email",
          message: Messages.Auth.accountExists
        }
      ],
      [
        "a username outside the length rule",
        400,
        "The username's too long: it must be between 2 and 16 characters.",
        "fix-form",
        {
          field: "username",
          message: "The username's too long: it must be between 2 and 16 characters."
        }
      ],
      [
        "a password outside the length rule",
        400,
        "The password's too short: it must be between 8 and 128 characters.",
        "fix-form",
        {
          field: "password",
          message: "The password's too short: it must be between 8 and 128 characters."
        }
      ]
    ] as const)("sends the form back for %s", async (_, status, error, outcome, problem) => {
      fetchMock.mockResolvedValueOnce(jsonResponse(status, { error }));
      const step = openStep();

      expect(await step.verify("123456", "vb", "password")).toBe(outcome);

      expect(step.formProblem.value).toEqual(problem);
      expect(step.codeError.value).toBe("");
      expect(step.codeFieldError.value).toBe("");
      expect(step.isVerifying.value).toBe(false);
      expect(console.error).not.toHaveBeenCalled();
    });

    it("forgets the last form problem on the next try", async () => {
      fetchMock
        .mockResolvedValueOnce(jsonResponse(409, { error: "This username is already taken." }))
        .mockResolvedValueOnce(jsonResponse(400, { error: invalidCode }));
      const step = openStep();
      await step.verify("123456", "vb", "password");

      expect(await step.verify("654321", "vb2", "password")).toBe("failed");

      expect(step.formProblem.value).toBeUndefined();
      expect(step.codeFieldError.value).toBe(invalidCode);
    });

    it("keeps the API's missing-fields refusal on the step, not under a form field", async () => {
      const error =
        "You must provide an E-mail address, the confirmation code, a username and a password.";
      fetchMock.mockResolvedValueOnce(jsonResponse(400, { error }));
      const step = openStep();

      expect(await step.verify("123456", "vb", "password")).toBe("failed");

      expect(step.formProblem.value).toBeUndefined();
      expect(step.codeFieldError.value).toBe(error);
    });

    it("keeps a conflict that names no field on the step", async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse(409, { error: "Already registered." }));
      const step = openStep();

      expect(await step.verify("123456", "vb", "password")).toBe("failed");

      expect(step.codeError.value).toBe("Already registered.");
      expect(step.formProblem.value).toBeUndefined();
    });

    it("ends the step quietly when the new account was removed before its session started", async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse(403, { error: Messages.Auth.notLoggedIn }));
      const step = openStep();

      expect(await step.verify("123456", "vb", "password")).toBe("account-gone");

      // The step shows nothing itself: the code is spent, so the form tells the visitor.
      expect(step.codeError.value).toBe("");
      expect(step.codeFieldError.value).toBe("");
      expect(step.formProblem.value).toBeUndefined();
      expect(step.verifyWaiting.value).toBe(false);
      expect(step.isVerifying.value).toBe(false);
      expect(fetchUserDetails).not.toHaveBeenCalled();
      expect(console.error).not.toHaveBeenCalled();
    });

    it("keeps any other 403 on the step, unlogged like the account's removal", async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse(403, { error: "Not allowed." }));
      const step = openStep();

      expect(await step.verify("123456", "vb", "password")).toBe("failed");

      expect(step.codeError.value).toBe("Not allowed.");
      // `quietStatuses` goes by status, so it silences every 403 here, not only the removal's.
      expect(console.error).not.toHaveBeenCalled();
    });

    it("falls back to the status, and logs it, when the server fails", async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse(500, undefined, "Internal Server Error"));
      const step = openStep();

      expect(await step.verify("123456", "vb", "password")).toBe("failed");
      expect(step.codeError.value).toBe("Failed to confirm the code: Internal Server Error");
      expect(console.error).toHaveBeenCalledWith("Failed to confirm the code: ", 500);
    });

    it("reports an unreachable server", async () => {
      fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
      const step = openStep();

      expect(await step.verify("123456", "vb", "password")).toBe("failed");
      expect(step.codeError.value).toBe("Error connecting to server");
      expect(step.isVerifying.value).toBe(false);
    });
  });

  describe("resend", () => {
    it("mails a new code and holds resending back for another minute", async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse(200, {
          message:
            "If a registration is waiting for this address, a confirmation code was sent to it in the last minute or just now: use the latest one."
        })
      );
      const step = openStep();
      step.codeError.value = invalidCode;
      vi.advanceTimersByTime(60_000);

      const pending = step.resend();
      expect(step.isResending.value).toBe(true);

      expect(await pending).toBe("sent");
      expect(fetchMock).toHaveBeenCalledWith("https://api.test/auth/register/resend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "me@example.com" })
      });
      expect(step.notice.value).toBe("resent");
      expect(step.codeError.value).toBe("");
      expect(step.cooldown.remaining.value).toBe(60);
      expect(step.isResending.value).toBe(false);
    });

    it("shows a rate limiter's 429 as the API says it, and waits its retryAfter", async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse(429, {
          error: "Too many e-mails requested: try again later.",
          retryAfter: 3412
        })
      );
      const step = openStep();
      step.cooldown.stop();

      expect(await step.resend()).toBe("failed");

      // No code went out: the code from before still works, and the key waits the limit out.
      expect(step.codeError.value).toBe("Too many e-mails requested: try again later.");
      expect(step.cooldown.remaining.value).toBe(3412);
      expect(step.notice.value).toBe("sent");

      vi.advanceTimersByTime(3_412_000);
      await nextTick();
      expect(step.codeError.value).toBe("");
    });

    it("waits a minute after a 429 without a retryAfter", async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse(429, { error: "Too many e-mails requested: try again later." })
      );
      const step = openStep();
      step.cooldown.stop();

      await step.resend();

      expect(step.codeError.value).toBe("Too many e-mails requested: try again later.");
      expect(step.cooldown.remaining.value).toBe(60);
    });

    it("keeps other errors when the countdown ends", async () => {
      const step = openStep();
      fetchMock.mockResolvedValueOnce(jsonResponse(400, { error: invalidCode }));
      await step.verify("123456", "vb", "password");

      vi.advanceTimersByTime(60_000);
      await nextTick();

      expect(step.codeFieldError.value).toBe(invalidCode);
    });

    it("holds the key until the day's registration mail starts over, keeping the code from before", async () => {
      const budget =
        "No more registration e-mails can be sent today: please try again after the daily limit resets.";
      fetchMock.mockResolvedValueOnce(
        jsonResponse(503, { error: budget, reason: "mailBudget", retryAfter: 51234 })
      );
      const step = openStep();
      vi.advanceTimersByTime(60_000);

      expect(await step.resend()).toBe("failed");

      expect(step.codeError.value).toBe(budget);
      expect(step.notice.value).toBe("unsent");
      // Every resend gets the same 503 until then, so the key waits, also after a reload, and says why.
      expect(step.resendWaiting.value).toBe(true);
      expect(step.cooldown.remaining.value).toBe(51234);
      expect(step.cooldown.note.value).toBe(budget);
      const { api: reloaded } = mountComposable(useRegisterCode);
      reloaded.open("me@example.com", "earlier");
      expect(reloaded.resendWaiting.value).toBe(true);
      expect(reloaded.codeError.value).toBe(budget);
      // Like the rate limiter's 429, it's logged.
      expect(console.error).toHaveBeenCalledWith("Failed to send a new code: ", 503);

      // Its message goes with the wait.
      vi.advanceTimersByTime(51234 * 1000);
      await nextTick();
      expect(step.resendWaiting.value).toBe(false);
      expect(step.codeError.value).toBe("");
    });

    it("keeps the key usable after a 503 without the budget's reason, a failed send", async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse(503, { error: "The e-mail couldn't be sent: please try again later." })
      );
      const step = openStep();
      vi.advanceTimersByTime(60_000);

      expect(await step.resend()).toBe("failed");

      expect(step.codeError.value).toBe("The e-mail couldn't be sent: please try again later.");
      expect(step.notice.value).toBe("unsent");
      // It may work on the next try, so the key isn't held, nor after a reload.
      expect(step.resendWaiting.value).toBe(false);
      const { api: reloaded } = mountComposable(useRegisterCode);
      reloaded.open("me@example.com", "earlier");
      expect(reloaded.resendWaiting.value).toBe(false);
    });

    it.each([
      ["a 200", () => jsonResponse(200, {})],
      [
        "a rate limiter's 429",
        () =>
          jsonResponse(429, {
            error: "Too many e-mails requested: try again later.",
            retryAfter: 3412
          })
      ],
      [
        "a failed send's 503",
        () => jsonResponse(503, { error: "The e-mail couldn't be sent: please try again later." })
      ],
      [
        "the budget's 503",
        () =>
          jsonResponse(503, {
            error:
              "No more registration e-mails can be sent today: please try again after the daily limit resets.",
            reason: "mailBudget",
            retryAfter: 51234
          })
      ]
    ])("drops %s that lands after the step was left", async (_, response) => {
      let answer!: (response: Response) => void;
      fetchMock.mockReturnValueOnce(new Promise((resolve) => (answer = resolve)));
      const step = openStep();
      vi.advanceTimersByTime(30_000);
      const kept = sessionStorage.getItem(COOLDOWN_STORAGE_KEY);

      const pending = step.resend();
      step.leave();
      answer(response());

      expect(await pending).toBe("left");
      // The wait kept for the address is untouched, and nothing is shown or held for "".
      expect(sessionStorage.getItem(COOLDOWN_STORAGE_KEY)).toBe(kept);
      expect(step.cooldown.remaining.value).toBe(30);
      expect(step.notice.value).toBe("sent");
      expect(step.codeError.value).toBe("");
      expect(step.isResending.value).toBe(false);
    });

    it("says the code is from earlier once the minute of a recent one is over", async () => {
      const { api } = mountComposable(useRegisterCode);
      api.open("me@example.com", "recent", 40);

      vi.advanceTimersByTime(39_000);
      await nextTick();
      expect(api.notice.value).toBe("recent");

      vi.advanceTimersByTime(1_000);
      await nextTick();
      expect(api.notice.value).toBe("earlier");
    });

    it("starts the minute again after every resend the API takes, also for a reload", async () => {
      fetchMock
        .mockResolvedValueOnce(jsonResponse(200, {}))
        .mockResolvedValueOnce(jsonResponse(200, {}));
      const step = openStep();
      vi.advanceTimersByTime(60_000);

      for (const resendCount of [1, 2]) {
        expect(step.resendWaiting.value).toBe(false);
        expect(await step.resend()).toBe("sent");
        expect(step.cooldown.remaining.value).toBe(60);

        vi.advanceTimersByTime(10_000);
        const { api: reloaded } = mountComposable(useRegisterCode);
        reloaded.open("me@example.com", "earlier");
        expect(reloaded.resendWaiting.value).toBe(true);
        expect(reloaded.cooldown.remaining.value).toBe(50);
        vi.advanceTimersByTime(50_000);
        expect(fetchMock).toHaveBeenCalledTimes(resendCount);
      }
    });

    it.each([
      ["no body", undefined],
      ["an empty message", { error: "" }]
    ])("falls back to the status for %s", async (_, body) => {
      fetchMock.mockResolvedValueOnce(jsonResponse(502, body, "Bad Gateway"));
      const step = openStep();

      await step.resend();

      expect(step.codeError.value).toBe("Failed to send a new code: Bad Gateway");
      expect(step.notice.value).toBe("sent");
    });

    it("falls back to the status code without a status text", async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse(400));
      const step = openStep();

      await step.resend();

      expect(step.codeError.value).toBe("Failed to send a new code: 400");
    });

    it("reports an unreachable server", async () => {
      fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
      const step = openStep();

      expect(await step.resend()).toBe("failed");
      expect(step.codeError.value).toBe("Error connecting to server");
      expect(step.isResending.value).toBe(false);
    });
  });
});
