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
  };

  /** An upload's display name (the API's `isUploadFileName`), checked after trimming. */
  static readonly FileName = class {
    static readonly minLength: number = 1;
    static readonly maxLength: number = 255;
    /** Slashes and control characters. */
    static readonly forbiddenCharacters: RegExp = /[/\\\u0000-\u001f\u007f]/;
  };
}
