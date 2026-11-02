/**
 * The site's own texts about API calls, like the API's `Responses`: the API's `{ error }` message is
 * shown when it sends one, these otherwise. A `failure` text is followed by the status
 * (e.g. "Failed to load paste: 500"), see `errorMessageFrom`.
 */
export class Messages {
  /** The request never got an answer: offline, DNS, CORS or the API is down. */
  static readonly connectionError: string = "Error connecting to server";
  /** The caller aborted the request, e.g. a check that newer typing replaced; never shown. */
  static readonly requestAborted: string = "The request was aborted";

  static readonly Pastebin = class {
    static readonly loadFailed: string = "Failed to load paste";
    static readonly invalidLink: string = "That isn't a valid paste link.";
    static readonly languageChangeFailed: string = "Failed to change the language";
    static readonly createFailed: string = "Failed to create paste";
    static readonly listFailed: string = "Failed to load your pastes";
    static readonly deleteFailed: string = "Failed to delete paste";
    static tooShort(min: number): string {
      return `A paste needs at least ${min} characters.`;
    }
    static tooLong(max: number): string {
      return `A paste can be at most ${max} characters.`;
    }
  };

  /** Logging in, registering and resetting a password. */
  static readonly Auth = class {
    static readonly userFailed: string = "Failed to load the user";
    static readonly loginFailed: string = "Failed to log in";
    /** Shown when logging in fails without the API's message. */
    static readonly loginUnknownError: string =
      "An unknown error occurred. Please try again later.";
    static readonly sessionNotKept: string =
      "Login succeeded, but your browser didn't keep the session. Please check that cookies are enabled.";
    static readonly logoutFailed: string = "Failed to log out";
    static readonly registerFailed: string = "Failed to register";
    /** Shown when registering fails without the API's message. */
    static readonly registerUnknownError: string = "Registration failed. Please try again.";
    static readonly usernameCheckFailed: string = "Failed to check the username";
    static readonly resetCodeFailed: string = "Failed to send the code";
    static readonly passwordResetFailed: string = "Failed to reset the password";
    static readonly invalidEmail: string = "Enter a valid e-mail address.";
    static emailTooLong(max: number): string {
      return `Your e-mail address can't be longer than ${max} characters.`;
    }
    static usernameTooShort(min: number, max: number): string {
      return `The username's too short: it must be between ${min} and ${max} characters.`;
    }
    static usernameTooLong(min: number, max: number): string {
      return `The username's too long: it must be between ${min} and ${max} characters.`;
    }
    static passwordTooShort(min: number, max: number): string {
      return `The password's too short: it must be between ${min} and ${max} characters.`;
    }
    static passwordTooLong(min: number, max: number): string {
      return `The password's too long: it must be between ${min} and ${max} characters.`;
    }
  };

  /** The mailed codes that confirm an address. */
  static readonly EmailCode = class {
    static readonly confirmFailed: string = "Failed to confirm the code";
    static readonly resendFailed: string = "Failed to send a new code";
    /** The cooldown's own message names its seconds, which would freeze next to the countdown. */
    static readonly cooldown: string =
      "A code was sent just now. You can send another once the countdown ends.";
    static invalid(digits: number): string {
      return `Enter the ${digits}-digit code from the e-mail.`;
    }
  };
}
