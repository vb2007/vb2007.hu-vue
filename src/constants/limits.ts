/** The API's limits, checked here too so a request that would fail isn't sent. */
export class Limits {
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

  static readonly Email = class {
    static readonly maxLength: number = 254;
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

  /** The `q` that searches a list of uploads or, for the admin, of users. */
  static readonly Search = class {
    static readonly maxLength: number = 100;
  };
}
