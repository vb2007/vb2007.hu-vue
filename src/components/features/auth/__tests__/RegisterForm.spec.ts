import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises } from "@vue/test-utils";
import RegisterForm from "@/components/features/auth/RegisterForm.vue";
import { isLoggedIn } from "@/scripts/authentication/authState";
import { register, registerStatus, type RegisterAnswer } from "@/scripts/authentication/register";
import { fetchUserDetails, restoreSession } from "@/scripts/authentication/user";
import { jsonResponse, mockFetch } from "@/__tests__/helpers/fetch";
import { mountWithRouter } from "@/__tests__/helpers/mount";

vi.mock("@/scripts/authentication/register", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/scripts/authentication/register")>()),
  register: vi.fn()
}));
vi.mock("@/scripts/authentication/user", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/scripts/authentication/user")>()),
  restoreSession: vi.fn(() => Promise.resolve()),
  fetchUserDetails: vi.fn()
}));

const mountForm = async () => {
  // Attached, so the tests can see where focus goes.
  const mounted = await mountWithRouter(RegisterForm, { attachTo: document.body });
  await flushPromises();
  return mounted.wrapper;
};

type Wrapper = Awaited<ReturnType<typeof mountForm>>;

const fill = async (
  wrapper: Wrapper,
  {
    email = "me@example.com",
    username = "vb",
    password = "password",
    confirm = password
  }: { email?: string; username?: string; password?: string; confirm?: string } = {}
) => {
  const [emailInput, usernameInput, passwordInput, confirmInput] = wrapper.findAll("input");
  await emailInput.setValue(email);
  await usernameInput.setValue(username);
  await passwordInput.setValue(password);
  await confirmInput.setValue(confirm);
};

const submitButton = (wrapper: Wrapper) => wrapper.find('button[type="submit"]');

const resendButton = (wrapper: Wrapper) => wrapper.find(".code-actions button");

const enterCodeButton = (wrapper: Wrapper) => wrapper.find(".alt button");

const FIELDS = {
  email: 'input[type="email"]',
  username: 'input[autocomplete="username"]',
  password: 'input[autocomplete="new-password"]'
};

/** A field's own error, shown under it. */
const errorUnder = (wrapper: Wrapper, selector: string) =>
  wrapper.find(selector).element.closest(".field")!.querySelector(".field__error")?.textContent;

