import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { jsonResponse, mockFetch } from "@/__tests__/helpers/fetch";
import {
  checkUsername,
  confirmationCodeEarlyError,
  confirmationCodeError,
  emailError,
  emailShapeError,
  passwordEarlyError,
  passwordError,
  passwordLengthError,
  passwordMatchEarlyError,
  passwordMatchError,
  register,
  registerFieldOf,
  registerStatus,
  requiredError,
  usernameEarlyError,
  usernameError,
  usernameLengthError
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

const INVALID_EMAIL = "Enter a valid e-mail address.";
const EMAIL_TOO_LONG = "Your e-mail address can't be longer than 254 characters.";
const LOCAL_PART_TOO_LONG =
  "The part of your e-mail address before the @ can't be longer than 64 characters.";
const CODE = "Enter the 6-digit code from the e-mail.";

/** Three 63 character labels before example.com, like the API's tests, so a long address has a short local part. */
const LONG_DOMAIN = `${`${"b".repeat(63)}.`.repeat(3)}example.com`;
const addressOfLength = (length: number) =>
  `${"a".repeat(length - LONG_DOMAIN.length - 1)}@${LONG_DOMAIN}`;

describe("emailError", () => {
  it.each([
    ["an address", "me@example.com"],
    ["a subdomain address", "me@mail.example.co.uk"],
    ["a dotted local part", "first.last@example.com"],
    ["a +tag", "me+tag@example.com"],
    ["the other characters an atom allows", "a!#$%&'*/=?^_`{|}~-b@example.com"],
    ["a hyphen inside a domain label", "me@my-mail.example.com"],
    ["a 63 character domain label", `me@${"b".repeat(63)}.com`],
    ["a 64 character local part", `${"a".repeat(64)}@example.com`],
    ["a 254 character address", addressOfLength(254)],
    ["an address the API trims and lowercases", "  Me@Example.COM "],
    ["a 254 character address with padding the API trims", `  ${addressOfLength(254)}  `],
    ["an address that's plain once lowercased", "Ke@example.com"]
  ])("accepts %s", (_case, email) => {
    expect(emailError(email)).toBe("");
  });

  it.each([
    ["an empty field", "", INVALID_EMAIL],
    ["an invalid address", "not-an-email", INVALID_EMAIL],
    ["two @ signs", "a@@example.com", INVALID_EMAIL],
    ["an address without a dot in the domain", "a@b", INVALID_EMAIL],
    ["an address with an empty domain label", "a@b..c", INVALID_EMAIL],
    ["an address with a leading domain dot", "a@.b.c", INVALID_EMAIL],
    ["an address with a trailing domain dot", "a@b.c.", INVALID_EMAIL],
    ["a quoted local part", '"x"@example.com', INVALID_EMAIL],
    ["two dots in a row in the local part", "x..y@example.com", INVALID_EMAIL],
    ["a leading dot in the local part", ".x@example.com", INVALID_EMAIL],
    ["a trailing dot in the local part", "x.@example.com", INVALID_EMAIL],
    ["a space inside", "x y@example.com", INVALID_EMAIL],
    ["a trailing comment", "x@example.com(c)", INVALID_EMAIL],
    ["a display name", "n<x@example.com>", INVALID_EMAIL],
    ["a second address after a comma", "x@example.com,y", INVALID_EMAIL],
    ["a comma in the local part", "a,b@example.com", INVALID_EMAIL],
    ["an IP literal domain", "x@[192.168.0.1]", INVALID_EMAIL],
    ["a leading hyphen in a domain label", "x@-example.com", INVALID_EMAIL],
    ["a trailing hyphen in a domain label", "x@example-.com", INVALID_EMAIL],
    ["a domain label over 63 characters", `x@${"b".repeat(64)}.com`, INVALID_EMAIL],
    ["an underscore in the domain", "x@my_mail.example.com", INVALID_EMAIL],
    ["a non-ASCII character", "józsef@example.com", INVALID_EMAIL],
    ["a long malformed address", "a".repeat(300), INVALID_EMAIL],
    ["a 65 character local part", `${"a".repeat(65)}@example.com`, LOCAL_PART_TOO_LONG],
    ["a 255 character address", addressOfLength(255), EMAIL_TOO_LONG],
    [
      "a too long local part in a too long address, naming the local part",
      `${"a".repeat(243)}@example.com`,
      LOCAL_PART_TOO_LONG
    ]
  ])("rejects %s", (_case, email, expected) => {
    expect(emailError(email)).toBe(expected);
  });
});

describe("emailShapeError", () => {
  it.each([
    ["me@example.com", ""],
    [" a@b ", ""],
    // Registered before the API took only plain addresses: it still logs in.
    ['"x"@example.com', ""],
    [`${"a".repeat(65)}@example.com`, ""],
    ["", INVALID_EMAIL],
    ["me", INVALID_EMAIL],
    ["me@", INVALID_EMAIL],
    ["m e@example.com", INVALID_EMAIL]
  ])("checks %j", (email, expected) => {
    expect(emailShapeError(email)).toBe(expected);
  });
});

describe("the username checks", () => {
  it.each([
    ["vb", "", ""],
    [" v ", USERNAME_TOO_SHORT, ""],
    ["v".repeat(17), USERNAME_TOO_LONG, USERNAME_TOO_LONG]
  ])("check %j", (username, full, early) => {
    expect(usernameError(username)).toBe(full);
    expect(usernameEarlyError(username)).toBe(early);
  });
});

describe("the password checks", () => {
  it.each([
    ["secret12", "", ""],
    ["1234567", TOO_SHORT, ""],
    ["p".repeat(129), TOO_LONG, TOO_LONG],
    ["🔑".repeat(128), "", ""]
  ])("check %j", (password, full, early) => {
    expect(passwordError(password)).toBe(full);
    expect(passwordEarlyError(password)).toBe(early);
  });
});

describe("the password match checks", () => {
  const UNMATCHED = "The two passwords don't match.";

  it.each([
    ["secret12", "secret12", "", ""],
    ["secret12", "secret1", UNMATCHED, ""],
    ["secret12", "secret13", UNMATCHED, UNMATCHED],
    ["secret12", "secret123", UNMATCHED, UNMATCHED],
    ["🔑🔑", "🔑a", UNMATCHED, UNMATCHED]
  ])("check %j against %j", (password, confirm, full, early) => {
    expect(passwordMatchError(password, confirm)).toBe(full);
    expect(passwordMatchEarlyError(password, confirm)).toBe(early);
  });
});

describe("requiredError", () => {
  it("only complains about an empty value", () => {
    expect(requiredError("", "Enter it.")).toBe("Enter it.");
    expect(requiredError("x", "Enter it.")).toBe("");
  });
});

describe("the confirmation code checks", () => {
  it.each([
    ["123456", "", ""],
    ["123 456", "", ""],
    ["", CODE, ""],
    ["12345", CODE, ""],
    ["12345a", CODE, CODE],
    ["1234567", CODE, CODE]
  ])("check %j", (code, full, early) => {
    expect(confirmationCodeError(code)).toBe(full);
    expect(confirmationCodeEarlyError(code)).toBe(early);
  });
});

describe("checkUsername", () => {
  let fetchMock: ReturnType<typeof mockFetch>;

  beforeEach(() => {
    fetchMock = mockFetch();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it.each([
    [true, "free"],
    [false, "taken"]
  ])("asks the API, which answers available: %s", async (available, expected) => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { available }));
    const { signal } = new AbortController();

    await expect(checkUsername("Anna B", signal)).resolves.toBe(expected);

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.test/auth/username-available?username=Anna+B",
      { method: "GET", signal }
    );
  });

  it.each([
    ["a 404 from an API without the endpoint", () => jsonResponse(404, { error: "Not found" })],
    [
      "a 429",
      () =>
        jsonResponse(429, {
          error: "Too many username checks requested: try again later.",
          retryAfter: 60
        })
    ],
    ["an answer without a verdict", () => jsonResponse(200, {})],
    ["a body that isn't JSON", () => jsonResponse(200)]
  ])("can't tell after %s", async (_case, response) => {
    fetchMock.mockResolvedValueOnce(response());
    await expect(checkUsername("anna")).resolves.toBe("unknown");
  });

  it("can't tell when the request fails", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await expect(checkUsername("anna")).resolves.toBe("unknown");
  });

  it("can't tell when newer typing aborted it, and doesn't log that", async () => {
    const request = new AbortController();
    fetchMock.mockImplementationOnce(() => {
      request.abort();
      return Promise.reject(new DOMException("Aborted", "AbortError"));
    });

    await expect(checkUsername("anna", request.signal)).resolves.toBe("unknown");
    expect(console.error).not.toHaveBeenCalled();
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
      jsonResponse(202, {
        message:
          "A confirmation code was sent to me@example.com: send it to POST /auth/register/verify to finish registering."
      })
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
    // Every rate limiter's 429 says how long to wait (vb2007/vb2007.hu-api#242).
    const wait = status === 429 ? { retryAfter: 3600 } : {};
    fetchMock.mockResolvedValueOnce(jsonResponse(status, { error, ...wait }));

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

  it("leaves out a rate limiter's retryAfter, since it sent no code", async () => {
    const error = "Too many e-mails requested: try again later.";
    fetchMock.mockResolvedValueOnce(jsonResponse(429, { error, retryAfter: 3600 }));

    await expect(register("vb", "me@example.com", "password")).resolves.toEqual({ sent: false });
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
