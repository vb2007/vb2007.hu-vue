import { API_BASE_URL } from "@/constants/endpoints";
import { ContentType, Header } from "@/constants/http";
import { Messages } from "@/constants/messages";
import type { BodyOf, Endpoint, ParamsOf, QueryOf, ResponseOf } from "@/scripts/api/endpoint";
import type { ApiErrorBody } from "@/types/api/common";

/** `params` is required exactly when the path has `:params`. */
type ParamsOption<E> = keyof ParamsOf<E> extends never
  ? { params?: undefined }
  : { params: ParamsOf<E> };

/** `query` is required when the endpoint declares one, optional on untyped endpoints. */
type QueryOption<E> = keyof QueryOf<E> extends never
  ? { query?: undefined }
  : string extends keyof QueryOf<E>
    ? { query?: QueryOf<E> }
    : { query: QueryOf<E> };

/** `body` is required when the endpoint declares one. */
type BodyOption<E> = undefined extends BodyOf<E> ? { body?: BodyOf<E> } : { body: BodyOf<E> };

export type UrlOptions<E> = ParamsOption<E> & QueryOption<E>;

export type RequestOptions<E> = UrlOptions<E> &
  BodyOption<E> & {
    /** Shown, followed by the status, when the API fails without an `{ error }` message. */
    failure: string;
    signal?: AbortSignal;
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

export type ApiFailure = ApiHttpFailure | ApiNetworkFailure;
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

/** The parsed JSON body, or null when there's none (e.g. a bare 500). */
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
 * `errorMessageFrom` for a raw `Response`.
 * @deprecated Only for calls not yet moved to `apiRequest`; removed with #104.
 */
export const errorFrom = async (response: Response, failure: string) =>
  errorMessageFrom(await readJson(response), response.status, response.statusText, failure);

/**
 * Calls an endpoint. Never throws: a failure comes back as `{ ok: false }` with the message to
 * show, and is logged once here.
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

  let response: Response;
  try {
    response = await fetch(apiUrl(endpoint, options as UrlOptions<E>), init);
  } catch (error) {
    console.error(`${options.failure}: `, error);
    return { ok: false, kind: "network", status: 0, error: Messages.connectionError };
  }

  const body = await readJson(response);
  if (response.ok && body !== null) {
    return { ok: true, status: response.status, data: body as ResponseOf<E> };
  }

  console.error(`${options.failure}: `, response.status);
  return {
    ok: false,
    kind: "http",
    status: response.status,
    error: errorMessageFrom(body, response.status, response.statusText, options.failure),
    body: body as ApiErrorBody | null
  };
};
