import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { jsonResponse, mockFetch } from "@/__tests__/helpers/fetch";
import {
  passwordLengthError,
  register,
  registerFieldOf,
  registerStatus,
  usernameLengthError,
  validateRegisterData
} from "@/scripts/authentication/register";

afterEach(() => {
  registerStatus.value = "";
});

const TOO_SHORT = "The password's too short: it must be between 8 and 128 characters.";
const TOO_LONG = "The password's too long: it must be between 8 and 128 characters.";
const USERNAME_TOO_SHORT = "The username's too short: it must be between 2 and 16 characters.";
const USERNAME_TOO_LONG = "The username's too long: it must be between 2 and 16 characters.";

describe("usernameLengthError", () => {
  it.each([
    ["1 character", "v", USERNAME_TOO_SHORT],
    ["1 character padded with spaces", " v ", USERNAME_TOO_SHORT],
    ["17 characters", "v".repeat(17), USERNAME_TOO_LONG],
    ["2 characters", "vb", undefined],
    ["16 characters", "v".repeat(16), undefined],
    ["16 characters padded with spaces", `  ${"v".repeat(16)}  `, undefined]
  ])("checks %s", (_case, username, expected) => {
    expect(usernameLengthError(username)).toBe(expected);
  });
});

describe("passwordLengthError", () => {
  it.each([
    ["7 characters", "p".repeat(7), TOO_SHORT],
    ["129 characters", "p".repeat(129), TOO_LONG],
    ["8 characters", "p".repeat(8), undefined],
    ["128 characters", "p".repeat(128), undefined],
    ["128 emoji, counted as one character each", "🔑".repeat(128), undefined],
    ["4 emoji, counted as one character each", "🔑".repeat(4), TOO_SHORT]
  ])("checks %s", (_case, password, expected) => {
    expect(passwordLengthError(password)).toBe(expected);
  });
});

describe("registerFieldOf", () => {
  it.each([
    ["invalid-email", "email"],
    ["email-too-long", "email"],
    ["unmatched-passwords", "confirmPassword"],
    [USERNAME_TOO_SHORT, "username"],
    [TOO_LONG, "password"],
    ["This username is already taken.", "username"],
    ["An account with this E-mail address already exists.", "email"],
    ["This e-mail address's domain can't receive e-mail: check it for typos.", "email"],
    ["error", undefined],
    ["Registration failed.", undefined]
  ])("puts %j under the %s field", (problem, field) => {
    expect(registerFieldOf(problem)).toBe(field);
  });
});

describe("validateRegisterData", () => {
  it("accepts valid data", () => {
    expect(validateRegisterData("vb", "me@example.com", "secret12", "secret12")).toBeUndefined();
  });

  it.each([
    ["a 254 character email", `${"a".repeat(242)}@example.com`],
    ["a subdomain email", "me@mail.example.co.uk"],
    ["an email the API trims", "  Me@Example.com "],
    ["a 254 character email with padding the API trims", `  ${"a".repeat(242)}@example.com  `]
  ])("accepts %s", (_case, email) => {
    expect(validateRegisterData("vb", email, "secret12", "secret12")).toBeUndefined();
  });

  it.each([
    ["an invalid email", ["vb", "not-an-email", "secret12", "secret12"], "invalid-email"],
    [
      "an email without a dot in the domain",
      ["vb", "a@b", "secret12", "secret12"],
      "invalid-email"
    ],
    [
      "an email with an empty domain label",
      ["vb", "a@b..c", "secret12", "secret12"],
      "invalid-email"
    ],
    [
      "an email with a leading domain dot",
      ["vb", "a@.b.c", "secret12", "secret12"],
      "invalid-email"
    ],
    [
      "an email with a trailing domain dot",
      ["vb", "a@b.c.", "secret12", "secret12"],
      "invalid-email"
    ],
    [
      "a 255 character email",
      ["vb", `${"a".repeat(243)}@example.com`, "secret12", "secret12"],
      "email-too-long"
    ],
    [
      "an email that only grows past 254 characters when lowercased",
      ["vb", `İ${"a".repeat(241)}@example.com`, "secret12", "secret12"],
      "email-too-long"
    ],
    ["a long malformed email", ["vb", "a".repeat(300), "secret12", "secret12"], "invalid-email"],
    ["a too short username", [" v ", "me@example.com", "secret12", "secret12"], USERNAME_TOO_SHORT],
    [
      "a too long username",
      ["v".repeat(17), "me@example.com", "secret12", "secret12"],
      USERNAME_TOO_LONG
    ],
    ["a too short password", ["vb", "me@example.com", "1234567", "1234567"], TOO_SHORT],
    ["a too long password", ["vb", "me@example.com", "p".repeat(129), "p".repeat(129)], TOO_LONG],
    [
      "mismatched passwords",
      ["vb", "me@example.com", "secret12", "secret123"],
      "unmatched-passwords"
    ]
  ] as const)("rejects %s", (_case, [username, email, password, confirm], expected) => {
    expect(validateRegisterData(username, email, password, confirm)).toBe(expected);
  });
});

