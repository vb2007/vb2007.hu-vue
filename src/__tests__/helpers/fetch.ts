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

/** Replaces the global fetch with a mock; queue responses with mockResolvedValueOnce / mockRejectedValueOnce. */
export const mockFetch = () => {
  const fetchMock = vi.fn<typeof fetch>();
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
};