describe("RegisterForm", () => {
  beforeEach(() => {
    vi.mocked(register).mockReset();
  });

  afterEach(() => {
    registerStatus.value = "";
    document.body.innerHTML = "";
  });

  it("offers registering with GitHub under the form", async () => {
    const wrapper = await mountForm();

    expect(wrapper.find('a[href="https://api.test/auth/github"]').text()).toBe(
      "Register with GitHub"
    );
  });

  it("clears an old status and checks the session on mount", async () => {
    registerStatus.value = "invalid-email";

    const wrapper = await mountForm();

    expect(restoreSession).toHaveBeenCalled();
    expect(registerStatus.value).toBe("");
    expect(wrapper.find("form").exists()).toBe(true);
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
  });

  it("shows the success view when already logged in", async () => {
    isLoggedIn.value = true;

    const wrapper = await mountForm();

    expect(registerStatus.value).toBe("success");
    expect(wrapper.text()).toContain("Registration successful!");
    expect(wrapper.find('a[href="/shorten"]').exists()).toBe(true);
  });

  it.each([
    [{ email: "nope" }, "Please enter a valid email address.", 0],
    [
      { email: `${"a".repeat(243)}@example.com` },
      "Your email address can't be longer than 254 characters.",
      0
    ],
    [{ username: " v " }, "The username's too short: it must be between 2 and 16 characters.", 1],
    [
      { password: "1234567" },
      "The password's too short: it must be between 8 and 128 characters.",
      2
    ],
    [{ confirm: "different" }, "The two passwords don't match.", 3]
  ])(
    "rejects invalid input %o under its field before calling the API",
    async (input, message, index) => {
      vi.useFakeTimers({ toFake: ["setTimeout"] });
      const wrapper = await mountForm();
      await fill(wrapper, input);

      await wrapper.find("form").trigger("submit");
      await flushPromises();

      expect(register).not.toHaveBeenCalled();
      const field = wrapper.findAll("input")[index];
      expect(field.attributes("aria-invalid")).toBe("true");
      expect(field.element.closest(".field")!.querySelector(".field__error")!.textContent).toBe(
        message
      );
      expect(wrapper.find('[role="alert"]').exists()).toBe(false);
      expect(document.activeElement).toBe(field.element);
      expect(submitButton(wrapper).classes()).toContain("btn--error");

      vi.advanceTimersByTime(1000);
      await flushPromises();
      expect(submitButton(wrapper).classes()).not.toContain("btn--error");
    }
  );

  it("asks for the code on the same board once the API mailed it", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "setInterval", "Date"] });
    let finish!: (answer: RegisterAnswer) => void;
    vi.mocked(register).mockReturnValueOnce(new Promise((resolve) => (finish = resolve)));
    const wrapper = await mountForm();
    await fill(wrapper);

    await wrapper.find("form").trigger("submit");

    expect(register).toHaveBeenCalledWith("vb", "me@example.com", "password");
    expect(submitButton(wrapper).text()).toBe("Registering");

    finish({ sent: true });
    await flushPromises();

    expect(wrapper.find("h1").text()).toBe("Register");
    const notice = wrapper.find('[role="status"]');
    expect(notice.text()).toBe(
      "A 6-digit code is on its way to me@example.com. Enter it to finish registering; it works for 15 minutes."
    );
    const codeInput = wrapper.find("input");
    expect(codeInput.attributes()).toMatchObject({
      inputmode: "numeric",
      autocomplete: "one-time-code"
    });
    // The notice is already filled in when it appears, so the field points screen readers at it.
    expect(codeInput.attributes("aria-describedby")).toContain(notice.attributes("id"));
    expect(document.activeElement).toBe(codeInput.element);
    expect(submitButton(wrapper).text()).toBe("Confirm code");
    expect(resendButton(wrapper).text()).toBe("Resend in 60 s");
    expect(resendButton(wrapper).attributes("disabled")).toBeDefined();
    expect(wrapper.text()).not.toContain("Register with GitHub");

    vi.advanceTimersByTime(59_000);
    await flushPromises();
    expect(resendButton(wrapper).text()).toBe("Resend in 1 s");

    vi.advanceTimersByTime(1000);
    await flushPromises();
    expect(resendButton(wrapper).text()).toBe("Resend code");
    expect(resendButton(wrapper).attributes("disabled")).toBeUndefined();
  });

  it.each([
    [
      "email",
      "Disposable (temporary) e-mail addresses can't be used: use a permanent one.",
      FIELDS.email
    ],
    ["email", "An account with this E-mail address already exists.", FIELDS.email],
    ["username", "This username is already taken.", FIELDS.username]
  ] as const)(
    "shows the API's refusal under the %s field and focuses it",
    async (field, error, selector) => {
      vi.mocked(register).mockImplementationOnce(async () => {
        registerStatus.value = error;
        return { sent: false, field };
      });
      const wrapper = await mountForm();
      await fill(wrapper);

      await wrapper.find("form").trigger("submit");
      await flushPromises();

      expect(errorUnder(wrapper, selector)).toBe(error);
      expect(wrapper.find('[role="alert"]').exists()).toBe(false);
      expect(document.activeElement).toBe(wrapper.find(selector).element);
      expect(submitButton(wrapper).classes()).toContain("btn--error");
      expect(submitButton(wrapper).text()).toBe("Register");

      // Editing that field drops its error.
      await wrapper.find(selector).setValue("changed@example.com");
      expect(errorUnder(wrapper, selector)).toBeUndefined();
    }
  );

  it("shows a refusal about no one field above the key, which gets focus back", async () => {
    vi.mocked(register).mockImplementationOnce(async () => {
      registerStatus.value = "The e-mail couldn't be sent: please try again later.";
      return { sent: false };
    });
    const wrapper = await mountForm();
    await fill(wrapper);

    await wrapper.find("form").trigger("submit");
    await flushPromises();

    expect(wrapper.find('[role="alert"]').text()).toBe(
      "The e-mail couldn't be sent: please try again later."
    );
    expect(wrapper.find(".field__error").exists()).toBe(false);
    expect(document.activeElement).toBe(submitButton(wrapper).element);

    // Editing a field keeps it: the problem wasn't that field.
    await wrapper.find(FIELDS.email).setValue("you@example.com");
    expect(wrapper.find('[role="alert"]').exists()).toBe(true);
  });

  it("opens the code step when a code went to the address moments ago", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "setInterval", "Date"] });
    vi.mocked(register).mockImplementationOnce(async () => {
      registerStatus.value =
        "A code was sent just now: wait 40 seconds before requesting another one.";
      return { sent: false, retryAfter: 40 };
    });
    const wrapper = await mountForm();
    await fill(wrapper);

    await wrapper.find("form").trigger("submit");
    await flushPromises();

    expect(wrapper.find('[role="status"]').text()).toBe(
      "Less than a minute ago, a code went to me@example.com. It still works: enter it to finish registering, with the username and password you sent then."
    );
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
    expect(document.activeElement).toBe(wrapper.find("input").element);
    expect(resendButton(wrapper).text()).toBe("Resend in 40 s");
  });

  it("opens the code step for a code that already arrived, sending nothing", async () => {
    const wrapper = await mountForm();
    await wrapper.find('input[type="email"]').setValue("me@example.com");

    await enterCodeButton(wrapper).trigger("click");
    await flushPromises();

    expect(register).not.toHaveBeenCalled();
    expect(wrapper.find('[role="status"]').text()).toBe(
      "Enter the code that was mailed to me@example.com. It works for 15 minutes after sending, and keeps the username and password you registered with then."
    );
    expect(document.activeElement).toBe(wrapper.find("input").element);
    expect(resendButton(wrapper).text()).toBe("Resend code");
  });

  it("asks for the address before entering a code", async () => {
    const wrapper = await mountForm();
    await wrapper.find('input[type="email"]').setValue("nope");

    await enterCodeButton(wrapper).trigger("click");
    await flushPromises();

    expect(errorUnder(wrapper, FIELDS.email)).toBe("Please enter a valid email address.");
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
    // Not a failed registration: the Register key doesn't flash.
    expect(submitButton(wrapper).classes()).not.toContain("btn--error");
    expect(document.activeElement).toBe(wrapper.find(FIELDS.email).element);
    expect(wrapper.find('input[autocomplete="one-time-code"]').exists()).toBe(false);
  });

  it("maps the generic error to a readable message", async () => {
    const wrapper = await mountForm();

    registerStatus.value = "error";
    await flushPromises();

    expect(wrapper.find('[role="alert"]').text()).toBe("Registration failed. Please try again.");
  });

  it("clears the status and the form after logging out, but not after logging in", async () => {
    const wrapper = await mountForm();
    await fill(wrapper);
    registerStatus.value = "error";

    isLoggedIn.value = true;
    await flushPromises();
    expect(registerStatus.value).toBe("error");

    isLoggedIn.value = false;
    await flushPromises();
    expect(registerStatus.value).toBe("");
    expect(wrapper.findAll("input").map((input) => input.element.value)).toEqual(["", "", "", ""]);
  });

  describe("the code step", () => {
    let fetchMock: ReturnType<typeof mockFetch>;

    /** The form, filled in and sent, now asking for the code. */
    const atCodeStep = async () => {
      vi.mocked(register).mockResolvedValueOnce({ sent: true });
      const wrapper = await mountForm();
      await fill(wrapper);
      await wrapper.find("form").trigger("submit");
      await flushPromises();
      return wrapper;
    };

    const confirm = async (wrapper: Wrapper, code = "123456") => {
      await wrapper.find("input").setValue(code);
      await wrapper.find("form").trigger("submit");
      await flushPromises();
    };

    beforeEach(() => {
      fetchMock = mockFetch();
      vi.mocked(fetchUserDetails).mockReset();
      vi.spyOn(console, "error").mockImplementation(() => {});
    });

    it("confirms the code and goes on logged in", async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse(201, {}));
      vi.mocked(fetchUserDetails).mockImplementationOnce(async () => {
        isLoggedIn.value = true;
        return true;
      });
      const wrapper = await atCodeStep();

      await confirm(wrapper, "123 456");

      expect(JSON.parse(fetchMock.mock.calls[0][1]!.body as string)).toEqual({
        email: "me@example.com",
        code: "123456"
      });
      expect(wrapper.text()).toContain("Registration successful!");
      expect(wrapper.find('a[href="/shorten"]').exists()).toBe(true);
      // Confirm code was disabled while it checked; focus goes to the news instead of the page.
      expect(document.activeElement).toBe(wrapper.find('[role="status"]').element);

      // Logging out from the navbar shows an empty form, not the finished code step.
      isLoggedIn.value = false;
      await flushPromises();
      expect(submitButton(wrapper).text()).toBe("Register");
      expect(wrapper.find('input[autocomplete="one-time-code"]').exists()).toBe(false);
      expect(wrapper.findAll("input").map((input) => input.element.value)).toEqual([
        "",
        "",
        "",
        ""
      ]);
    });

    it("asks to log in when the browser didn't keep the session", async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse(201, {}));
      vi.mocked(fetchUserDetails).mockResolvedValueOnce(false);
      const wrapper = await atCodeStep();

      await confirm(wrapper);

      expect(wrapper.find('[role="alert"]').text()).toBe(
        "Your account was created, but your browser didn't keep the session. Please check that cookies are enabled, then log in."
      );
      expect(wrapper.find('a[href="/login"]').text()).toBe("Log in");
      expect(document.activeElement).toBe(wrapper.find('[role="alert"]').element);
    });

    it("shows the API's message for a wrong code and stays on the step", async () => {
      const error = "The code is wrong, expired or already used: check it or request a new one.";
      fetchMock.mockResolvedValueOnce(jsonResponse(400, { error }));
      const wrapper = await atCodeStep();

      await confirm(wrapper);

      expect(wrapper.find('[role="alert"]').text()).toBe(error);
      expect(submitButton(wrapper).text()).toBe("Confirm code");
      expect(submitButton(wrapper).classes()).toContain("btn--error");
      expect(document.activeElement).toBe(wrapper.find("input").element);
    });

    it.each([
      ["username", "This username is already taken.", 'input[autocomplete="username"]'],
      ["address", "An account with this E-mail address already exists.", 'input[type="email"]']
    ])(
      "goes back to the filled-in form, at the field, when the %s was taken meanwhile",
      async (_, error, field) => {
        fetchMock.mockResolvedValueOnce(jsonResponse(409, { error }));
        const wrapper = await atCodeStep();

        await confirm(wrapper);

        expect(errorUnder(wrapper, field)).toBe(error);
        expect(submitButton(wrapper).text()).toBe("Register");
        expect(wrapper.findAll("input").map((input) => input.element.value)).toEqual([
          "me@example.com",
          "vb",
          "password",
          "password"
        ]);
        expect(document.activeElement).toBe(wrapper.find(field).element);
      }
    );

    it("drops an error once the user types a new code", async () => {
      const error = "The code is wrong, expired or already used: check it or request a new one.";
      fetchMock.mockResolvedValueOnce(jsonResponse(400, { error }));
      const wrapper = await atCodeStep();
      await confirm(wrapper);

      await wrapper.find("input").setValue("65432");

      expect(wrapper.find('[role="alert"]').exists()).toBe(false);
    });

    it("sends a new code once the minute is up", async () => {
      vi.useFakeTimers({ toFake: ["setTimeout", "setInterval", "Date"] });
      let answer!: (response: Response) => void;
      fetchMock.mockReturnValueOnce(new Promise((resolve) => (answer = resolve)));
      const wrapper = await atCodeStep();
      vi.advanceTimersByTime(60_000);
      await flushPromises();

      await resendButton(wrapper).trigger("click");
      expect(resendButton(wrapper).text()).toBe("Sending");
      answer(jsonResponse(200, {}));
      await flushPromises();

      expect(fetchMock).toHaveBeenCalledWith(
        "https://api.test/auth/register/resend",
        expect.objectContaining({ body: JSON.stringify({ email: "me@example.com" }) })
      );
      expect(wrapper.find('[role="status"]').text()).toBe(
        "A new code is on its way to me@example.com. The previous one no longer works."
      );
      expect(resendButton(wrapper).text()).toBe("Resend in 60 s");
      // The key it was on is disabled now; the code is what comes next.
      expect(document.activeElement).toBe(wrapper.find("input").element);
    });

    it("says to send a new code when the new one couldn't be mailed", async () => {
      vi.useFakeTimers({ toFake: ["setTimeout", "setInterval", "Date"] });
      fetchMock.mockResolvedValueOnce(
        jsonResponse(503, { error: "The e-mail couldn't be sent: please try again later." })
      );
      const wrapper = await atCodeStep();
      vi.advanceTimersByTime(60_000);
      await flushPromises();

      await resendButton(wrapper).trigger("click");
      await flushPromises();

      expect(wrapper.find('[role="status"]').text()).toBe(
        "A new code couldn't be mailed to me@example.com, and the one before no longer works. Send a new one below."
      );
      expect(wrapper.find('[role="alert"]').text()).toBe(
        "The e-mail couldn't be sent: please try again later."
      );
      expect(resendButton(wrapper).text()).toBe("Resend code");
    });

    it("counts down from the API's retryAfter when resending is refused", async () => {
      vi.useFakeTimers({ toFake: ["setTimeout", "setInterval", "Date"] });
      const error = "A code was sent just now: wait 42 seconds before requesting another one.";
      fetchMock.mockResolvedValueOnce(jsonResponse(429, { error, retryAfter: 42 }));
      const wrapper = await atCodeStep();
      vi.advanceTimersByTime(60_000);
      await flushPromises();

      await resendButton(wrapper).trigger("click");
      await flushPromises();

      expect(wrapper.find('[role="alert"]').text()).toBe(
        "A code was sent just now. You can send another once the countdown ends."
      );
      expect(resendButton(wrapper).text()).toBe("Resend in 42 s");
      expect(document.activeElement).toBe(wrapper.find("input").element);

      vi.advanceTimersByTime(42_000);
      await flushPromises();
      expect(wrapper.find('[role="alert"]').exists()).toBe(false);
      expect(resendButton(wrapper).text()).toBe("Resend code");
    });

    it("goes back to the filled-in form to fix the address", async () => {
      const wrapper = await atCodeStep();
      registerStatus.value = "stale";

      const back = wrapper.findAll("button").find((button) => button.text() === "Change address");
      await back!.trigger("click");
      await flushPromises();

      expect(registerStatus.value).toBe("");
      expect(wrapper.find('[role="alert"]').exists()).toBe(false);
      expect(wrapper.find("input").element.value).toBe("me@example.com");
      expect(document.activeElement).toBe(wrapper.find("input").element);
      expect(wrapper.text()).toContain("Register with GitHub");
    });
  });
});
