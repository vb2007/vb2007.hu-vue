# Issues & pull requests (mandatory)

These rules apply to every change, however small.

## Workflow

1. **Every PR needs an issue first.** Create a minimal issue describing the work, using the matching template in `.github/ISSUE_TEMPLATE/` (`bug.yml`, `feature.yml` or `documentation.yml`). Fill in the template's fields as `###` headings, and apply its label and assignee.
2. **Branch from `dev`**, named `dev-<short-topic>` (e.g. `dev-nginx-legacy-routes`).
3. **PRs only target `dev`.** Never open a PR to `main`: the owner merges `dev` into `main` afterwards, usually in batches.
4. **Link the issue with a closing keyword** on its own line at the end of the PR description, before the footer: `Resolves: #<issue>`. Use one line per issue if there are several.

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

# Project context

- **Stack:** Vue 3 + Vite + TypeScript SPA (vue-router, history mode). No backend in this repo: it calls the separate API (`vb2007/vb2007.hu-api`) at `VITE_API_BASE_URL`, which is baked in at build time. API-side needs are filed there (e.g. vb2007/vb2007.hu-api#75), not worked around here.
- **Read first:** `PRODUCT.md` (what the site is and isn't, never imply scale that doesn't exist) and `DESIGN.md` (visual rules, update it when layouts change). `README.md` covers Docker, releases and CI.
- **Checks before a PR:** `npm run type-check`, `npm run lint:check`, `npm run build-only`, `npm run test:coverage` (100% coverage gate on `src/`) and `npm run test:e2e`. Put what you ran in `## Tested locally`.
- **E2E** runs Playwright against `vite preview` with the API mocked in `e2e/fixtures.ts`; an unmocked API request fails the test. It never touches nginx.
- **Deploy:** the build is served by unprivileged nginx (`docker/nginx.conf`, baked into the image) behind a Cloudflare tunnel, on a read-only container. Merging to `main` builds, releases and deploys. Nginx changes therefore need a local `docker build` and curl check, since CI doesn't cover them. In that file, `location = /…` routes (Matrix `.well-known`, `robots.txt`, `/healthz`) must stay above the SPA fallback, and blocks that use `add_header` repeat the security headers.
