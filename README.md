# vb2007.hu-vue

This template should help get you started developing with Vue 3 in Vite.

## Recommended IDE Setup

[VSCode](https://code.visualstudio.com/) + [Volar](https://marketplace.visualstudio.com/items?itemName=Vue.volar) (and disable Vetur).

## Type Support for `.vue` Imports in TS

TypeScript cannot handle type information for `.vue` imports by default, so we replace the `tsc` CLI with `vue-tsc` for type checking. In editors, we need [Volar](https://marketplace.visualstudio.com/items?itemName=Vue.volar) to make the TypeScript language service aware of `.vue` types.

## Customize configuration

See [Vite Configuration Reference](https://vite.dev/config/).

## Project Setup

```sh
npm install
```

### Compile and Hot-Reload for Development

```sh
npm run dev
```

### Type-Check, Compile and Minify for Production

```sh
npm run build
```

### Run Unit Tests with [Vitest](https://vitest.dev/)

```sh
npm run test:unit       # watch mode
npm run test:coverage   # single run with the coverage gate
```

### Run End-to-End Tests with [Playwright](https://playwright.dev/)

```sh
npx playwright install chromium   # once, unless CHROMIUM_PATH points at a local Chromium
npm run test:e2e                  # builds the app, serves it with vite preview, runs e2e/
```

### Lint with [ESLint](https://eslint.org/)

```sh
npm run lint         # fixes what it can
npm run lint:check   # report only, as CI runs it
```

## Docker

The app ships as a compose stack with two services: `frontend` (the production build served by unprivileged nginx) and `cloudflared` (a Cloudflare Tunnel for remote access). No ports are published on the host; the tunnel reaches the app over the internal compose network.

Besides the SPA, `docker/nginx.conf` answers `/.well-known/matrix/server` and `/.well-known/matrix/client` (Matrix delegation to `matrix.vb2007.hu`, so `@user:vb2007.hu` federates) and `/robots.txt` (empty `200` for bots, `403` for everyone else). These routes must stay above the SPA fallback (`location /`).

### Running the stack by hand (Debian)

The server is normally deployed automatically (see [Releases & deployment](#releases--deployment)); this is the manual route, e.g. for a second machine or local testing.

1. Install Docker Engine and the Compose plugin from [Docker's apt repository](https://docs.docker.com/engine/install/debian/).
2. In the Cloudflare dashboard go to **Zero Trust → Networks → Tunnels**, create a tunnel (type *Cloudflared*) and copy its token (the long string after `--token` in the install command).
3. On that tunnel add a **public hostname** (e.g. `vb2007.hu`) with service type `HTTP` and URL `frontend:8080`.
4. Configure the stack:

   ```sh
   git clone https://github.com/vb2007/vb2007.hu-vue.git && cd vb2007.hu-vue
   cp .env.example .env
   # edit .env: set TUNNEL_TOKEN (and VITE_API_BASE_URL if the API isn't https://api.vb2007.hu)
   ```

5. Start it:

   ```sh
   docker compose up -d --build
   ```

### Day to day

```sh
docker compose ps                  # frontend should be "healthy"
docker compose logs -f cloudflared # look for "Registered tunnel connection"
git pull && docker compose up -d --build   # deploy an update
docker compose down                # stop and remove the containers
```

`VITE_API_BASE_URL` is baked into the bundle at build time, so after changing it run `docker compose up -d --build` again. `VITE_API_BASE_URL` defaults to `https://api.vb2007.hu`; Compose refuses to start if `TUNNEL_TOKEN` is missing. `.env` is gitignored: keep the token out of version control.

## Releases & deployment

`.github/workflows/release.yml` runs on every push to `main` (a merged PR) on the self-hosted runner, which lives on the production host. It can also be started from the Actions tab.

| Job | What it does |
|---|---|
| Determine version | `.github/scripts/next-version.mjs` picks the version (see below) |
| Build & push image | Builds the Docker image and pushes `ghcr.io/vb2007/vb2007.hu-vue` as `<version>`, `sha-<commit>` and `latest` |
| Cut release | New versions only: tags `v<version>` and publishes a GitHub release |
| Deploy | Pulls the `sha-<commit>` image and restarts the stack on the host, then smoke-tests the public site |

Deploys run one at a time, and only after the release exists. A failing job stops the pipeline before anything is replaced.

### Versions

- By default every merge to `main` bumps the **patch** of the latest `v*` tag (`v0.0.1` → `v0.0.2`).
- For a **minor or major** release, raise `version` in `package.json` in the PR. A version newer than the latest tag is released as is.
- Re-running the workflow on a commit that is already tagged makes no new release; it just redeploys.

Each release has auto-generated notes, the image digest, the test summary of the merged PR's CI run (when it can be found), and three assets: a `compose.yaml` pinned to that version, `images.json`, and `site-dist-<version>.tar.gz` (the built site, taken from the pushed image).

### One-time host setup

The runner needs Docker access and a deploy directory holding the tunnel token. The workflow copies `compose.yaml` there on every deploy and never touches `.env`.

```sh
mkdir -p /mnt/raid1/vb2007.hu
printf 'TUNNEL_TOKEN=%s\n' '<token>' > /mnt/raid1/vb2007.hu/.env
chmod 600 /mnt/raid1/vb2007.hu/.env
```

The tunnel's public hostname must point at `http://frontend:8080` (see Docker above). Optional repository variables (Settings → Secrets and variables → Actions → Variables):

| Variable | Used for | Default |
|---|---|---|
| `SITE_URL` | Public URL the deploy smoke-tests (`<SITE_URL>/healthz`); skipped when unset | none |
| `VITE_API_BASE_URL` | API URL baked into the released image | `https://api.vb2007.hu` |

To roll back, re-run the workflow on an older commit's run, or on the host run `IMAGE_TAG=<version> docker compose up -d --no-build` in `/mnt/raid1/vb2007.hu`.

## Testing

- **Coverage must stay at 100%** (lines, branches, functions and statements). Every file under `src/` counts, even one no test imports yet, so new code without tests fails CI.
- **Unit and component tests** live next to the code in `__tests__/` folders (`src/**/__tests__/*.spec.ts`) and run in jsdom.
  - `src/__tests__/setup.ts` stubs `matchMedia` and the clipboard, and resets the shared auth state after each test.
  - `src/__tests__/helpers/` has `mockFetch()`/`jsonResponse()` for API calls and `mountWithRouter()` for components that use router links.
- **E2E tests** live in `e2e/` and run against the production build in desktop and mobile Chromium.
  - The `api` fixture in `e2e/fixtures.ts` answers every API request. Set up state with `api.loggedInAs(...)`, `api.shortenReturns(...)`, `api.hasShortLink(...)` or `api.hasPaste(...)` before navigating. Short links shortened in a test resolve through the mocked lookup endpoint and API redirect. Pastes live in an in-memory store (`api.pastes`) that the create, list, view and delete endpoints share.
  - A request to an endpoint the fixture doesn't know fails the test, so add a case to `MockApi.respond` when the app starts calling a new endpoint.

## CI

`.github/workflows/ci.yml` runs on every PR into `main` or `dev`, on the self-hosted runner. It can also be started from the Actions tab via "Run workflow" on any branch.

| Stage | What it checks |
|---|---|
| Typecheck | `vue-tsc --build` |
| Lint | `eslint .` |
| Build | `vite build`; its `dist/` is reused by E2E |
| Unit tests | Vitest, plus the 100% coverage gate (reported as its own `coverage` stage) |
| E2E tests | Playwright against the built app, with the API mocked |

Each stage uploads a JUnit file. `Aggregate reports` turns them into HTML, ODS, Markdown and JSON reports, using the scripts in `.github/scripts/`. `Publish summary` then posts the results as the job summary, as a sticky PR comment and as check-run annotations. The run's artifacts also include the browsable coverage report, and e2e traces when e2e fails.

## Opening the dev → main PR

`.github/workflows/dev-to-main-pr.yml` is started by hand from the Actions tab ("Run workflow"). It opens a PR from `dev` to `main` titled `Merge dev To main`, assigned to the owner, whose description lists every PR merged into `dev` that `main` doesn't have yet, stacked PRs included, with the issues each one resolves (`.github/scripts/dev-to-main-body.mjs` reads them from the `Resolves: #<issue>` lines). Merging that PR closes those issues. If `package.json`'s version on `dev` still equals `main`'s, it comments on the PR and warns that merging releases a patch version (`.github/scripts/version-bump-warning.mjs`), so bump it on `dev` first for a minor or major release. It does nothing if there's nothing new. While the PR is open, every push to `dev` (and a manual run) rewrites its description, so PRs merged after it was opened show up too; a push never opens the PR, and a refresh doesn't repeat the version warning.

The workflow only shows up in the Actions tab once it is on `main`. A PR opened with the default `GITHUB_TOKEN` doesn't trigger PR Tests; to get the checks, add a `PR_TOKEN` secret (a fine-grained PAT for this repo with Pull requests: read/write and Contents: read), which the workflow prefers. Without `PR_TOKEN`, the repo setting "Allow GitHub Actions to create and approve pull requests" (Settings → Actions → General) must be on. If neither is in place, the run fails with "GitHub Actions is not permitted to create or approve pull requests" and an error naming both fixes.
