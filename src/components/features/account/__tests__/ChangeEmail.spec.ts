import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import ChangeEmail from "@/components/features/account/ChangeEmail.vue";
import { emailVerified, pendingEmail, userEmail } from "@/scripts/authentication/authState";
import { jsonResponse, mockFetch } from "@/__tests__/helpers/fetch";

/** `GET /user` after the change, shaped like the API's answer. */
const refreshedUser = {
  _id: "6702a1f0c3b4d5e6f7a8b9c0",
  username: "vb",
  email: "new@example.com",
  createdAt: "2026-01-10T12:00:00.000Z",
  hasPassword: true,
  isSuperuser: false,
  emailVerified: true,
  pendingEmail: null
};

/** `GET /user` while the new address waits for its code. */
const waitingUser = { ...refreshedUser, email: "old@example.com", pendingEmail: "new@example.com" };

describe("ChangeEmail", () => {
  let fetchMock: ReturnType<typeof mockFetch>;
  let wrapper: VueWrapper;

  beforeEach(() => {
    fetchMock = mockFetch();
    vi.spyOn(console, "error").mockImplementation(() => {});
    userEmail.value = "old@example.com";
    sessionStorage.clear();
    wrapper = mount(ChangeEmail, { attachTo: document.body });
  });

  afterEach(() => wrapper.unmount());

  const key = () => wrapper.find("button");
  const inputs = () => wrapper.findAll("input");
  const button = (name: string) =>
    wrapper.findAll("button").find((found) => found.text() === name)!;

  const openForm = async () => {
    await key().trigger("click");
    await flushPromises();
  };

  const fill = async (email: string, password: string) => {
    await inputs()[0].setValue(email);
    await inputs()[1].setValue(password);
  };

  it("hides the form behind a key", () => {
    expect(key().text()).toBe("Change e-mail");
    expect(wrapper.find("form").exists()).toBe(false);
  });

  it("opens the form in place and focuses the new address", async () => {
    await openForm();

    expect(wrapper.find("form").attributes("novalidate")).toBeDefined();
    expect(wrapper.findAll("label").map((label) => label.text())).toEqual([
      "New e-mail",
      "Current password"
    ]);
    expect(inputs().map((input) => input.attributes("type"))).toEqual(["email", "password"]);
    expect(inputs().map((input) => input.attributes("autocomplete"))).toEqual([
      "email",
      "current-password"
    ]);
    expect(inputs().every((input) => input.attributes("required") !== undefined)).toBe(true);
    expect(document.activeElement).toBe(inputs()[0].element);
    expect(button("Change e-mail")).toBeUndefined();
    expect(button("Send code").attributes("type")).toBe("submit");
  });

  it.each([
    ["not-an-address", "secret-password", 0, "Enter a valid e-mail address."],
    ["new@example.com", "", 1, "Enter your current password."],
    [" Old@Example.com ", "secret-password", 0, "That's already your e-mail address."]
  ])("checks %j / %j before sending", async (email, password, invalid, error) => {
    await openForm();
    await fill(email, password);

    await wrapper.find("form").trigger("submit");

    expect(fetchMock).not.toHaveBeenCalled();
    expect(wrapper.find(".field__error").text()).toBe(error);
    expect(inputs()[invalid].attributes("aria-invalid")).toBe("true");
    expect(document.activeElement).toBe(inputs()[invalid].element);
  });

  it("flags both fields and focuses the first one", async () => {
    await openForm();

    await wrapper.find("form").trigger("submit");

    expect(wrapper.findAll(".field__error").map((error) => error.text())).toEqual([
      "Enter a valid e-mail address.",
      "Enter your current password."
    ]);
    expect(document.activeElement).toBe(inputs()[0].element);
  });

  it("clears a field's error as soon as it's typed in", async () => {
    await openForm();
    await wrapper.find("form").trigger("submit");

    await inputs()[0].setValue("n");
    expect(wrapper.findAll(".field__error").map((error) => error.text())).toEqual([
      "Enter your current password."
    ]);

    await inputs()[1].setValue("s");
    expect(wrapper.find(".field__error").exists()).toBe(false);
  });

  it("closes the form and shows the API's message when there was nothing to confirm", async () => {
    let answer!: (response: Response) => void;
    fetchMock
      .mockReturnValueOnce(new Promise<Response>((resolve) => (answer = resolve)))
      .mockResolvedValueOnce(jsonResponse(200, refreshedUser));
    await openForm();
    await fill("  new@example.com ", "secret-password");

    await wrapper.find("form").trigger("submit");
    expect(button("Sending").attributes("aria-busy")).toBe("true");
    expect(button("Cancel").attributes("disabled")).toBeDefined();
    answer(jsonResponse(200, { message: "E-mail address updated successfully." }));
    await flushPromises();

    expect(fetchMock).toHaveBeenNthCalledWith(1, "https://api.test/user/email", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "new@example.com", password: "secret-password" }),
      credentials: "include"
    });
    expect(userEmail.value).toBe("new@example.com");
    expect(wrapper.find("form").exists()).toBe(false);
    expect(wrapper.find('[role="status"]').text()).toBe("E-mail address updated successfully.");
    expect(document.activeElement).toBe(key().element);

    await openForm();
    expect(wrapper.find('[role="status"]').exists()).toBe(false);
    expect(inputs().map((input) => (input.element as HTMLInputElement).value)).toEqual(["", ""]);
  });

  it.each([
    [403, "The provided password is incorrect."],
    [400, "Disposable (temporary) e-mail addresses can't be used: use a permanent one."],
    [503, "The e-mail couldn't be sent: please try again later."]
  ])("shows the API's %i and keeps what was typed", async (status, error) => {
    fetchMock.mockResolvedValueOnce(jsonResponse(status, { error }));
    await openForm();
    await fill("new@example.com", "wrong-password");
    (inputs()[1].element as HTMLInputElement).focus();

    await wrapper.find("form").trigger("submit");
    await flushPromises();

    expect(wrapper.find('[role="alert"]').text()).toBe(error);
    expect(inputs().map((input) => (input.element as HTMLInputElement).value)).toEqual([
      "new@example.com",
      "wrong-password"
    ]);
    expect(document.activeElement).toBe(inputs()[1].element);
    expect(userEmail.value).toBe("old@example.com");
  });

  it("brings focus back into the form after a clicked save fails, so Escape still works", async () => {
    let answer!: (response: Response) => void;
    fetchMock.mockReturnValueOnce(new Promise<Response>((resolve) => (answer = resolve)));
    await openForm();
    await fill("taken@example.com", "secret-password");

    await button("Send code").trigger("click");
    await wrapper.find("form").trigger("submit");
    // A disabled button loses focus in the browser, which jsdom doesn't do by itself.
    (document.activeElement as HTMLElement).blur();
    answer(jsonResponse(409, { error: "An account with this E-mail address already exists." }));
    await flushPromises();

    expect(document.activeElement).toBe(inputs()[0].element);
    await inputs()[0].trigger("keydown", { key: "Escape" });
    await flushPromises();
    expect(wrapper.find("form").exists()).toBe(false);
    expect(document.activeElement).toBe(key().element);
  });

  it.each([
    ["saved", jsonResponse(200, { message: "E-mail address updated successfully." })],
    ["refused", jsonResponse(409, { error: "Taken." })]
  ])("doesn't trip over focus when it's gone before the save is %s", async (_how, response) => {
    let answer!: (response: Response) => void;
    fetchMock
      .mockReturnValueOnce(new Promise<Response>((resolve) => (answer = resolve)))
      .mockResolvedValueOnce(jsonResponse(500));
    await openForm();
    await fill("new@example.com", "secret-password");
    await wrapper.find("form").trigger("submit");

    wrapper.unmount();
    answer(response);
    await flushPromises();

    expect(document.activeElement).toBe(document.body);
    wrapper = mount(ChangeEmail);
  });

  it("says so when the server can't be reached", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await openForm();
    await fill("new@example.com", "secret-password");

    await wrapper.find("form").trigger("submit");
    await flushPromises();

    expect(wrapper.find('[role="alert"]').text()).toBe("Error connecting to server");
    expect(wrapper.find("form").exists()).toBe(true);
  });

  it.each([
    ["the Cancel key", () => button("Cancel").trigger("click")],
    ["Escape", () => wrapper.find("form").trigger("keydown", { key: "Escape" })]
  ])("%s clears the form and focuses the key", async (_how, cancel) => {
    fetchMock.mockResolvedValueOnce(jsonResponse(409, { error: "Taken." }));
    await openForm();
    await fill("taken@example.com", "secret-password");
    await wrapper.find("form").trigger("submit");
    await flushPromises();

    await cancel();
    await flushPromises();

    expect(wrapper.find("form").exists()).toBe(false);
    expect(document.activeElement).toBe(key().element);
    await openForm();
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
    expect(inputs().map((input) => (input.element as HTMLInputElement).value)).toEqual(["", ""]);
  });

  it("ignores Escape while saving", async () => {
    fetchMock.mockReturnValueOnce(new Promise<Response>(() => {}));
    await openForm();
    await fill("new@example.com", "secret-password");
    await wrapper.find("form").trigger("submit");

    await wrapper.find("form").trigger("keydown", { key: "Escape" });
    await flushPromises();

    expect(wrapper.find("form").exists()).toBe(true);
  });

  describe("with a code to confirm", () => {
    // The countdown runs on setInterval and Date.now; flushPromises still needs real timeouts.
    const fakeCountdown = () =>
      vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "Date"] });

    const pendingLine = () => wrapper.find(".change__pending");
    const codeInput = () => wrapper.find('input[autocomplete="one-time-code"]');

    const remount = async () => {
      wrapper.unmount();
      pendingEmail.value = "new@example.com";
      wrapper = mount(ChangeEmail, { attachTo: document.body });
      await flushPromises();
    };

    const sendCode = async () => {
      fetchMock
        .mockResolvedValueOnce(jsonResponse(202, { message: "A confirmation code was sent." }))
        .mockResolvedValueOnce(jsonResponse(200, waitingUser));
      await openForm();
      await fill("new@example.com", "secret-password");
      await wrapper.find("form").trigger("submit");
      await flushPromises();
    };

    const enterCode = async (value: string) => {
      await codeInput().setValue(value);
      await wrapper.find("form").trigger("submit");
      await flushPromises();
    };

    it("asks for the code after the API mailed it, and puts the cursor there", async () => {
      await sendCode();

      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(pendingLine().attributes("role")).toBe("status");
      expect(pendingLine().text()).toBe("Waiting for confirmation: new@example.com");
      expect(wrapper.find(".change__saved").exists()).toBe(false);
      expect(wrapper.findAll("label").map((label) => label.text())).toEqual(["Confirmation code"]);
      expect(codeInput().attributes()).toMatchObject({ inputmode: "numeric", required: "" });
      expect(codeInput().classes()).toContain("field__input--mono");
      expect(document.activeElement).toBe(codeInput().element);
      expect(button("Confirm code").attributes("type")).toBe("submit");
      expect(button("Change e-mail").attributes("type")).toBe("button");
      expect(userEmail.value).toBe("old@example.com");
    });

    it("describes the code field with the waiting address, then its hint", async () => {
      await remount();

      const describedBy = codeInput().attributes("aria-describedby")!.split(" ");
      expect(describedBy[0]).toBe(pendingLine().attributes("id"));
      expect(document.getElementById(describedBy[1])!.textContent).toBe(
        "The code works for 15 minutes from when it was sent. Nothing yet? Check your spam folder, or get a new one with Change e-mail."
      );
    });

    it("shows a change that was already waiting, e.g. after a reload", async () => {
      await remount();

      expect(pendingLine().text()).toBe("Waiting for confirmation: new@example.com");
      expect(codeInput().exists()).toBe(true);
      expect(wrapper.findAll("button").map((found) => found.text())).toEqual([
        "Confirm code",
        "Change e-mail"
      ]);
    });

    it("confirms the code without its spaces, then shows the new address's message", async () => {
      await remount();
      fetchMock
        .mockResolvedValueOnce(
          jsonResponse(200, { message: "E-mail address updated successfully." })
        )
        .mockResolvedValueOnce(jsonResponse(200, refreshedUser));

      await enterCode(" 123 456 ");

      expect(fetchMock).toHaveBeenNthCalledWith(1, "https://api.test/user/email/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: "123456" }),
        credentials: "include"
      });
      expect(userEmail.value).toBe("new@example.com");
      expect(emailVerified.value).toBe(true);
      expect(pendingLine().exists()).toBe(false);
      expect(codeInput().exists()).toBe(false);
      expect(wrapper.find('[role="status"]').text()).toBe("E-mail address updated successfully.");
      expect(document.activeElement).toBe(key().element);
      expect(key().text()).toBe("Change e-mail");
    });

    it("shows that it's confirming and keeps the other key out of the way", async () => {
      await remount();
      fetchMock.mockReturnValueOnce(new Promise<Response>(() => {}));

      await codeInput().setValue("123456");
      await wrapper.find("form").trigger("submit");

      expect(button("Confirming").attributes("aria-busy")).toBe("true");
      expect(button("Change e-mail").attributes("disabled")).toBeDefined();
    });

    it.each([
      ["", "nothing"],
      ["12345", "too few digits"],
      ["12345a", "a letter"]
    ])("checks the code (%j, %s) before sending it", async (value) => {
      await remount();

      await enterCode(value);

      expect(fetchMock).not.toHaveBeenCalled();
      expect(wrapper.find(".field__error").text()).toBe("Enter the 6-digit code from the e-mail.");
      expect(codeInput().attributes("aria-invalid")).toBe("true");
      expect(document.activeElement).toBe(codeInput().element);

      await codeInput().setValue("1");
      expect(wrapper.find(".field__error").exists()).toBe(false);
    });

    it("shows a wrong code's error by the field and keeps it to fix", async () => {
      await remount();
      const error = "The code is wrong, expired or already used: check it or request a new one.";
      fetchMock
        .mockResolvedValueOnce(jsonResponse(400, { error }))
        .mockResolvedValueOnce(jsonResponse(200, waitingUser));
      (codeInput().element as HTMLInputElement).focus();

      await enterCode("000000");

      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(wrapper.find(".field__error").text()).toBe(error);
      expect(codeInput().attributes("aria-invalid")).toBe("true");
      expect(wrapper.find('[role="alert"]').exists()).toBe(false);
      expect((codeInput().element as HTMLInputElement).value).toBe("000000");
      expect(document.activeElement).toBe(codeInput().element);
      expect(pendingLine().exists()).toBe(true);
    });

    it("brings focus back to the field after a clicked confirm fails", async () => {
      await remount();
      let answer!: (response: Response) => void;
      fetchMock.mockReturnValueOnce(new Promise<Response>((resolve) => (answer = resolve)));
      await codeInput().setValue("000000");

      await button("Confirm code").trigger("click");
      await wrapper.find("form").trigger("submit");
      // A disabled button loses focus in the browser, which jsdom doesn't do by itself.
      (document.activeElement as HTMLElement).blur();
      answer(jsonResponse(429, { error: "Too many failed attempts: try again later." }));
      await flushPromises();

      expect(wrapper.find('[role="alert"]').text()).toBe(
        "Too many failed attempts: try again later."
      );
      expect(document.activeElement).toBe(codeInput().element);
    });

    it("moves a refusal that dropped the change above the key", async () => {
      await remount();
      const error = "An account with this E-mail address already exists.";
      fetchMock
        .mockResolvedValueOnce(jsonResponse(409, { error }))
        .mockResolvedValueOnce(jsonResponse(200, { ...waitingUser, pendingEmail: null }));

      await enterCode("123456");

      expect(pendingLine().exists()).toBe(false);
      expect(wrapper.find("form").exists()).toBe(false);
      expect(wrapper.find('[role="alert"]').text()).toBe(
        `new@example.com wasn't confirmed. ${error}`
      );
      expect(document.activeElement).toBe(key().element);
      expect(userEmail.value).toBe("old@example.com");

      await openForm();
      expect(wrapper.find('[role="alert"]').exists()).toBe(false);
    });

    it("doesn't trip over focus when it's gone before the code is checked", async () => {
      await remount();
      let answer!: (response: Response) => void;
      fetchMock.mockReturnValueOnce(new Promise<Response>((resolve) => (answer = resolve)));
      await codeInput().setValue("000000");
      await wrapper.find("form").trigger("submit");

      wrapper.unmount();
      answer(jsonResponse(400, { error: "Wrong." }));
      await flushPromises();

      expect(document.activeElement).toBe(document.body);
      wrapper = mount(ChangeEmail);
    });

    it("starts the form from the waiting address, so a new code needs only the password", async () => {
      await remount();

      await button("Change e-mail").trigger("click");
      await flushPromises();

      expect(pendingLine().exists()).toBe(true);
      expect(codeInput().exists()).toBe(false);
      expect(inputs().map((input) => (input.element as HTMLInputElement).value)).toEqual([
        "new@example.com",
        ""
      ]);
      expect(wrapper.find(".field__hint").text()).toBe("A new code replaces the one already sent.");
      expect(document.activeElement).toBe(inputs()[1].element);
    });

    it("goes back to the code when the form is cancelled", async () => {
      await remount();
      await button("Change e-mail").trigger("click");
      await flushPromises();

      await wrapper.find("form").trigger("keydown", { key: "Escape" });
      await flushPromises();

      expect(codeInput().exists()).toBe(true);
      expect(document.activeElement).toBe(button("Change e-mail").element);
    });

    it("waits a minute after sending a code before the form can send another", async () => {
      fakeCountdown();
      await sendCode();

      await button("Change e-mail").trigger("click");
      await flushPromises();
      expect(button("Send code in 60 s").attributes("disabled")).toBeDefined();

      await wrapper.find("form").trigger("submit");
      await flushPromises();
      expect(fetchMock).toHaveBeenCalledTimes(2);

      vi.advanceTimersByTime(60_000);
      await flushPromises();
      expect(button("Send code").attributes("disabled")).toBeUndefined();
    });

    it("takes the code step away when the code had expired, and says which address", async () => {
      await remount();
      const error = "The code is wrong, expired or already used: check it or request a new one.";
      fetchMock
        .mockResolvedValueOnce(jsonResponse(400, { error }))
        .mockResolvedValueOnce(jsonResponse(200, { ...waitingUser, pendingEmail: null }));

      await enterCode("123456");

      expect(codeInput().exists()).toBe(false);
      expect(wrapper.find('[role="alert"]').text()).toBe(
        "new@example.com wasn't confirmed: its code expired. Send a new one with Change e-mail."
      );
      expect(document.activeElement).toBe(key().element);
    });

    it("forgets a code's error once the form opens", async () => {
      await remount();
      await enterCode("1");

      await button("Change e-mail").trigger("click");
      await flushPromises();
      await wrapper.find("form").trigger("keydown", { key: "Escape" });
      await flushPromises();

      expect(wrapper.find(".field__error").exists()).toBe(false);
    });

    it("still waits out the minute after a reload", async () => {
      fakeCountdown();
      sessionStorage.setItem(
        "email-change-cooldown",
        JSON.stringify({ id: "old@example.com", deadline: Date.now() + 25_000 })
      );
      await remount();

      await button("Change e-mail").trigger("click");
      await flushPromises();

      expect(button("Send code in 25 s").attributes("disabled")).toBeDefined();
    });

    it("counts down the wait after a 429, then drops its message", async () => {
      fakeCountdown();
      const error = "A code was sent just now: wait 42 seconds before requesting another one.";
      fetchMock
        .mockResolvedValueOnce(jsonResponse(429, { error, retryAfter: 42 }))
        .mockResolvedValueOnce(jsonResponse(200, waitingUser));
      await remount();
      await button("Change e-mail").trigger("click");
      await flushPromises();
      await inputs()[1].setValue("secret-password");

      await wrapper.find("form").trigger("submit");
      await flushPromises();

      // The API's number would go stale next to the key's count.
      expect(wrapper.find('[role="alert"]').text()).toBe(
        "A code was sent just now. You can send another once the countdown ends."
      );
      expect(button("Send code in 42 s").attributes("disabled")).toBeDefined();
      expect(document.activeElement).toBe(inputs()[1].element);

      vi.advanceTimersByTime(41_000);
      await flushPromises();
      expect(button("Send code in 1 s").exists()).toBe(true);

      vi.advanceTimersByTime(1_000);
      await flushPromises();
      expect(wrapper.find('[role="alert"]').exists()).toBe(false);
      expect(button("Send code").attributes("disabled")).toBeUndefined();
    });

    it("shows the change a 429 waits for, when its code was asked for elsewhere", async () => {
      fakeCountdown();
      wrapper.unmount();
      wrapper = mount(ChangeEmail, { attachTo: document.body });
      fetchMock
        .mockResolvedValueOnce(jsonResponse(429, { error: "Wait.", retryAfter: 50 }))
        .mockResolvedValueOnce(jsonResponse(200, waitingUser));
      await openForm();
      await fill("other@example.com", "secret-password");

      await wrapper.find("form").trigger("submit");
      await flushPromises();

      expect(pendingLine().text()).toBe("Waiting for confirmation: new@example.com");
      expect(wrapper.find('[role="alert"]').text()).toBe(
        "A code was sent just now. You can send another once the countdown ends."
      );
      await wrapper.find("form").trigger("keydown", { key: "Escape" });
      await flushPromises();
      expect(codeInput().exists()).toBe(true);
    });
  });
});
