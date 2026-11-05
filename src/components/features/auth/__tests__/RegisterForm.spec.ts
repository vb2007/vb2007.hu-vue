import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { enableAutoUnmount, flushPromises } from "@vue/test-utils";
import RegisterForm from "@/components/features/auth/RegisterForm.vue";
import { isLoggedIn } from "@/scripts/authentication/authState";
import {
  checkUsername,
  register,
  registerStatus,
  type RegisterAnswer
} from "@/scripts/authentication/register";
import { fetchUserDetails, restoreSession } from "@/scripts/authentication/user";
import { jsonResponse, mockFetch } from "@/__tests__/helpers/fetch";
import { mountWithRouter } from "@/__tests__/helpers/mount";

vi.mock("@/scripts/authentication/register", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/scripts/authentication/register")>()),
  register: vi.fn(),
  checkUsername: vi.fn()
}));
vi.mock("@/scripts/authentication/user", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/scripts/authentication/user")>()),
  restoreSession: vi.fn(() => Promise.resolve()),
  fetchUserDetails: vi.fn()
}));

// Unmounting runs the form's own cleanup: a username check still waiting on its real timer would
// otherwise fire in a later test, which a busy runner host makes late enough to break it.
enableAutoUnmount(afterEach);

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
    vi.mocked(checkUsername).mockReset().mockResolvedValue("unknown");
  });

  afterEach(() => {
    registerStatus.value = "";
    document.body.innerHTML = "";
    sessionStorage.clear();
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
    [{ email: "nope" }, "Enter a valid e-mail address.", 0],
    [
      { email: `${"a".repeat(243)}@example.com` },
      "Your e-mail address can't be longer than 254 characters.",
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
      "A 6-digit code is on its way to me@example.com. Enter it to register as vb; it works for 15 minutes."
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

  it("shows a field's problem once it's left, and looks disabled until the form is right", async () => {
    const wrapper = await mountForm();
    const usernameInput = wrapper.find(FIELDS.username);
    expect(submitButton(wrapper).attributes("aria-disabled")).toBe("true");

    await usernameInput.setValue("v");
    expect(errorUnder(wrapper, FIELDS.username)).toBeUndefined();
    await usernameInput.trigger("blur");
    expect(errorUnder(wrapper, FIELDS.username)).toBe(
      "The username's too short: it must be between 2 and 16 characters."
    );

    // Every field is checked once it's left.
    await fill(wrapper, { email: "nope", password: "short", confirm: "other" });
    for (const input of wrapper.findAll("input")) await input.trigger("blur");
    expect(wrapper.findAll(".field__error").map((error) => error.text())).toEqual([
      "Enter a valid e-mail address.",
      "The password's too short: it must be between 8 and 128 characters.",
      "The two passwords don't match."
    ]);

    await fill(wrapper);
    expect(wrapper.find(".field__error").exists()).toBe(false);
    expect(submitButton(wrapper).attributes("aria-disabled")).toBeUndefined();
  });

  it("says a username is taken once typing pauses, and only asks about the latest", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    vi.mocked(checkUsername).mockImplementation(async (name) =>
      name === "anna" ? "taken" : "free"
    );
    const wrapper = await mountForm();
    await fill(wrapper, { username: "ann" });
    await wrapper.find(FIELDS.username).setValue("anna");

    vi.advanceTimersByTime(399);
    await flushPromises();
    expect(checkUsername).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    await flushPromises();
    expect(checkUsername).toHaveBeenCalledOnce();
    expect(checkUsername).toHaveBeenCalledWith("anna", expect.any(AbortSignal));
    expect(errorUnder(wrapper, FIELDS.username)).toBe("That username is taken: pick another one.");
    expect(submitButton(wrapper).attributes("aria-disabled")).toBe("true");

    await wrapper.find(FIELDS.username).setValue("anna2");
    expect(errorUnder(wrapper, FIELDS.username)).toBeUndefined();
    vi.advanceTimersByTime(400);
    await flushPromises();
    expect(errorUnder(wrapper, FIELDS.username)).toBeUndefined();
    expect(submitButton(wrapper).attributes("aria-disabled")).toBeUndefined();
    vi.useRealTimers();
  });

  it("drops an answer about a username that was edited meanwhile", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    let answer!: (availability: "taken") => void;
    vi.mocked(checkUsername).mockImplementationOnce(
      () => new Promise((resolve) => (answer = resolve))
    );
    const wrapper = await mountForm();
    await wrapper.find(FIELDS.username).setValue("anna");
    vi.advanceTimersByTime(400);

    // Too short to ask about, so nothing new is asked.
    await wrapper.find(FIELDS.username).setValue("a");
    answer("taken");
    await flushPromises();

    expect(checkUsername).toHaveBeenCalledOnce();
    expect(vi.mocked(checkUsername).mock.calls[0][1]!.aborted).toBe(true);
    expect(errorUnder(wrapper, FIELDS.username)).toBeUndefined();
    vi.useRealTimers();
  });

  it("stops waiting to check the username when it's gone", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const wrapper = await mountForm();
    await wrapper.find(FIELDS.username).setValue("anna");

    wrapper.unmount();
    vi.advanceTimersByTime(400);

    expect(checkUsername).not.toHaveBeenCalled();
    vi.useRealTimers();
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
      await wrapper.find(selector).setValue(field === "username" ? "vb2" : "changed@example.com");
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
      "Less than a minute ago, a code went to me@example.com. It still works: enter it to register as vb."
    );
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
    expect(document.activeElement).toBe(wrapper.find("input").element);
    expect(resendButton(wrapper).text()).toBe("Resend in 40 s");
  });

  it("opens the code step for a code that already arrived, sending nothing", async () => {
    const wrapper = await mountForm();
    await fill(wrapper);

    await enterCodeButton(wrapper).trigger("click");
    await flushPromises();

    expect(register).not.toHaveBeenCalled();
    expect(wrapper.find('[role="status"]').text()).toBe(
      "Enter the code that was mailed to me@example.com. It works for 15 minutes after sending, and registers you as vb with the password you entered."
    );
    expect(document.activeElement).toBe(wrapper.find("input").element);
    expect(resendButton(wrapper).text()).toBe("Resend code");
  });

  it("picks up the resend countdown kept from before a reload", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "setInterval", "Date"] });
    sessionStorage.setItem(
      "register-cooldown",
      JSON.stringify({ id: "me@example.com", deadline: Date.now() + 30_000 })
    );
    const wrapper = await mountForm();
    await fill(wrapper, { email: "Me@Example.com" });

    await enterCodeButton(wrapper).trigger("click");
    await flushPromises();

    expect(resendButton(wrapper).text()).toBe("Resend in 30 s");
    expect(resendButton(wrapper).attributes("disabled")).toBeDefined();
  });

  it("asks for the whole form before entering a code, which creates the account with it", async () => {
    const wrapper = await mountForm();
    await wrapper.find('input[type="email"]').setValue("nope");
    // Said before it's pressed, e.g. by someone back after a reload with an empty form.
    expect(wrapper.find(".alt p").text().replace(/\s+/g, " ")).toBe(
      "Already have a code? Enter it after filling in the form."
    );

    await enterCodeButton(wrapper).trigger("click");
    await flushPromises();

    expect(errorUnder(wrapper, FIELDS.email)).toBe("Enter a valid e-mail address.");
    expect(errorUnder(wrapper, FIELDS.username)).toBe(
      "The username's too short: it must be between 2 and 16 characters."
    );
    expect(errorUnder(wrapper, FIELDS.password)).toBe(
      "The password's too short: it must be between 8 and 128 characters."
    );
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

      // The waiting registration only holds the address: the account gets the form's name and password.
      expect(JSON.parse(fetchMock.mock.calls[0][1]!.body as string)).toEqual({
        email: "me@example.com",
        code: "123456",
        username: "vb",
        password: "password"
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

    it.each([
      [
        "a wrong code, as the API's 400",
        "654321",
        "The code is wrong, expired or already used: check it or request a new one."
      ],
      ["a code that isn't 6 digits", "123", "Enter the 6-digit code from the e-mail."]
    ])("marks the code field for %s and stays on the step", async (_, code, error) => {
      vi.useFakeTimers({ toFake: ["setTimeout", "setInterval", "Date"] });
      fetchMock.mockResolvedValueOnce(jsonResponse(400, { error }));
      const wrapper = await atCodeStep();

      await confirm(wrapper, code);

      const input = wrapper.find("input");
      expect(input.attributes("aria-invalid")).toBe("true");
      expect(errorUnder(wrapper, 'input[autocomplete="one-time-code"]')).toBe(error);
      expect(input.attributes("aria-describedby")).toContain(
        wrapper.find(".field__error").attributes("id")
      );
      expect(wrapper.find('[role="alert"]').exists()).toBe(false);
      expect(submitButton(wrapper).text()).toBe("Confirm code");
      expect(submitButton(wrapper).classes()).toContain("btn--error");
      expect(document.activeElement).toBe(input.element);

      // Typing a new code drops it once it's 6 digits.
      await input.setValue("1");
      expect(errorUnder(wrapper, 'input[autocomplete="one-time-code"]')).toBe(
        "Enter the 6-digit code from the e-mail."
      );
      await input.setValue("123456");
      expect(input.attributes("aria-invalid")).toBeUndefined();
    });

    it("keeps a problem that isn't the code's above the key", async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse(429, { error: "Too many failed attempts: try again later." })
      );
      const wrapper = await atCodeStep();

      await confirm(wrapper);

      expect(wrapper.find('[role="alert"]').text()).toBe(
        "Too many failed attempts: try again later."
      );
      expect(wrapper.find("input").attributes("aria-invalid")).toBeUndefined();
      expect(submitButton(wrapper).classes()).toContain("btn--error");
    });

    it("flashes the key for its full second on each failed try", async () => {
      vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "Date"] });
      const wrapper = await atCodeStep();

      await confirm(wrapper, "1");
      vi.advanceTimersByTime(600);
      await confirm(wrapper, "12");
      vi.advanceTimersByTime(600);
      await flushPromises();
      expect(submitButton(wrapper).classes()).toContain("btn--error");

      vi.advanceTimersByTime(400);
      await flushPromises();
      expect(submitButton(wrapper).classes()).not.toContain("btn--error");
    });

    it.each([
      [
        "a username taken meanwhile",
        409,
        "This username is already taken.",
        FIELDS.username,
        "That username was taken in the meantime: pick another one. Your code works for up to 15 minutes after it was sent.",
        "Continue"
      ],
      [
        "an address that already has an account",
        409,
        "An account with this E-mail address already exists.",
        FIELDS.email,
        "An account already uses this address. Log in instead (with GitHub if that's how you signed up), or reset the password from the log-in page.",
        "Register"
      ],
      [
        "a username outside the length rule",
        400,
        "The username's too long: it must be between 2 and 16 characters.",
        FIELDS.username,
        "The username's too long: it must be between 2 and 16 characters.",
        "Continue"
      ]
    ])(
      "goes back to the filled-in form, at the field, for %s",
      async (_, status, error, field, shown, label) => {
        fetchMock.mockResolvedValueOnce(jsonResponse(status, { error }));
        const wrapper = await atCodeStep();

        await confirm(wrapper);

        expect(errorUnder(wrapper, field)).toBe(shown);
        expect(wrapper.find('[role="alert"]').exists()).toBe(false);
        // A code that still works makes the key go on to it rather than register again.
        expect(submitButton(wrapper).text()).toBe(label);
        // Confirm code was pressed, not Register: the focused field says what to fix.
        expect(submitButton(wrapper).classes()).not.toContain("btn--error");
        expect(wrapper.findAll("input").map((input) => input.element.value)).toEqual([
          "me@example.com",
          "vb",
          "password",
          "password"
        ]);
        expect(document.activeElement).toBe(wrapper.find(field).element);
      }
    );

    /** Confirms a code the API refuses for a username taken meanwhile, back on the form. */
    const nameTakenMeanwhile = async (wrapper: Wrapper) => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse(409, { error: "This username is already taken." })
      );
      await confirm(wrapper, "123 456");
      await wrapper.find(FIELDS.username).setValue("vb2");
    };

    it("goes on with the same code and countdown after a username taken meanwhile", async () => {
      vi.useFakeTimers({ toFake: ["setTimeout", "setInterval", "Date"] });
      const wrapper = await atCodeStep();
      vi.advanceTimersByTime(20_000);
      await nameTakenMeanwhile(wrapper);
      fetchMock.mockResolvedValueOnce(jsonResponse(201, {}));
      vi.mocked(fetchUserDetails).mockResolvedValueOnce(true);

      await wrapper.find("form").trigger("submit");
      await flushPromises();

      // No new code is mailed: the step reopens with the one typed before, for the new name.
      expect(register).toHaveBeenCalledTimes(1);
      expect(wrapper.find('[role="status"]').text()).toBe(
        "Your code for me@example.com works for up to 15 minutes after it was sent: confirm it to register as vb2."
      );
      const codeInput = wrapper.find<HTMLInputElement>('input[autocomplete="one-time-code"]');
      expect(codeInput.element.value).toBe("123 456");
      expect(document.activeElement).toBe(codeInput.element);
      expect(resendButton(wrapper).text()).toBe("Resend in 40 s");

      await wrapper.find("form").trigger("submit");
      await flushPromises();

      expect(JSON.parse(fetchMock.mock.calls[1][1]!.body as string)).toEqual({
        email: "me@example.com",
        code: "123456",
        username: "vb2",
        password: "password"
      });
      expect(wrapper.text()).toContain("Registration successful!");
    });

    it("reopens the kept code from Enter it too", async () => {
      const wrapper = await atCodeStep();
      await nameTakenMeanwhile(wrapper);

      await enterCodeButton(wrapper).trigger("click");
      await flushPromises();

      expect(wrapper.find('[role="status"]').text()).toContain("Your code for me@example.com");
      expect(wrapper.find("input").element.value).toBe("123 456");
    });

    it("registers again for another address than the kept code's", async () => {
      const wrapper = await atCodeStep();
      await nameTakenMeanwhile(wrapper);
      vi.mocked(register).mockResolvedValueOnce({ sent: true });
      expect(submitButton(wrapper).text()).toBe("Continue");

      await wrapper.find(FIELDS.email).setValue("you@example.com");
      expect(submitButton(wrapper).text()).toBe("Register");
      await wrapper.find("form").trigger("submit");
      await flushPromises();

      expect(register).toHaveBeenLastCalledWith("vb2", "you@example.com", "password");
      expect(wrapper.find('[role="status"]').text()).toContain("on its way to you@example.com");
      expect(wrapper.find("input").element.value).toBe("");
    });

    it.each([
      ["a new code was mailed", 200, {}, "", ""],
      [
        "the new code couldn't be mailed",
        503,
        { error: "The e-mail couldn't be sent: please try again later." },
        "",
        "The e-mail couldn't be sent: please try again later."
      ],
      [
        "resending was refused, so the code stays",
        429,
        { error: "Too many e-mails requested: try again later." },
        "123 456",
        "Too many e-mails requested: try again later."
      ]
    ])(
      "from the kept code's step, a resend where %s decides what's kept",
      async (_, status, body, codeLeft, alert) => {
        vi.useFakeTimers({ toFake: ["setTimeout", "setInterval", "Date"] });
        const wrapper = await atCodeStep();
        await nameTakenMeanwhile(wrapper);
        await wrapper.find("form").trigger("submit");
        await flushPromises();
        vi.advanceTimersByTime(60_000);
        await flushPromises();
        fetchMock.mockResolvedValueOnce(jsonResponse(status, body));

        await resendButton(wrapper).trigger("click");
        await flushPromises();

        // A replaced code is cleared, so Confirm can't spend a try on it; the error stays.
        expect(wrapper.find("input").element.value).toBe(codeLeft);
        expect(wrapper.find('[role="alert"]').exists()).toBe(!!alert);
        if (alert) expect(wrapper.find('[role="alert"]').text()).toBe(alert);

        vi.mocked(register).mockResolvedValueOnce({ sent: true });
        const back = wrapper.findAll("button").find((button) => button.text() === "Change address");
        await back!.trigger("click");
        await flushPromises();
        await wrapper.find("form").trigger("submit");
        await flushPromises();

        // Only a code that still stands is reopened without mailing another.
        expect(register).toHaveBeenCalledTimes(codeLeft ? 1 : 2);
      }
    );

    it.each([
      [
        "refused",
        () => jsonResponse(429, { error: "Too many e-mails requested: try again later." })
      ],
      ["failed on the server", () => jsonResponse(500, undefined, "Internal Server Error")],
      ["unreachable", () => Promise.reject(new TypeError("Failed to fetch"))]
    ])("keeps the code typed after a resend when the next resend is %s", async (_, answer) => {
      vi.useFakeTimers({ toFake: ["setTimeout", "setInterval", "Date"] });
      const wrapper = await atCodeStep();
      vi.advanceTimersByTime(60_000);
      await flushPromises();
      fetchMock.mockResolvedValueOnce(jsonResponse(200, {}));
      await resendButton(wrapper).trigger("click");
      await flushPromises();
      await wrapper.find("input").setValue("654321");
      vi.advanceTimersByTime(60_000);
      await flushPromises();
      fetchMock.mockImplementationOnce(answer as () => Promise<Response>);

      await resendButton(wrapper).trigger("click");
      await flushPromises();

      // The notice still says "resent" from before, but this resend replaced nothing.
      expect(wrapper.find('[role="status"]').text()).toContain("a new code is on its way");
      expect(wrapper.find("input").element.value).toBe("654321");
      expect(wrapper.find('[role="alert"]').exists()).toBe(true);
    });

    it("holds Confirm code while a new code is being sent", async () => {
      vi.useFakeTimers({ toFake: ["setTimeout", "setInterval", "Date"] });
      let answer!: (response: Response) => void;
      fetchMock.mockReturnValueOnce(new Promise((resolve) => (answer = resolve)));
      const wrapper = await atCodeStep();
      await wrapper.find("input").setValue("123456");
      vi.advanceTimersByTime(60_000);
      await flushPromises();

      await resendButton(wrapper).trigger("click");
      await flushPromises();

      // The resend may replace the code: confirming it now could only spend a try.
      expect(submitButton(wrapper).attributes("disabled")).toBeDefined();
      answer(jsonResponse(200, {}));
      await flushPromises();
      expect(submitButton(wrapper).attributes("disabled")).toBeUndefined();
    });

    it("holds Resend and Change address while a code is being confirmed", async () => {
      vi.useFakeTimers({ toFake: ["setTimeout", "setInterval", "Date"] });
      let answer!: (response: Response) => void;
      fetchMock.mockReturnValueOnce(new Promise((resolve) => (answer = resolve)));
      const wrapper = await atCodeStep();
      vi.advanceTimersByTime(60_000);
      await flushPromises();

      await wrapper.find("input").setValue("123456");
      await wrapper.find("form").trigger("submit");
      await flushPromises();

      const back = () =>
        wrapper.findAll("button").find((button) => button.text() === "Change address")!;
      // Its answer is about this address: neither may move the step on before it arrives.
      expect(resendButton(wrapper).attributes("disabled")).toBeDefined();
      expect(back().attributes("disabled")).toBeDefined();

      answer(jsonResponse(400, { error: "The code is wrong, expired or already used." }));
      await flushPromises();
      expect(resendButton(wrapper).attributes("disabled")).toBeUndefined();
      expect(back().attributes("disabled")).toBeUndefined();
    });

    it("holds the address with an account back until it's changed, keeping no code", async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse(409, { error: "An account with this E-mail address already exists." })
      );
      const wrapper = await atCodeStep();
      await confirm(wrapper);

      await enterCodeButton(wrapper).trigger("click");
      await flushPromises();
      expect(wrapper.find('[role="status"]').exists()).toBe(false);
      expect(document.activeElement).toBe(wrapper.find(FIELDS.email).element);

      // Back to the same address once fixed: the code it had is gone with the registration.
      await wrapper.find(FIELDS.email).setValue("Me@example.com");
      await enterCodeButton(wrapper).trigger("click");
      await flushPromises();
      expect(wrapper.find('[role="status"]').text()).toContain("Enter the code that was mailed to");
      expect(wrapper.find("input").element.value).toBe("");
      expect(register).toHaveBeenCalledTimes(1);
    });

    it("keeps a conflict that names no field on the step", async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse(409, { error: "Already registered." }));
      const wrapper = await atCodeStep();

      await confirm(wrapper);

      expect(wrapper.find('[role="alert"]').text()).toBe("Already registered.");
      expect(submitButton(wrapper).text()).toBe("Confirm code");
      expect(document.activeElement).toBe(wrapper.find("input").element);
    });

    it("checks the code once it's left", async () => {
      const wrapper = await atCodeStep();
      const input = wrapper.find("input");

      await input.setValue("12");
      expect(input.attributes("aria-invalid")).toBeUndefined();
      await input.trigger("blur");

      expect(errorUnder(wrapper, 'input[autocomplete="one-time-code"]')).toBe(
        "Enter the 6-digit code from the e-mail."
      );
    });

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
        "If a registration is waiting for me@example.com, a new code is on its way, and the one before no longer works."
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
