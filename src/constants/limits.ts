/** The API's limits, checked here too so a request that would fail isn't sent. */
export class Limits {
  static readonly Paste = class {
    static readonly minLength: number = 2;
    static readonly maxLength: number = 10000;
  };
}
