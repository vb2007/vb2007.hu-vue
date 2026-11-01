import { beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";
import { jsonResponse, mockFetch } from "@/__tests__/helpers/fetch";
import { mountComposable } from "@/__tests__/helpers/host";
import {
  COOLDOWN_STORAGE_KEY,
  RESEND_COOLDOWN_SECONDS,
  useRegisterCode
} from "@/composables/useRegisterCode";
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
    ["a resend", 200, {}, 60],
    ["a refused resend", 429, { error: "Wait.", retryAfter: 42 }, 42]
  ])("keeps the countdown after %s", async (_, status, body, seconds) => {
    fetchMock.mockResolvedValueOnce(jsonResponse(status, body));
    const step = openStep();
    vi.advanceTimersByTime(60_000);

    await step.resend();

    const kept = JSON.parse(sessionStorage.getItem(COOLDOWN_STORAGE_KEY)!);
    expect(kept).toEqual({ id: "me@example.com", deadline: Date.now() + seconds * 1000 });
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

      const pending = step.verify(" 123 456 ");
      expect(step.isVerifying.value).toBe(true);

      expect(await pending).toBe("logged-in");
      expect(fetchMock).toHaveBeenCalledWith("https://api.test/auth/register/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "me@example.com", code: "123456" }),
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

      expect(await step.verify("123456")).toBe("created");
    });

    it.each([
      ["nothing", ""],
      ["too few digits", "12345"],
      ["too many digits", "1234567"],
      ["letters", "12a456"]
    ])("doesn't spend a try on %s", async (_, code) => {
      const step = openStep();

      expect(await step.verify(code)).toBe("failed");

      expect(fetchMock).not.toHaveBeenCalled();
      expect(step.codeFieldError.value).toBe("Enter the 6-digit code from the e-mail.");
      expect(step.codeError.value).toBe("");
    });

    it.each([
      [400, invalidCode, "codeFieldError"],
      [429, "Too many failed attempts: try again later.", "codeError"]
    ] as const)(
      "shows the API's message for a %i response as %s, without logging it",
      async (status, error, shownAs) => {
        fetchMock.mockResolvedValueOnce(jsonResponse(status, { error }));
        const step = openStep();
        step.codeError.value = "old";

        expect(await step.verify("123456")).toBe("failed");

        expect(step[shownAs].value).toBe(error);
        expect(step[shownAs === "codeError" ? "codeFieldError" : "codeError"].value).toBe("");
        expect(fetchUserDetails).not.toHaveBeenCalled();
        expect(console.error).not.toHaveBeenCalled();
        expect(step.isVerifying.value).toBe(false);
      }
    );

    it("reports a name taken meanwhile, which ends the waiting registration", async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse(409, { error: "This username is already taken." })
      );
      const step = openStep();

      expect(await step.verify("123456")).toBe("taken");
      expect(step.codeError.value).toBe("This username is already taken.");
    });

    it("falls back to the status, and logs it, when the server fails", async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse(500, undefined, "Internal Server Error"));
      const step = openStep();

      expect(await step.verify("123456")).toBe("failed");
      expect(step.codeError.value).toBe("Failed to confirm the code: Internal Server Error");
      expect(console.error).toHaveBeenCalledWith("Failed to confirm the registration code: ", 500);
    });

    it("reports an unreachable server", async () => {
      fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
      const step = openStep();

      expect(await step.verify("123456")).toBe("failed");
      expect(step.codeError.value).toBe("Error connecting to server");
      expect(step.isVerifying.value).toBe(false);
    });
  });

  describe("resend", () => {
    it("mails a new code and holds resending back for another minute", async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse(200, {
          message:
            "If a registration is waiting for this address, a new confirmation code was sent to it."
        })
      );
      const step = openStep();
      step.codeError.value = invalidCode;
      vi.advanceTimersByTime(60_000);

      const pending = step.resend();
      expect(step.isResending.value).toBe(true);

      expect(await pending).toBe(true);
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

    it("waits as long as the cooldown's 429 says, without a frozen number", async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse(429, {
          error: "A code was sent just now: wait 42 seconds before requesting another one.",
          retryAfter: 42
        })
      );
      const step = openStep();
      step.cooldown.stop();

      expect(await step.resend()).toBe(false);

      expect(step.codeError.value).toBe(
        "A code was sent just now. You can send another once the countdown ends."
      );
      expect(step.cooldown.remaining.value).toBe(42);
      expect(step.notice.value).toBe("sent");
      expect(console.error).not.toHaveBeenCalled();

      vi.advanceTimersByTime(42_000);
      await nextTick();
      expect(step.codeError.value).toBe("");
    });

    it("waits a minute after a rate limiter's 429, which has no retryAfter", async () => {
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
      await step.verify("123456");

      vi.advanceTimersByTime(60_000);
      await nextTick();

      expect(step.codeFieldError.value).toBe(invalidCode);
    });

    it("says the old code is gone too when the new one couldn't be mailed", async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse(503, { error: "The e-mail couldn't be sent: please try again later." })
      );
      const step = openStep();
      step.cooldown.stop();

      expect(await step.resend()).toBe(false);

      expect(step.codeError.value).toBe("The e-mail couldn't be sent: please try again later.");
      expect(step.notice.value).toBe("lost");
      expect(step.resendWaiting.value).toBe(false);
      expect(console.error).toHaveBeenCalledWith("Failed to resend the registration code: ", 503);
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

    it("falls back to the status code without a status text, and doesn't log a 4xx", async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse(400));
      const step = openStep();

      await step.resend();

      expect(step.codeError.value).toBe("Failed to send a new code: 400");
      expect(console.error).not.toHaveBeenCalled();
    });

    it("reports an unreachable server", async () => {
      fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
      const step = openStep();

      expect(await step.resend()).toBe(false);
      expect(step.codeError.value).toBe("Error connecting to server");
      expect(step.isResending.value).toBe(false);
    });
  });
});
