/**
 * The site's own texts about API calls, like the API's `Responses`: the API's `{ error }` message is
 * shown when it sends one, these otherwise. A `failure` text is followed by the status
 * (e.g. "Failed to load paste: 500"), see `errorMessageFrom`.
 */
export class Messages {
  /** The request never got an answer: offline, DNS, CORS or the API is down. */
  static readonly connectionError: string = "Error connecting to server";

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
}
