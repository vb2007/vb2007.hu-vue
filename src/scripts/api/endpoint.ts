import type { HttpMethodName } from "@/constants/http";

/** `"/admin/users/:id/uploads"` → `"id"`: the names of a path's `:params`. */
type ParamNames<Path extends string> = Path extends `${string}:${infer Name}/${infer Rest}`
  ? Name | ParamNames<`/${Rest}`>
  : Path extends `${string}:${infer Name}`
    ? Name
    : never;

/** The values a path needs, e.g. `{ id: string }` for `"/paste/:id"`; empty when it has none. */
export type PathParams<Path extends string> = { [Name in ParamNames<Path>]: string };

/** Query values; `undefined` ones are left out of the URL. */
export type QueryValues = Record<string, string | number | undefined>;

/**
 * One API route: a method on a path, as the API's router declares it. The type parameters only
 * exist for the compiler, so a call can't send the wrong body or read the wrong response.
 */
export interface Endpoint<
  Path extends string = string,
  Body = unknown,
  Response = unknown,
  Query extends QueryValues = QueryValues
> {
  readonly method: HttpMethodName;
  /** An Express-style template, e.g. `"/paste/:id"`. */
  readonly path: Path;
  /** Whether the session cookie goes along (`credentials: "include"`). */
  readonly credentials: boolean;
  readonly redirect?: RequestRedirect;
  /** Never set: carries the body, response and query types. */
  readonly types?: { body: Body; response: Response; query: Query };
}

/** No request body. */
export type NoBody = undefined;
/** No query string. */
export type NoQuery = Record<never, never>;

/**
 * Declares an endpoint. Curried so the types are written out while the path stays a literal:
 * `defineEndpoint<CreatePasteBody, PasteResponse>()({ method, path: "/paste", credentials })`.
 */
export const defineEndpoint =
  <Body = NoBody, Response = unknown, Query extends QueryValues = NoQuery>() =>
  <const Path extends string>(definition: {
    method: HttpMethodName;
    path: Path;
    credentials: boolean;
    redirect?: RequestRedirect;
  }): Endpoint<Path, Body, Response, Query> =>
    definition;

export type BodyOf<E> = E extends Endpoint<string, infer Body> ? Body : never;
export type ResponseOf<E> = E extends Endpoint<string, unknown, infer Response> ? Response : never;
export type QueryOf<E> = E extends Endpoint<string, unknown, unknown, infer Query> ? Query : never;
export type ParamsOf<E> = E extends Endpoint<infer Path> ? PathParams<Path> : never;
