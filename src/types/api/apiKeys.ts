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

import type { MessageResponse } from "@/types/api/common";
import type { MfaPasswordBody } from "@/types/api/mfa";

export interface ApiKeysResponse {
  apiKeys: ApiKey[];
}

/**
 * A key's lifetime in whole days from now, or `null` for one that never expires. Left out of a
 * rotate, the key keeps the lifetime it had; left out of a create, it's the API's default.
 */
export type ApiKeyLifetime = number | null;

/** `POST /user/api-keys`, confirmed like an MFA setting. */
export interface CreateApiKeyBody extends MfaPasswordBody {
  name: string;
  scopes: ApiKeyScope[];
  expiresInDays?: ApiKeyLifetime;
}

/** `POST /user/api-keys/:id/rotate`: a new token, with the name and scopes kept. */
export interface RotateApiKeyBody extends MfaPasswordBody {
  expiresInDays?: ApiKeyLifetime;
}

/** The created or rotated key, with its token: the only time the API shows it. */
export interface ApiKeyTokenResponse extends MessageResponse {
  apiKey: ApiKey & { token: string };
}
