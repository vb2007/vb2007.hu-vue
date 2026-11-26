/**
 * First-party apps registered with the API as OAuth clients (vb2007/vb2007.hu-api#575, #577), and
 * "Sign in with vb2007.hu": the authorization code flow with PKCE, approved on `/authorize`.
 */

/** A registered client as `GET /oauth/clients/:clientId` answers it (public; `404` when unknown). */
export interface OauthClient {
  id: string;
  /** Its display name, which the authorize page and app scopes show. */
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
