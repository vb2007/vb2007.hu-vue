/**
 * "Sign in with vb2007.hu" for first-party apps (vb2007/vb2007.hu-api#575): the authorization code
 * flow with PKCE, approved on the site's `/authorize` page.
 */

/** A registered client as `GET /oauth/clients/:clientId` answers it (public; `404` when unknown). */
export interface OauthClient {
  id: string;
  /** The display name the authorize page shows. */
  name: string;
  /** Its app scopes, as `<client>:<scope>`. May be empty. */
  scopes: string[];
}
