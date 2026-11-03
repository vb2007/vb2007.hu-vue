/**
 * Where the site keeps things in sessionStorage between page loads. (The theme's localStorage key
 * is in `theme.ts`; the e-mail code cooldowns keep theirs next to their composables.)
 */
export class StorageKeys {
  /**
   * An account without a password went to GitHub to confirm deleting it (vb2007/vb2007.hu-api#245),
   * so the delete form opens again on the way back.
   */
  static readonly deleteIntent = "account-delete-intent";
}
