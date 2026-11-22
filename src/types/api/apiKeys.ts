/** An API key's scope (vb2007/vb2007.hu-api#511), mirroring the API's `API_KEY_SCOPES`. */
export type ApiKeyScope =
  | "account:read"
  | "account:write"
  | "pastes:read"
  | "pastes:write"
  | "shortUrls:read"
  | "shortUrls:write"
  | "uploads:read"
  | "uploads:write"
  | "admin:read"
  | "admin:write";

/** A key as `GET /user/api-keys` and `GET /admin/users/:id` list it: never its token or hash. */
export interface ApiKey {
  id: string;
  name: string;
  /** The token's last 4 characters. */
  hint: string;
  scopes: ApiKeyScope[];
  createdAt: string;
  /** `null` for a key that never expires. */
  expiresAt: string | null;
  lastUsedAt: string | null;
}
