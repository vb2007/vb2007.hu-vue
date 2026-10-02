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
