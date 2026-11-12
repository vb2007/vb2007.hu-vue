import { Limits } from "@/constants/limits";
import { SITE_LOCALE } from "@/constants/locale";
import { formatWait, type WaitUnits } from "@/scripts/utility/durationUtil";
import type { RateLimitName } from "@/types/api/admin";

/**
 * A notice around an address it shows in bold: the text before the address, the punctuation kept
 * with it (it may be empty), and the rest.
 */
export type AddressNotice = readonly [before: string, punctuation: string, after: string];

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
    /** The API answers whitespace with `invalidUrl`'s text; these say where it is and what to do. */
    static readonly edgeWhitespace: string = "Remove the space at the start or end of the URL.";
    static readonly innerWhitespace: string = "A URL can't contain spaces: write each one as %20.";
    /** Names the length too, so a pasted link shows how much has to go. */
    static tooLong(length: number, max: number): string {
      return `This URL is ${length.toLocaleString()} characters; the limit is ${max.toLocaleString()}.`;
    }
    static readonly shortenFailed: string = "Failed to shorten URL";
    /**
     * Under the slip when the API answers a repeat with the user's existing link (a 200, not a
     * 201). The site's own words rather than the API's, since it has to say no new link was made.
     */
    static readonly alreadyShortened: string =
      "You've already shortened this URL, so no new link was made.";
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
     * The API's 429 after too many failed logins (vb2007/vb2007.hu-api#204). Like the other held
     * forms' messages it names no wait: the held Log in key counts it down, and the hold reads it out
     * (`tryAgainSpoken`); without a usable `retryAfter` nothing is held, and "later" is all it knows.
     * GitHub login isn't locked out, but only gets into an account it's linked to.
     */
    static readonly loginLockedOut: string =
      "Too many failed attempts. Try again later, or log in with GitHub below if it's linked to your account.";
    /**
     * The API's 403 to a request without a working session (its `Responses.notLoggedIn`): none was
     * sent, or it ended. Other 403s (a wrong password, not the owner) have their own texts, so only
     * this one tells the page it's logged out (see `onSessionRefused`). The register code check
     * reads it too, without a session: there it means the account it just created is gone
     * (see `isLoggedOutAnswer`).
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
    /**
     * Under the 503 for the day's used-up registration mail (`ErrorReason.MailBudget`): a GitHub
     * login makes the account without mailing a code, so it still works.
     */
    static readonly registerWithGithubInstead: string =
      "Registering with GitHub below needs no e-mail.";
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
     * The code step's 403 `notLoggedIn` (vb2007/vb2007.hu-api#430): the account the code created
     * was deleted before the session started, so the code is used up and nothing is left to retry.
     */
    static readonly registrationAccountRemoved: string =
      "Your account was removed before registration finished, so that code is used up. Register again to get a new code.";
    /*
     * The register code step's notices, around the address the code went to: the text before it,
     * the punctuation kept with it, and the rest, so the form can let a long address wrap. The
     * waiting registration only holds the address and code: confirming it registers the username
     * and password in the form (vb2007/vb2007.hu-api#295), so each names the username it creates.
     * `minutes` is how long a register code works.
     */
    /** Register mailed a code. */
    static registerCodeSent(name: string, digits: number, minutes: number): AddressNotice {
      return [
        `A ${digits}-digit code is on its way to`,
        ".",
        `Enter it to register as ${name}; it works for ${minutes} minutes.`
      ];
    }
    /**
     * After a resend. The API answers it the same whether or not a registration is waiting for the
     * address, and whether it mailed a new code, sent nothing inside the minute or kept the code
     * from before after a failed mail: in every case the latest code to reach it is the one that works.
     */
    static registerCodeResent(name: string): AddressNotice {
      return [
        "If a registration is waiting for",
        ",",
        `only the latest code to reach it works: enter it to register as ${name}.`
      ];
    }
    /** "Enter it" for a code that already arrived: nothing was sent. */
    static registerCodeEarlier(name: string, minutes: number): AddressNotice {
      return [
        "Enter the code that was mailed to",
        ".",
        `It works for ${minutes} minutes after sending, and registers you as ${name} with the password you entered.`
      ];
    }
    /** Register refused with the cooldown: a code went to the address moments ago. */
    static registerCodeRecent(name: string): AddressNotice {
      return [
        "Less than a minute ago, a code went to",
        ".",
        `It still works: enter it to register as ${name}.`
      ];
    }
    /** Back from fixing the form with the code typed before, which still works. */
    static registerCodeKept(name: string, minutes: number): AddressNotice {
      return [
        "Your code for",
        "",
        `works for up to ${minutes} minutes after it was sent: confirm it to register as ${name}.`
      ];
    }
    /**
     * After the resend's 503 for the day's mail budget. The API turns the resend away before it
     * looks at the address, so whether a code waits, and whether it's still fresh, is unknown.
     */
    static registerCodeUnsent(name: string, minutes: number): AddressNotice {
      return [
        "Nothing new was sent to",
        ".",
        `If a code reached it in the last ${minutes} minutes, the latest one still works: enter it to register as ${name}.`
      ];
    }
    /**
     * The code step's 409 for an address that has an account: the waiting registration is gone.
     * GitHub login only reaches an account that uses GitHub; resetting the password works for
     * every account, and gives one made with GitHub a password. The register form shows it with
     * "Log in" and "reset the password" as links, so it comes in pieces around them;
     * `accountExists` is the whole text, as read out and as the form tells it apart.
     */
    static readonly accountExistsStart: string = "An account already uses this address.";
    static readonly accountExistsLogIn: string = "Log in";
    static readonly accountExistsMiddle: string =
      "instead (with GitHub if that's how you signed up), or";
    static readonly accountExistsReset: string = "reset the password";
    static readonly accountExists: string = `${this.accountExistsStart} ${this.accountExistsLogIn} ${this.accountExistsMiddle} ${this.accountExistsReset}.`;
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
    /** The API's `usernameInvalidCharacters` (vb2007/vb2007.hu-api#319, #470). */
    static readonly usernameInvalidCharacters: string =
      "The username has invalid characters: it can't contain invisible or control characters, or whitespace other than spaces. If you pasted it, type it again by hand: a pasted space can be a no-break space.";
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
     * What the site says in place of the cooldown 429's own message (see `ErrorReason.ResendCooldown`),
     * which names its seconds and would freeze next to the countdown.
     */
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
    /**
     * A 400 that took the waiting change away: the code expired, or its tries ran out (since
     * vb2007/vb2007.hu-api#463 the API drops the change then, and the refresh can't tell which).
     */
    static codeExpiredOrUsedUp(address: string): string {
      return `${address} wasn't confirmed: its code expired or ran out of tries. Send a new one with Change e-mail.`;
    }
    /** Any other refusal that took the waiting change away. */
    static notConfirmed(address: string, error: string): string {
      return `${address} wasn't confirmed. ${error}`;
    }
    /**
     * After the API's own "password changed" message, when a change waited: changing the password
     * drops it, and its code with it (vb2007/vb2007.hu-api#474).
     */
    static emailChangeCancelled(address: string): string {
      return `The change to ${address} was cancelled, so its code no longer works: get a new one with Change e-mail.`;
    }
    /**
     * `PATCH /user/email`'s logged-out 403 while the page is still logged in: the password or the
     * session changed between the API's check and its store (e.g. in another tab), so nothing was
     * kept or mailed (vb2007/vb2007.hu-api#466). The password typed may be the old one now.
     */
    static readonly emailChangeInterrupted: string =
      "No code was sent: your password or session changed in the meantime, maybe in another tab. Try again with your current password.";
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
      accountCodeChecksPerAccount: `Wrong e-mail change codes for the account, ${Limits.Code.failedChecksPerAccount} in ${Limits.Code.failedChecksWindowSeconds / 60} min`,
      passwordChecksPerIp: "Wrong passwords on the account page from the IP",
      passwordChecksPerAccount: "Wrong passwords on the account page, per account",
      passwordResetCodeFailures: `Wrong password reset codes for the account, ${Limits.Code.failedChecksPerDay} a day`,
      emailChangeCodeFailures: `Wrong e-mail change codes for the account, ${Limits.Code.failedChecksPerDay} a day`,
      registrationCodeFailures: `Wrong sign-up codes for the waiting registration, ${Limits.Code.failedChecksPerDay} a day`
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
    /**
     * `passwordResetStopsAt` is the count from which password reset codes stop too, `dailyLimit`
     * the number of mails a day, past which nothing is sent.
     */
    static registrationMailStopped(passwordResetStopsAt: number, dailyLimit: number): string {
      return `Sign-up codes have stopped until midnight UTC or the API's next restart. Password reset codes still go out until today's count reaches ${passwordResetStopsAt.toLocaleString()}, other mail to existing accounts until it reaches ${dailyLimit.toLocaleString()}.`;
    }
    /** `dailyLimit` is the number of mails a day, past which nothing is sent. */
    static passwordResetMailStopped(dailyLimit: number): string {
      return `Sign-up and password reset codes have stopped until midnight UTC or the API's next restart. E-mail change codes and notices still go out until today's count reaches ${dailyLimit.toLocaleString()}.`;
    }
  };
}
