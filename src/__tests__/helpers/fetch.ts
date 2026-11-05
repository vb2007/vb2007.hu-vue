import { vi } from "vitest";

/** A minimal Response stand-in; `body: undefined` makes `json()` reject like an empty or non-JSON body would. */
export const jsonResponse = (status: number, body?: unknown, statusText = "") =>
  ({
    ok: status >= 200 && status < 300,
    status,
    statusText,
    json: () =>
      body === undefined ? Promise.reject(new SyntaxError("No JSON")) : Promise.resolve(body)
  }) as Response;

/** What the API answers a request without a live session: its `isAuthenticated` middleware's 403. */
export const notLoggedInResponse = () =>
  jsonResponse(403, { error: "You must be logged in to perform this action." });

/** Replaces the global fetch with a mock; queue responses with mockResolvedValueOnce / mockRejectedValueOnce. */
export const mockFetch = () => {
  const fetchMock = vi.fn<typeof fetch>();
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
};

/**
 * Holds the mock's next request until `respond` is called, so tests can answer requests out of
 * order. Aborting its signal rejects it with an `AbortError`, like a real fetch; with `ignoreAbort`
 * it waits for `respond` anyway, like an answer that was already being read when it was aborted.
 */
export const deferResponse = (
  fetchMock: ReturnType<typeof mockFetch>,
  { ignoreAbort = false } = {}
) => {
  let resolve!: (response: Response) => void;
  fetchMock.mockImplementationOnce(
    (_url, init) =>
      new Promise<Response>((res, reject) => {
        resolve = res;
        if (!ignoreAbort) {
          init?.signal?.addEventListener("abort", () =>
            reject(new DOMException("Aborted", "AbortError"))
          );
        }
      })
  );
  return { respond: (response: Response) => resolve(response) };
};
