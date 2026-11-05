/** The API's limits, checked here too so a request that would fail isn't sent. */
export class Limits {
  /** Mirrors the API's `SHORT_URL_MAX_LENGTH`: the URL as sent, in UTF-16 units (JS `.length`). */
  static readonly ShortUrl = class {
    static readonly maxLength: number = 2000;
  };

  static readonly Paste = class {
    static readonly minLength: number = 2;
    static readonly maxLength: number = 10000;
  };

  /** Counted after trimming. */
  static readonly Username = class {
    static readonly minLength: number = 2;
    static readonly maxLength: number = 16;
  };

  /** Counted in characters, not UTF-16 units. */
  static readonly Password = class {
    static readonly minLength: number = 8;
    static readonly maxLength: number = 128;
  };

  /** Counted after trimming and lowercasing, like the API's `isValidEmail`. */
  static readonly Email = class {
    static readonly maxLength: number = 254;
    /** The part before the @. */
    static readonly localPartMaxLength: number = 64;
  };

  /** The codes the API mails to confirm an address or reset a password. */
  static readonly Code = class {
    static readonly digits: number = 6;
    /** The API mails at most one code a minute per address or account. */
    static readonly cooldownSeconds: number = 60;
    /** How long a code works after it's sent, by what it confirms. */
    static readonly registerValidMinutes: number = 15;
    static readonly emailChangeValidMinutes: number = 15;
    static readonly passwordResetValidMinutes: number = 30;
    /**
     * The token in a mailed reset link (vb2007/vb2007.hu-api#256): the account's 24-hex id, a dot,
     * and a 43-character base64url secret. It works as long as the code.
     */
    static readonly resetLinkToken: RegExp = /^[0-9a-f]{24}\.[\w-]{43}$/;
  };

  static readonly Github = class {
    /**
     * Setting the first password (vb2007/vb2007.hu-api#183) and deleting an account without one
     * (vb2007/vb2007.hu-api#245) need a GitHub login or relink at most this long ago. A delete sent
     * to GitHub to confirm is remembered for as long.
     */
    static readonly reauthMinutes: number = 10;
  };

  /** An upload's display name (the API's `isUploadFileName`), checked after trimming. */
  static readonly FileName = class {
    static readonly minLength: number = 1;
    static readonly maxLength: number = 255;
    /** Slashes and control characters. */
    static readonly forbiddenCharacters: RegExp = /[/\\\u0000-\u001f\u007f]/;
  };

  /**
   * The `q` that searches a list of uploads or, for the admin, of users. Counted in UTF-16 units,
   * untrimmed, like the input's maxlength.
   */
  static readonly Search = class {
    static readonly maxLength: number = 100;
  };
}
