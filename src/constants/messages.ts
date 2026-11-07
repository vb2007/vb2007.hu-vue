import { SITE_LOCALE } from "@/constants/locale";
import { formatWait, type WaitUnits } from "@/scripts/utility/durationUtil";
import type { RateLimitName } from "@/types/api/admin";

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
  /**
   * A submit key held after a rate limiter's 429 (see `useRetryHold`), counting its `retryAfter`
   * down. The key's own verb would read as a promise ("Delete account in 15 min"), so it says this.
   * `units: "long"` spells the units out for the key's accessible name ("Try again in 15 minutes").
   */
  static tryAgainIn(seconds: number, units: WaitUnits = "short"): string {
    return `Try again in ${formatWait(seconds, SITE_LOCALE, units)}`;
  }
  /**
   * The held key's wait in words, read out with the 429's message ("Try again in 23 hours 45
   * minutes."): the counting key is disabled, so a screen reader would never reach it. It's fixed
   * when the hold starts, so it's only in the message for screen readers, not shown beside the key.
   */
  static tryAgainSpoken(seconds: number): string {
    return `${this.tryAgainIn(seconds, "long")}.`;
  }

  static readonly ShortUrl = class {
    static readonly invalidUrl: string = "Invalid URL / URI format.";
    /** Names the length too, so a pasted link shows how much has to go. */
    static tooLong(length: number, max: number): string {
      return `This URL is ${length.toLocaleString()} characters; the limit is ${max.toLocaleString()}.`;
    }
    static readonly shortenFailed: string = "Failed to shorten URL";
    /** Only logged: the page shows the API's error, or falls back to the API's own redirect. */
    static readonly lookupFailed: string = "Failed to resolve short link";
    static readonly listFailed: string = "Failed to load your short links";
    static readonly deleteFailed: string = "Failed to delete short link";
    /** Announced to screen readers once a link is deleted, since its row and key are gone. */
    static deleted(code: string): string {
      return `Deleted ${code}.`;
    }
  };

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
    /**
     * The API's 429 after too many failed logins (vb2007/vb2007.hu-api#204), with the wait in whole
     * minutes; 0 or less means the API sent no usable `retryAfter`. GitHub login isn't locked out,
     * but only gets into an account it's linked to.
     */
    static loginLockedOut(minutes: number): string {
      const wait = minutes <= 0 ? "later" : minutes === 1 ? "in a minute" : `in ${minutes} minutes`;
      return `Too many failed attempts. Try again ${wait}, or log in with GitHub below if it's linked to your account.`;
    }
    /**
     * The API's 403 to a request without a working session (its `Responses.notLoggedIn`): none was
     * sent, or it ended. Other 403s (a wrong password, not the owner) have their own texts, so only
     * this one tells the page it's logged out (see `onSessionRefused`).
     */
    static readonly notLoggedIn: string = "You must be logged in to perform this action.";
    /** The API turned away a session the page had: expired, ended by a reset, or replaced. */
    static readonly sessionEnded: string =
      "Your session ended, so you're logged out: it expired, the password was reset, or the account was logged in or out elsewhere. Log in again to see your account.";
    /**
     * GitHub login's `?oauthError=accountSuspended` (vb2007/vb2007.hu-api#273): the GitHub account
     * is linked to a suspended one. A password login gets the API's own 403 text instead.
     */
    static readonly githubAccountSuspended: string =
      "The account linked to this GitHub account is suspended: it can't log in until the superuser lifts the suspension.";
    static readonly logoutFailed: string = "Failed to log out";
    static readonly registerFailed: string = "Failed to register";
    /** Shown when registering fails without the API's message. */
    static readonly registerUnknownError: string = "Registration failed. Please try again.";
    static readonly usernameCheckFailed: string = "Failed to check the username";
    /** `GET /auth/username-available` said the typed name is taken. */
    static readonly usernameTaken: string = "That username is taken: pick another one.";
    /**
     * The code step's 409 for a name taken since registering: the code works with another, unless
     * it expired or ran out of tries meanwhile (each confirmation spends one).
     */
    static usernameTakenMeanwhile(minutes: number): string {
      return `That username was taken in the meantime: pick another one. Your code works for up to ${minutes} minutes after it was sent.`;
    }
    /**
     * The code step's 409 for an address that has an account: the waiting registration is gone.
     * GitHub login only reaches an account that uses GitHub; resetting the password works for
     * every account, and gives one made with GitHub a password.
     */
    static readonly accountExists: string =
      "An account already uses this address. Log in instead (with GitHub if that's how you signed up), or reset the password from the log-in page.";
    static readonly resetCodeFailed: string = "Failed to send the code";
    static readonly passwordResetFailed: string = "Failed to reset the password";
    /**
     * Back on an address whose reset code is still recent, with no message of the API's to show
     * again (e.g. after a reload). Worded like the API's `passwordResetSent`, without its "just now",
     * since nothing was asked for.
     */
    static readonly resetCodeRecent: string =
      "If an account uses this address, a password reset code was sent to it in the last minute: use the latest one.";
    /**
     * The API's `passwordResetSent` once its minute is over (the resend countdown ended), when it
     * would no longer be true: a code went out, and a later one may have followed.
     */
    static readonly resetCodeSent: string =
      "If an account uses this address, a password reset code was sent to it: use the latest one.";
    /** A reset link whose token can't be one the API mailed. */
    static readonly resetLinkMalformed: string =
      "This reset link isn't complete or was changed: request a new one.";
    /** The API's 400 for a reset link that's used up (its `invalidPasswordResetLink`). */
    static readonly resetLinkRefused: string =
      "The reset link is wrong, expired or already used: request a new one.";
    /** After the API's 429 on a reset link, which doesn't use the link up. */
    static resetLinkStillWorks(validMinutes: number): string {
      return `The link wasn't used up: it works until ${validMinutes} minutes after it was sent.`;
    }
    static readonly invalidEmail: string = "Enter a valid e-mail address.";
    /** An account's own password left out where it's asked for: logging in, or confirming it's them. */
    static readonly passwordMissing: string = "Enter your password.";
    static emailTooLong(max: number): string {
      return `Your e-mail address can't be longer than ${max} characters.`;
    }
    static emailLocalPartTooLong(max: number): string {
      return `The part of your e-mail address before the @ can't be longer than ${max} characters.`;
    }
    static usernameTooShort(min: number, max: number): string {
      return `The username's too short: it must be between ${min} and ${max} characters.`;
    }
    static usernameTooLong(min: number, max: number): string {
      return `The username's too long: it must be between ${min} and ${max} characters.`;
    }
    /** The hint under every new-password field, and the admin's new username field. */
    static lengthHint(min: number, max: number): string {
      return `${min} to ${max} characters.`;
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
    /**
     * How the API's 429 starts when a code went out less than a minute ago (its
     * `EmailCodes.resendTooSoon`); the rate limiters' 429s send `retryAfter` too, but no code went.
     */
    static readonly cooldownPrefix: string = "A code was sent just now:";
    /** The cooldown's own message names its seconds, which would freeze next to the countdown. */
    static readonly cooldown: string =
      "A code was sent just now. You can send another once the countdown ends.";
    /**
     * Under a code checks' hold longer than their window: the daily cap of wrong codes, which
     * counts per address, so a new code would be refused too (see `Limits.Code.failedChecksWindowSeconds`).
     */
    static readonly capped: string =
      "A new code won't help: no code is accepted for this address until the wait ends.";
    static invalid(digits: number): string {
      return `Enter the ${digits}-digit code from the e-mail.`;
    }
    /**
     * The register step's resend key while it waits. Like the two below, `units: "long"` spells
     * the units out for the key's accessible name ("Resend in 57 minutes").
     */
    static resendIn(seconds: number, units: WaitUnits = "short"): string {
      return `Resend in ${formatWait(seconds, SITE_LOCALE, units)}`;
    }
    /** The change e-mail form's key while it waits. */
    static sendCodeIn(seconds: number, units: WaitUnits = "short"): string {
      return `Send code in ${formatWait(seconds, SITE_LOCALE, units)}`;
    }
    /** The password reset's resend key while it waits. */
    static sendAgainIn(seconds: number, units: WaitUnits = "short"): string {
      return `Send again in ${formatWait(seconds, SITE_LOCALE, units)}`;
    }
  };

  /** The logged-in user's account: password, e-mail, GitHub and deleting it. */
  static readonly Account = class {
    static readonly changePasswordFailed: string = "Failed to change password";
    static readonly setPasswordFailed: string = "Failed to set the password";
    /**
     * How the API's 403 starts when GitHub has to confirm it's the user first: before setting a
     * password (vb2007/vb2007.hu-api#183) or deleting an account without one (vb2007/vb2007.hu-api#245).
     */
    static readonly githubReauthPrefix: string = "Confirm it's you first";
    static readonly changeEmailFailed: string = "Failed to change e-mail";
    static readonly confirmEmailFailed: string = "Failed to confirm e-mail";
    /** A rate limiter's 429 without the API's message. */
    static readonly tooManyRequests: string = "Too many requests: try again later.";
    /** Shown when the API's success has no message of its own. */
    static readonly emailUpdated: string = "E-mail address updated.";
    /** Back from linking GitHub to an account with a password (vb2007/vb2007.hu-api#132). */
    static readonly githubLinked: string = "GitHub is linked. You can log in with it from now on.";
    static readonly githubUnlinked: string =
      "GitHub is unlinked. Log in with your password from now on.";
    /** Once an account made with GitHub has set its first password (vb2007/vb2007.hu-api#155). */
    static readonly passwordSet: string =
      "Your password is set. You can log in with it from now on.";
    /** Why GitHub may come first, for an account without a password. */
    static githubReauthNote(minutes: number): string {
      return `If you logged in more than ${minutes} minutes ago, GitHub confirms it's you first.`;
    }
    /** Back from GitHub, which confirmed it's the user, before setting the password. */
    static passwordGithubConfirmed(minutes: number): string {
      return `GitHub confirmed it's you. Set your password within ${minutes} minutes.`;
    }
    /** Back from GitHub, which confirmed it's the user asking to delete (vb2007/vb2007.hu-api#245). */
    static deleteGithubConfirmed(minutes: number): string {
      return `GitHub confirmed it's you. Delete the account within ${minutes} minutes.`;
    }
    static readonly deleteFailed: string = "Failed to delete the account";
    static readonly githubUnlinkFailed: string = "Failed to unlink GitHub";
    static readonly githubLinkFailed: string = "Failed to start linking GitHub";
    /** A 400 that took the waiting change away: its code expired. */
    static codeExpired(address: string): string {
      return `${address} wasn't confirmed: its code expired. Send a new one with Change e-mail.`;
    }
    /** Any other refusal that took the waiting change away. */
    static notConfirmed(address: string, error: string): string {
      return `${address} wasn't confirmed. ${error}`;
    }
  };

  static readonly Uploads = class {
    static readonly listFailed: string = "Failed to load your uploads";
    static readonly usageFailed: string = "Failed to load your storage";
    static readonly renameFailed: string = "Failed to rename upload";
    static readonly visibilityFailed: string = "Failed to change visibility";
    static readonly deleteFailed: string = "Failed to delete upload";
    static readonly uploadFailed: string = "Upload failed";
    /** A finished upload's private link couldn't be signed again. */
    static readonly renewLinkFailed: string = "Failed to renew the link";
    /** On a queue ticket whose file is gone, so no new link will come. */
    static readonly linkFileDeleted: string = "This file was deleted, so its link no longer works.";
    /** On a queue ticket the API won't renew a link for any more, e.g. after the session ended. */
    static readonly linkNotRenewed: string =
      "This link couldn't be renewed. Copy it from Your uploads instead.";
    /** The user stopped the upload; not shown as an error. */
    static readonly cancelled: string = "Cancelled";
    static readonly emptyFile: string = "This file is empty.";
    static readonly unsupportedType: string = "This file type isn't supported.";
    static readonly quotaExceeded: string = "This upload would go over your storage quota.";
    /** `limit` is already formatted, e.g. "10 MB". */
    static tooLarge(limit: string): string {
      return `The file is larger than the ${limit} limit.`;
    }
    static invalidFileName(min: number, max: number): string {
      return `File names must be ${min}–${max} characters, without slashes or control characters.`;
    }
  };

  static readonly Admin = class {
    static readonly usersFailed: string = "Failed to load the users";
    static readonly userFailed: string = "Failed to load the account";
    /** `GET /admin/users/:id`'s 400: the link's ID can't be anyone's. */
    static readonly userInvalidId: string =
      "This link doesn't lead to an account: its ID isn't valid.";
    /** `GET /admin/users/:id`'s 404. */
    static readonly userNotFound: string =
      "There's no account with this ID. It may have been deleted.";
    static readonly quotaFailed: string = "Failed to change the quota";
    static readonly invalidQuota: string = "Enter a size of 0 or more.";
    static readonly quotaTooLarge: string = "That's more than the API can store.";
    static readonly renameFailed: string = "Failed to rename the account";
    static renamed(name: string): string {
      return `Renamed to ${name}.`;
    }
    static readonly logoutFailed: string = "Failed to log the account out";
    static loggedOut(name: string): string {
      return `${name} is logged out everywhere. They can log in again.`;
    }
    static readonly deleteFailed: string = "Failed to delete the account";
    /** On the Users list, once the account's page deleted it. */
    static userDeleted(name: string): string {
      return `${name}'s account is deleted, with its pastes, short links and uploads.`;
    }
    static readonly suspendFailed: string = "Failed to suspend the account";
    static readonly unsuspendFailed: string = "Failed to lift the suspension";
    /** Why the superuser's own page has no Suspend key: the API answers it with 409. */
    static readonly superuserNotSuspendable: string = "The admin's own account can't be suspended.";
    /** `name` is the account's username, when it's known. */
    static userUploadsFailed(name?: string): string {
      return name ? `Failed to load ${name}'s uploads` : "Failed to load this user's uploads";
    }
    static readonly pastesFailed: string = "Failed to load the pastes";
    static readonly shortLinksFailed: string = "Failed to load the short links";
    static readonly uploadsFailed: string = "Failed to load the uploads";

    static readonly pendingRegistrationsFailed: string = "Failed to load the pending registrations";
    static readonly removePendingRegistrationFailed: string =
      "Failed to remove the pending registration";
    static readonly clearRateLimitsFailed: string = "Failed to clear the rate limits";
    /** The API wants an e-mail, an IP or both; it says so too, but nothing is sent without one. */
    static readonly rateLimitTargetMissing: string = "Enter an e-mail address, an IP or both.";
    static readonly invalidIp: string = "That isn't an IPv4 or IPv6 address.";
    /** What each of the API's rate limiters counts, for the notice of what was cleared. */
    static readonly rateLimitNames: Record<RateLimitName, string> = {
      loginPerIp: "Failed log-ins from the IP",
      loginPerAccount: "Failed log-ins to the address from the IP",
      loginPerEmail: "Failed log-ins to the address from anywhere",
      codeChecksPerIp: "Wrong sign-up and password reset codes from the IP",
      codeChecksPerEmail: "Wrong sign-up and password reset codes for the address",
      resetLinkChecksPerIp: "Refused password reset links from the IP",
      mailSendsPerIp: "E-mails requested from the IP",
      usernameChecksPerIp: "Username checks from the IP",
      accountCodeChecksPerIp: "Wrong e-mail change codes from the IP",
      passwordChecksPerIp: "Wrong passwords on the account page from the IP"
    };
    /** A limiter's plain name, or the API's own one for a limiter added after this list. */
    static rateLimitName(name: string): string {
      return Messages.Admin.rateLimitNames[name as RateLimitName] ?? name;
    }
    /** `target` names what was cleared, e.g. "anna@example.com and 203.0.113.7". */
    static rateLimitsCleared(target: string): string {
      return `Cleared for ${target}:`;
    }
    static nothingCleared(target: string): string {
      return `Nothing was counting for ${target}, so there was nothing to clear.`;
    }
    static readonly statsLoading: string = "Loading the site's totals…";
    static readonly statsFailed: string = "Failed to load the site's totals";
    static readonly mailBudgetLoading: string = "Loading today's mail…";
    static readonly mailBudgetFailed: string = "Failed to load today's mail";
    /**
     * `resetsAt` is the reader's local time of the next UTC midnight. The API's count also starts
     * again when it restarts, since it lives in the process's memory.
     */
    static mailLimitReached(resetsAt: string): string {
      return `Today's mail limit is used up: no mail goes out until midnight UTC (${resetsAt} your time) or the API's next restart.`;
    }
    /** `dailyLimit` is the number of mails a day, past which nothing is sent. */
    static registrationMailStopped(dailyLimit: number): string {
      return `Sign-up codes have stopped until midnight UTC or the API's next restart. Mail to existing accounts still goes out, up to ${dailyLimit.toLocaleString()}.`;
    }
  };
}
