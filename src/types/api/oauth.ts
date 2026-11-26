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

/** The authorization request `GET /oauth/authorize` hands the page in its query, all required. */
export interface AuthorizeParams {
  response_type: string;
  client_id: string;
  redirect_uri: string;
  state: string;
  code_challenge: string;
  code_challenge_method: string;
  nonce: string;
}

/** `POST /oauth/authorize`: the same parameters, checked again, plus the user's answer. */
export interface AuthorizeBody extends AuthorizeParams {
  approve: boolean;
}

/** Where the page sends the browser: back to the app with a code, or with `error=access_denied`. */
export interface AuthorizeResponse {
  redirectTo: string;
}
