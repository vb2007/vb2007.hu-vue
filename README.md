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

## Deployment (Docker)

The app ships as a compose stack with two services: `frontend` (the production build served by unprivileged nginx) and `cloudflared` (a Cloudflare Tunnel for remote access). No ports are published on the host; the tunnel reaches the app over the internal compose network.

### One-time setup on the server (Debian)

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

`VITE_API_BASE_URL` is baked into the bundle at build time, so after changing it run `docker compose up -d --build` again. Compose refuses to start if `VITE_API_BASE_URL` or `TUNNEL_TOKEN` is missing. `.env` is gitignored: keep the token out of version control.

## Testing

- **Coverage must stay at 100%** (lines, branches, functions and statements). Every file under `src/` counts, even one no test imports yet, so new code without tests fails CI.
- **Unit and component tests** live next to the code in `__tests__/` folders (`src/**/__tests__/*.spec.ts`) and run in jsdom.
  - `src/__tests__/setup.ts` stubs `matchMedia` and the clipboard, and resets the shared auth state after each test.
  - `src/__tests__/helpers/` has `mockFetch()`/`jsonResponse()` for API calls and `mountWithRouter()` for components that use router links.
- **E2E tests** live in `e2e/` and run against the production build in desktop and mobile Chromium.
  - The `api` fixture in `e2e/fixtures.ts` answers every API request. Set up state with `api.loggedInAs(...)` or `api.shortenReturns(...)` before navigating.
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
