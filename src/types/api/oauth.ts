/** First-party apps registered with the API as OAuth clients (vb2007/vb2007.hu-api#575, #577). */

/** A registered client as `GET /oauth/clients/:clientId` answers it (public; `404` when unknown). */
export interface OauthClient {
  id: string;
  /** Its display name. */
  name: string;
  /** Its app scopes, as `<client>:<scope>`. May be empty. */
  scopes: string[];
}
