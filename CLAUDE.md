# Issues & pull requests (mandatory)

These rules apply to every change, however small.

## Workflow

1. **Every PR needs an issue first**, however small the job. If none exists yet, create it before branching: a minimal issue describing the work, using the matching template in `.github/ISSUE_TEMPLATE/` (`bug.yml`, `feature.yml` or `documentation.yml`). Fill in the template's fields as `###` headings, and apply its label and assignee.
2. **Branch from `dev`**, named `dev-<short-topic>` (e.g. `dev-nginx-legacy-routes`).
3. **PRs only target `dev`.** Never open a PR to `main`: the owner merges `dev` into `main` afterwards, usually in batches.
4. **Link the issue with a closing keyword** on its own line at the end of the PR description, before the footer: `Resolves: #<issue>`. Use one line per issue if there are several. It closes the issue once `dev` reaches `main`, but on a PR into `dev` it doesn't link the issue under the PR's "Development". Neither `gh` nor GitHub's API can link it (`gh issue develop` only links a branch, which doesn't show on the PR), so the owner links it by hand: when reporting a new PR, remind them which issue to link.
5. **Assign and label every PR:** assignee `vb2007`, and the label of its issue's template (`feature`, `bug` or `documentation`), e.g. `gh pr create --base dev --assignee vb2007 --label feature`.

## Issue schema

- Title: the template's prefix plus a short sentence: `[Bug] …`, `[Feature] …` or `[Docs] …`.
- Body: only the template's fields, kept minimal (a few bullets, see #34 for the style). A bug fills in all four: Version (latest release tag), Description, Repro steps + Actual behavior, Expected behavior.

## PR schema

- Title: `Merge <branch-name> To dev`.
- Description, in this order:
  1. Bullets describing what changed and why.
  2. `## Tested locally`: what was actually run and checked.
  3. `## Notes`: caveats, follow-ups, anything outside this repo. Omit if there are none.
  4. `Resolves: #<issue>`
  5. The footer `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
- Commits: conventional prefixes (`feat:`, `fix:`, `docs:`, `test:`), ending with the `Co-Authored-By` line given in the session.

Recent PRs (#31, #32, #35, #37) are good references for the schema.

# API calls & constants (mandatory)

Calling the API is generalised: write no boilerplate around it, and no raw value that already has a constant. `README.md` ("Calling the API") describes the pieces.

## Where things live

| What                                                                                                                         | Where                                                                                                                    |
| ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Endpoints: method, path (as the API's Express route, `"/paste/:id"`), whether it sends the session cookie, the redirect mode | `Endpoints` in `src/constants/endpoints.ts`, one `defineEndpoint<Body, Response, Query>()` entry per method and path     |
| Request bodies, queries and responses                                                                                        | `src/types/api/<domain>.ts`; shared shapes (`MessageResponse`, `ApiErrorBody`, `Pagination`, `SortOrder`) in `common.ts` |
| Texts about API calls: `failure` fallbacks, client-side validation messages, notices                                         | `Messages` in `src/constants/messages.ts`, grouped by domain; texts that take values are static methods                  |
| Limits the API enforces and the site checks before sending (lengths, sizes, cooldowns)                                       | `Limits` in `src/constants/limits.ts`, mirroring the API's values                                                        |
| HTTP methods, statuses, headers and content types                                                                            | `src/constants/http.ts`                                                                                                  |
| OAuth `?oauthError=` codes, login and register status values                                                                 | `src/constants/oauth.ts`, `src/constants/auth.ts`                                                                        |

These mirror `vb2007.hu-api`'s `src/constants/` (e.g. `Responses`). When the API adds or changes a route, limit or error code, update the matching entry here instead of patching the call site.

## Rules

- **Every request goes through `apiRequest`** from `@/scripts/api/client`, and every browser navigation or href to the API through `apiUrl`. ESLint rejects `fetch` and `XMLHttpRequest` elsewhere. The only exception is the upload's XHR (`src/scripts/uploads/upload.ts`, for progress events), which still builds its URL with `apiUrl` and its error with `errorMessageFrom`.
- **Add a new call in this order:** types in `src/types/api/`, then the `Endpoints` entry, then the `Messages` failure text, then the call site. Don't build URLs by hand, use `.replace(":id", …)`, set `credentials`, headers or `JSON.stringify`, or parse error bodies: the endpoint and the client do that.
- **Handle the result, don't re-implement it.** `apiRequest` never throws, logs failures itself, and returns `ApiResult`. Branch on `result.ok`, then on `result.kind` (`http` / `network` / `aborted`) and `result.status` compared with `HttpStatus.*`. Show `result.error`, or use `apiErrorOf` when the caller has its own fallback. Don't add `try/catch`, extra `console.error` calls or local `bodyOf`/`messageFrom` helpers. Expected statuses that shouldn't be logged go in `quietStatuses`.
- **No raw literals at call sites:** no path, method, status number, query key, API-related message or mirrored limit in components, composables or scripts. Copy that states a limit (lengths, digits, how long a code works) is built from `Limits`.
- **Keep one copy.** Before adding a constant or type, look for an existing one. Move it to `src/types/api/` or `src/constants/` rather than re-exporting it or duplicating it in a feature module.
- **Tests:** unit specs mock the network with `mockFetch` and `jsonResponse` from `src/__tests__/helpers/fetch.ts`. Queue a response for every request the code under test makes, since an unqueued one fails as an unhandled rejection. Each new endpoint gets a row in `src/constants/__tests__/endpoints.spec.ts`. `e2e/fixtures.ts` stays an independent double of the API, matched by path: don't import `Endpoints` there, or the e2e suite would check the code against itself.

# Project context

- **Stack:** Vue 3 + Vite + TypeScript SPA (vue-router, history mode). No backend in this repo: it calls the separate API (`vb2007/vb2007.hu-api`) at `VITE_API_BASE_URL`, which is baked in at build time. API-side needs are filed there (e.g. vb2007/vb2007.hu-api#75), not worked around here.
- **Read first:** `PRODUCT.md` (what the site is and isn't, never imply scale that doesn't exist) and `DESIGN.md` (visual rules, update it when layouts change). `README.md` covers Docker, releases and CI.
- **Checks before a PR:** `npm run type-check`, `npm run lint:check`, `npm run build-only`, `npm run test:coverage` (100% coverage gate on `src/`) and `npm run test:e2e`. Put what you ran in `## Tested locally`.
- **E2E** runs Playwright against `vite preview` with the API mocked in `e2e/fixtures.ts`; an unmocked API request fails the test. It never touches nginx.
- **Deploy:** the build is served by unprivileged nginx (`docker/nginx.conf`, baked into the image) behind a Cloudflare tunnel, on a read-only container. Merging to `main` builds, releases and deploys. Nginx changes therefore need a local `docker build` and curl check, since CI doesn't cover them. In that file, `location = /…` routes (Matrix `.well-known`, `robots.txt`, `/healthz`) must stay above the SPA fallback, and blocks that use `add_header` repeat the security headers.
- **Runners:** release and deploy run only on the self-hosted runner labelled `prod` (the production host). PR checks and `dev-to-main-pr.yml` run only on the `pr-worker` runners, which share one 4-core host with the API repo's runners, so CI work must tolerate slowdown and overlapping jobs (no fixed ports or `/tmp` paths, no tight wall-clock margins).
