import { API_BASE_URL } from "@/constants/endpoints";
import { ContentType, Header } from "@/constants/http";
import { Messages } from "@/constants/messages";
import type { BodyOf, Endpoint, ParamsOf, QueryOf, ResponseOf } from "@/scripts/api/endpoint";
import type { ApiErrorBody } from "@/types/api/common";

/** `params` is required exactly when the path has `:params`. */
type ParamsOption<E> = keyof ParamsOf<E> extends never
  ? { params?: undefined }
  : { params: ParamsOf<E> };

/** `query` is required exactly when the endpoint declares one. */
type QueryOption<E> = keyof QueryOf<E> extends never
  ? { query?: undefined }
  : { query: QueryOf<E> };

/** `body` is required when the endpoint declares one. */
type BodyOption<E> = undefined extends BodyOf<E> ? { body?: BodyOf<E> } : { body: BodyOf<E> };

export type UrlOptions<E> = ParamsOption<E> & QueryOption<E>;

export type RequestOptions<E> = UrlOptions<E> &
  BodyOption<E> & {
    /** Shown, followed by the status, when the API fails without an `{ error }` message. */
    failure: string;
    signal?: AbortSignal;
    /** Statuses that are an expected answer rather than a fault, so they aren't logged. */
    quietStatuses?: readonly number[];
  };

export interface ApiSuccess<Data> {
  ok: true;
  status: number;
  data: Data;
}

/** The API answered with an error status (or a success without a JSON body). */
export interface ApiHttpFailure {
  ok: false;
  kind: "http";
  status: number;
  /** The API's `{ error }` message, otherwise the `failure` text with the status. */
  error: string;
  body: ApiErrorBody | null;
}

/** No answer at all. */
export interface ApiNetworkFailure {
  ok: false;
  kind: "network";
  status: 0;
  error: string;
}

/** The caller aborted it through its `signal`: nothing is logged, nobody waits for it. */
export interface ApiAbortedFailure {
  ok: false;
  kind: "aborted";
  status: 0;
  error: string;
}

export type ApiFailure = ApiHttpFailure | ApiNetworkFailure | ApiAbortedFailure;
export type ApiResult<Data> = ApiSuccess<Data> | ApiFailure;

/** `options` can be left out when the endpoint needs neither params nor a query. */
type UrlArgs<E> =
  object extends UrlOptions<E> ? [options?: UrlOptions<E>] : [options: UrlOptions<E>];

/** The endpoint's full URL, with its `:params` encoded and `undefined` query values left out. */
export const apiUrl = <E extends Endpoint>(endpoint: E, ...[options]: UrlArgs<E>): string => {
  const params = (options?.params ?? {}) as Record<string, string>;
  const path = endpoint.path.replace(/:(\w+)/g, (_, name: string) =>
    encodeURIComponent(params[name])
  );

  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(options?.query ?? {})) {
    if (value !== undefined) {
      query.append(key, String(value));
    }
  }
  const search = query.toString();

  return `${API_BASE_URL}${path}${search ? `?${search}` : ""}`;
};

/** The API's host (`api.vb2007.hu`), for copy that names an address on the API. */
export const apiHost = (): string => new URL(API_BASE_URL).host;

/** The parsed JSON body, or null when there's none (e.g. a gateway's HTML error page). */
export const readJson = async (response: Response): Promise<unknown> => {
  try {
    return await response.json();
  } catch {
    return null;
  }
};

/** The API's `{ error }` message when it sent one, otherwise `failure` with the status text. */
export const errorMessageFrom = (
  body: unknown,
  status: number,
  statusText: string,
  failure: string
): string => {
  const error = (body as ApiErrorBody | null)?.error;
  return typeof error === "string" && error !== "" ? error : `${failure}: ${statusText || status}`;
};

/**
 * The API's own `{ error }` message, or undefined when it sent none: for a caller with its own
 * fallback text rather than `failure` with the status.
 */
export const apiErrorOf = (failure: ApiFailure): string | undefined => {
  const error: unknown = failure.kind === "http" ? failure.body?.error : undefined;
  return typeof error === "string" && error !== "" ? error : undefined;
};

/**
 * Calls an endpoint. Never throws: a failure comes back as `{ ok: false }` with the message to
 * show, and is logged once here. A request aborted through its `signal` isn't logged.
 */
export const apiRequest = async <E extends Endpoint>(
  endpoint: E,
  options: RequestOptions<E>
): Promise<ApiResult<ResponseOf<E>>> => {
  const init: RequestInit = { method: endpoint.method };
  if (endpoint.credentials) {
    init.credentials = "include";
  }
  if (endpoint.redirect) {
    init.redirect = endpoint.redirect;
  }
  if (options.body !== undefined) {
    init.headers = { [Header.ContentType]: ContentType.Json };
    init.body = JSON.stringify(options.body);
  }
  if (options.signal) {
    init.signal = options.signal;
  }

  const aborted: ApiAbortedFailure = {
    ok: false,
    kind: "aborted",
    status: 0,
    error: Messages.requestAborted
  };

  let response: Response;
  try {
    response = await fetch(apiUrl(endpoint, options as UrlOptions<E>), init);
  } catch (error) {
    if (options.signal?.aborted) {
      return aborted;
    }
    console.error(`${options.failure}: `, error);
    return { ok: false, kind: "network", status: 0, error: Messages.connectionError };
  }

  const body = await readJson(response);
  if (response.ok && body !== null) {
    return { ok: true, status: response.status, data: body as ResponseOf<E> };
  }
  // Aborted while the body was read, which leaves it unread.
  if (options.signal?.aborted) {
    return aborted;
  }

  if (!options.quietStatuses?.includes(response.status)) {
    console.error(`${options.failure}: `, response.status);
  }
  return {
    ok: false,
    kind: "http",
    status: response.status,
    error: errorMessageFrom(body, response.status, response.statusText, options.failure),
    body: body as ApiErrorBody | null
  };
};