describe("register", () => {
  let fetchMock: ReturnType<typeof mockFetch>;

  beforeEach(() => {
    fetchMock = mockFetch();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("asks the API to mail a code, which answers 202 before any account exists", async () => {
    registerStatus.value = "Email already taken.";
    fetchMock.mockResolvedValueOnce(
      jsonResponse(202, { message: "A confirmation code was sent to me@example.com." })
    );

    await expect(register("vb", "me@example.com", "password")).resolves.toEqual({ sent: true });

    expect(fetchMock).toHaveBeenCalledWith("https://api.test/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "vb", email: "me@example.com", password: "password" })
    });
    expect(registerStatus.value).toBe("");
  });

  it.each([
    [400, "Disposable (temporary) e-mail addresses can't be used: use a permanent one.", "email"],
    [400, "This e-mail address's domain can't receive e-mail: check it for typos.", "email"],
    [400, "The password's too short: it must be between 8 and 128 characters.", "password"],
    [409, "An account with this E-mail address already exists.", "email"],
    [409, "This username is already taken.", "username"],
    // These name e-mails, but aren't the address's fault.
    [429, "Too many e-mails requested: try again later.", undefined],
    [503, "The e-mail couldn't be sent: please try again later.", undefined]
  ])("shows the API's message for a %i response: %s", async (status, error, field) => {
    fetchMock.mockResolvedValueOnce(jsonResponse(status, { error }));

    await expect(register("vb", "me@example.com", "password")).resolves.toEqual(
      field ? { sent: false, field } : { sent: false }
    );
    expect(registerStatus.value).toBe(error);
  });

  it("passes on the cooldown's retryAfter, since the code sent then still works", async () => {
    const error = "A code was sent just now: wait 42 seconds before requesting another one.";
    fetchMock.mockResolvedValueOnce(jsonResponse(429, { error, retryAfter: 41.5 }));

    await expect(register("vb", "me@example.com", "password")).resolves.toEqual({
      sent: false,
      retryAfter: 42
    });
    expect(registerStatus.value).toBe(error);
  });

  it("ignores a retryAfter on anything but a 429", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(503, { error: "The e-mail couldn't be sent.", retryAfter: 42 })
    );

    await expect(register("vb", "me@example.com", "password")).resolves.toEqual({ sent: false });
  });

  it("falls back to a generic error when the body has no message", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(400, {}));

    await expect(register("vb", "me@example.com", "password")).resolves.toEqual({ sent: false });
    expect(registerStatus.value).toBe("error");
  });

  it("falls back to a generic error when the body is not JSON", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(500));

    await expect(register("vb", "me@example.com", "password")).resolves.toEqual({ sent: false });
    expect(registerStatus.value).toBe("error");
  });

  it("treats an unreachable API as an error", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));

    await expect(register("vb", "me@example.com", "password")).resolves.toEqual({ sent: false });
    expect(registerStatus.value).toBe("error");
  });
});
