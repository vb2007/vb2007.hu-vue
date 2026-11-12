import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { jsonResponse, mockFetch } from "@/__tests__/helpers/fetch";
import {
  checkUsername,
  confirmationCodeEarlyError,
  confirmationCodeError,
  emailError,
  emailMissingError,
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
  usernameError
} from "@/scripts/authentication/register";

afterEach(() => {
  registerStatus.value = "";
});

const TOO_SHORT = "The password's too short: it must be between 8 and 128 characters.";
const TOO_LONG = "The password's too long: it must be between 8 and 128 characters.";
const USERNAME_TOO_SHORT = "The username's too short: it must be between 2 and 16 characters.";
const USERNAME_TOO_LONG = "The username's too long: it must be between 2 and 16 characters.";

const USERNAME_INVALID =
  "The username has invalid characters: it can't contain invisible or control characters, or whitespace other than spaces. If you pasted it, type it again by hand: a pasted space can be a no-break space.";

/** Tag characters spelling `text`, as in a subdivision flag. */
const emojiTags = (text: string) =>
  [...text].map((character) => String.fromCodePoint(0xe0000 + character.charCodeAt(0))).join("");
const subdivisionFlag = (code: string) => `\u{1F3F4}${emojiTags(code)}\u{E007F}`;

// The API's own cases (vb2007/vb2007.hu-api#319, #470, #478), with fixed names in place of its
// random ones.
describe("the username checks", () => {
  it.each([
    ["2 characters", "vb"],
    ["16 characters", "v".repeat(16)],
    ["16 characters padded with spaces", `  ${"v".repeat(16)}  `],
    ["an inner space", "Rv a1b2c"],
    ["accents", "R\u00e9a1b2c\u00e1"],
    ["an emoji", "\u{1F600}a1b2c"],
    ["emoji presentation selectors", "\u2764\ufe0f\u2764\ufe0ea1b2c"],
    ["a heart emoji", "\u2764\ufe0fl9a1b2c"],
    ["a keycap emoji", "1\ufe0f\u20e3l9a1b2c"],
    ["two emoji", "\u{1F600}\u{1F600}"],
    ["a decomposed \u00e9 after a letter", "ae\u0301"],
    ["a family emoji", "\u{1F468}\u200d\u{1F469}\u200d\u{1F467}abc"],
    ["a rainbow flag emoji", "\u{1F3F3}\ufe0f\u200d\u{1F308}abc"],
    ["a skin tone and hair emoji", "\u{1F468}\u{1F3FD}\u200d\u{1F9B0}abc"],
    ["a technologist emoji", "\u{1F9D1}\u200d\u{1F4BB}abc"],
    ["an eye in speech bubble emoji", "\u{1F441}\ufe0f\u200d\u{1F5E8}\ufe0fabc"],
    // A joiner counts toward the minimum, but a valid one always sits between two emoji.
    ["two joined emoji", "\u{1F468}\u200d\u{1F469}"],
    ["the England flag", `${subdivisionFlag("gbeng")}\u4e00\u4e01`],
    ["the Scotland flag", `${subdivisionFlag("gbsct")}\u4e00\u4e01`],
    ["the Wales flag", `${subdivisionFlag("gbwls")}\u4e00\u4e01`],
    ["a flag after a letter", `\u4e00\u4e01${subdivisionFlag("gbeng")}`],
    ["a shorter subdivision flag", `${subdivisionFlag("usca")}\u4e00\u4e01\u4e02\u4e03`],
    ["a presentation selector after a flag", `${subdivisionFlag("gbeng")}\ufe0f\u4e00`],
    ["a presentation selector after the Wales flag", `${subdivisionFlag("gbwls")}\ufe0f\u4e00`],
    ["a presentation selector after the Scotland flag", `${subdivisionFlag("gbsct")}\ufe0f\u4e00`],
    // The tags count toward the maximum: a 5 tag run makes a flag 14 units, so 2 more fit.
    ["a flag with a 5 tag run and 2 more characters", `${subdivisionFlag("gbeng")}ab`],
    // Trimmed first, like the API: only whitespace inside the name counts.
    ["a tab and non-breaking spaces at the ends", "\u00a0\tRv\u00a0"],
    ["a byte order mark at the start", "\ufeffRv"]
  ])("take a name with %s", (_case, username) => {
    expect(usernameError(username)).toBe("");
    expect(usernameEarlyError(username)).toBe("");
  });

  it.each([
    ["only word joiners", "\u2060\u2060"],
    ["a zero-width space", "a\u200b"],
    ["a tab inside", "Rv\tBase"],
    ["a line break inside", "Rv\nBase"],
    ["a non-breaking space inside", "Rv\u00a0Base"],
    ["a byte order mark inside", "R\ufeffv"],
    ["a control character", "Rv\u0007Base"],
    ["a lone zero-width joiner", "\u200d\u200d"],
    ["a zero-width joiner between letters", "a\u200db"],
    ["a zero-width joiner between digits", "1\u200d2"],
    ["a zero-width joiner between an emoji and a letter", "\u{1F468}\u200da"],
    ["a zero-width joiner between a letter and an emoji", "a\u200d\u{1F469}"],
    ["a leading zero-width joiner", "\u200d\u{1F468}\u{1F469}"],
    ["a trailing zero-width joiner", "\u{1F468}\u{1F469}\u200d"],
    ["a doubled zero-width joiner", "\u{1F468}\u200d\u200d\u{1F469}"],
    ["a zero-width joiner after a presentation selector of a letter", "a\ufe0f\u200d\u{1F469}"],
    ["a stray tag", "ab\u{E0067}"],
    ["a stray tag run", `ab${emojiTags("gbeng")}`],
    ["a lone cancel tag", "ab\u{E007F}"],
    ["a tag run without the cancel tag", `\u{1F3F4}${emojiTags("gbeng")}ab`],
    ["a tag run before the black flag", `${emojiTags("gbeng")}\u{E007F}ab`],
    ["a tag run after a letter", `a${emojiTags("gbeng")}\u{E007F}`],
    ["a tag run after another emoji", `\u{1F600}${emojiTags("gbeng")}\u{E007F}`],
    ["a tag run after a presentation selector", `\u{1F3F4}\ufe0f${emojiTags("gbeng")}\u{E007F}`],
    ["a tag run after a flag", `${subdivisionFlag("abc")}${emojiTags("gb")}`],
    ["a doubled cancel tag", `${subdivisionFlag("gbe")}\u{E007F}ab`],
    ["a zero-width joiner after a flag", `${subdivisionFlag("gbe")}\u200d\u{1F469}`],
    ["a tag run after the pirate flag", `\u{1F3F4}\u200d\u2620\ufe0f${emojiTags("abc")}\u{E007F}`],
    ["a tag run of 1", `\u{1F3F4}${emojiTags("g")}\u{E007F}ab`],
    ["a tag run of 2", `\u{1F3F4}${emojiTags("gb")}\u{E007F}ab`],
    ["a tag run of 6", `\u{1F3F4}${emojiTags("gbengl")}\u{E007F}`],
    ["a tag run of uppercase letters", `\u{1F3F4}${emojiTags("GBENG")}\u{E007F}`],
    ["a tag run with a hyphen", `\u{1F3F4}${emojiTags("gb-en")}\u{E007F}`],
    ["an empty tag run", "\u{1F3F4}\u{E007F}ab"],
    ["a zero-width non-joiner", "ab\u200c"],
    ["only braille blanks", "\u2800\u2800"],
    ["only Hangul fillers", "\u3164\u3164"],
    ["a cantillation mark the collation ignores", "a\u0591"],
    ["a tatweel", "a\u0640"],
    ["a private-use character", "ab\ue000"],
    ["an unassigned code point", "ab\u{50000}"],
    ["a noncharacter", "ab\uffff"],
    ["a lone surrogate", "a\ud83d"],
    ["another variation selector", "ab\u{E0100}"],
    ["a presentation selector after a letter", "ab\ufe0f"],
    ["two presentation selectors after a letter", "ab\ufe0f\ufe0f"],
    ["two presentation selectors after an emoji", "\u2764\ufe0f\ufe0fab"],
    // Invalid characters come before the minimum, like the API.
    ["one invalid character", "\u200b"]
  ])("refuse a name with %s, while typing too", (_case, username) => {
    expect(usernameError(username)).toBe(USERNAME_INVALID);
    expect(usernameEarlyError(username)).toBe(USERNAME_INVALID);
  });

  it.each([
    ["an empty name", ""],
    ["1 character", "v"],
    ["1 character padded with spaces", "  a  "],
    ["only combining marks", "\u0301\u0301"],
    ["three combining marks", "\u0300\u0301\u0302"],
    ["a decomposed \u00e9", "e\u0301"],
    ["one letter and 14 combining marks", `a${"\u0301".repeat(14)}`],
    ["one emoji letter and a presentation selector", "\u2764\ufe0f"],
    ["a lone emoji", "\u{1F600}"],
    ["a lone supplementary CJK character", "\u{20000}"],
    // A flag's tags don't count toward the minimum, nor does a presentation selector after it.
    ["a lone subdivision flag", subdivisionFlag("gbeng")],
    ["a lone subdivision flag and a presentation selector", `${subdivisionFlag("gbeng")}\ufe0f`]
  ])("call %s too short, only once it's left", (_case, username) => {
    expect(usernameError(username)).toBe(USERNAME_TOO_SHORT);
    expect(usernameEarlyError(username)).toBe("");
  });

  it.each([
    ["17 characters", "v".repeat(17)],
    // The maximum counts UTF-16 units, like the API: 9 emoji are 18.
    ["9 emoji", "\u{1F600}".repeat(9)],
    // Joiners and tags count too: a family emoji is 8 units, a flag with a 5 tag run 14.
    ["a family emoji and 9 letters", `\u{1F468}\u200d\u{1F469}\u200d\u{1F467}${"v".repeat(9)}`],
    ["a flag with a 5 tag run and 3 more characters", `${subdivisionFlag("gbeng")}abc`],
    // The maximum comes first, before the invalid characters.
    ["17 characters with a tab inside", `v\t${"v".repeat(15)}`]
  ])("call %s too long, while typing too", (_case, username) => {
    expect(usernameError(username)).toBe(USERNAME_TOO_LONG);
    expect(usernameEarlyError(username)).toBe(USERNAME_TOO_LONG);
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
    [USERNAME_INVALID, "username"],
    [TOO_LONG, "password"],
    ["This username is already taken.", "username"],
    ["An account with this E-mail address already exists.", "email"],
    ["This e-mail address's domain can't receive e-mail: check it for typos.", "email"],
    ["error", undefined],
    ["Registration failed.", undefined],
    // The API's messages for missing fields name several: none of them is the one at fault.
    ["You must provide a username, E-mail address, and a password.", undefined],
    [
      "You must provide an E-mail address, the confirmation code, a username and a password.",
      undefined
    ]
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

describe("emailMissingError", () => {
  it.each([
    ["me@example.com", ""],
    [" a@b ", ""],
    // Whatever the API once stored still logs in, and it answers for the rest.
    ["a@b@example.com", ""],
    ["me", ""],
    ["m e@example.com", ""],
    ['"x"@example.com', ""],
    [`${"a".repeat(65)}@example.com`, ""],
    ["", INVALID_EMAIL],
    ["   ", INVALID_EMAIL]
  ])("only asks for %j to be there", (email, expected) => {
    expect(emailMissingError(email)).toBe(expected);
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
    ["an answer without a verdict", () => jsonResponse(200, {})],
    ["a body that isn't JSON", () => jsonResponse(200)]
  ])("can't tell after %s", async (_case, response) => {
    fetchMock.mockResolvedValueOnce(response());
    await expect(checkUsername("anna")).resolves.toBe("unknown");
  });

  it("can't tell after a 400 for a name the API refuses, and doesn't log it", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(400, { error: USERNAME_INVALID }));

    await expect(checkUsername("a\u0640")).resolves.toBe("unknown");
    expect(console.error).not.toHaveBeenCalled();
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

  describe("over the API's limit", () => {
    const LIMITED = "Too many username checks requested: try again later.";

    // The pause is the module's own, so each test starts a day after the last one's.
    let day = 0;
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(Date.UTC(2030, 0, 1) + ++day * 86_400_000);
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("can't tell after a 429, doesn't log it, and asks nothing until its retryAfter passed", async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse(429, { error: LIMITED, retryAfter: 42 }));

      await expect(checkUsername("anna")).resolves.toBe("unknown");
      expect(console.error).not.toHaveBeenCalled();

      vi.advanceTimersByTime(41_999);
      await expect(checkUsername("anne")).resolves.toBe("unknown");
      expect(fetchMock).toHaveBeenCalledOnce();

      vi.advanceTimersByTime(1);
      fetchMock.mockResolvedValueOnce(jsonResponse(200, { available: true }));
      await expect(checkUsername("anne")).resolves.toBe("free");
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it("pauses for a minute after a 429 without a retryAfter", async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse(429, { error: LIMITED }));

      await expect(checkUsername("anna")).resolves.toBe("unknown");
      vi.advanceTimersByTime(59_999);
      await expect(checkUsername("anna")).resolves.toBe("unknown");
      expect(fetchMock).toHaveBeenCalledOnce();

      vi.advanceTimersByTime(1);
      fetchMock.mockResolvedValueOnce(jsonResponse(200, { available: false }));
      await expect(checkUsername("anna")).resolves.toBe("taken");
    });
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
    [409, "This username is already taken.", "username"],
    // This names e-mails, but isn't the address's fault.
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
    fetchMock.mockResolvedValueOnce(
      jsonResponse(429, { error, retryAfter: 41.5, reason: "resendCooldown" })
    );

    await expect(register("vb", "me@example.com", "password")).resolves.toEqual({
      sent: false,
      retryAfter: 42
    });
    expect(registerStatus.value).toBe(error);
  });

  it.each([
    ["the mail limit", "Too many e-mails requested: try again later.", 3412],
    ["the failed attempts limit", "Too many failed attempts: try again later.", 900]
  ])("doesn't take %s's 429 for the cooldown: no code went out", async (_, error, retryAfter) => {
    fetchMock.mockResolvedValueOnce(jsonResponse(429, { error, retryAfter }));

    // Nothing was sent, so there's no code step and no field to blame: only a wait.
    await expect(register("vb", "me@example.com", "password")).resolves.toEqual({
      sent: false,
      limitedFor: retryAfter
    });
    expect(registerStatus.value).toBe(error);
  });

  it("doesn't take a limiter's 429 for the cooldown by its text, only by its reason", async () => {
    const error = "A code was sent just now: wait 42 seconds before requesting another one.";
    fetchMock.mockResolvedValueOnce(jsonResponse(429, { error, retryAfter: 42 }));

    await expect(register("vb", "me@example.com", "password")).resolves.toEqual({
      sent: false,
      limitedFor: 42
    });
  });

  it("waits a minute after a rate limiter's 429 without a retryAfter", async () => {
    const error = "Too many e-mails requested: try again later.";
    fetchMock.mockResolvedValueOnce(jsonResponse(429, { error }));

    await expect(register("vb", "me@example.com", "password")).resolves.toEqual({
      sent: false,
      limitedFor: 60
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
