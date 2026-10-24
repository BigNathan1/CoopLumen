# Testing

CoopLumen has three layers of tests. Each one answers a different question,
and the cheapest layer that can answer a question is the one that should.

| Layer              | Tool                   | Runs against                     | Question                                        |
| ------------------ | ---------------------- | -------------------------------- | ----------------------------------------------- |
| Unit / integration | Jest                   | Node, in process                 | Does this module do what it says?               |
| Component          | Jest + Testing Library | jsdom                            | Does this component render and react correctly? |
| End-to-end         | Playwright             | The real stack in Docker Compose | Does the product still work for a person?       |

The first two run in `npm test` and need nothing but the workspace
dependencies. The end-to-end suite drives a browser against the whole stack,
so it needs Docker.

---

## End-to-end tests

### What lives where

```
frontend/
├── playwright.config.ts        # Browsers, reporters, timeouts, base URL
└── e2e/
    ├── global-setup.ts         # Waits for the stack, starts the gateway
    ├── support/
    │   ├── api.ts              # Backend helpers used to arrange a test
    │   ├── auth.ts             # Signs the browser's API requests
    │   ├── fixtures.ts         # The shared `test` and `expect`
    │   ├── gateway.ts          # Serves the app and the API from one origin
    │   └── session.ts          # Mints session tokens
    ├── smoke.spec.ts           # The public pages
    ├── communities.spec.ts     # Registering a community
    └── governance.spec.ts      # Proposals and votes
```

### Running them

```bash
# Start the stack the suite runs against
docker compose -f docker-compose.yml -f docker-compose.e2e.yml up -d --build --wait

# Apply the migrations the suite expects
docker compose -f docker-compose.yml -f docker-compose.e2e.yml \
  exec -T -e DATABASE_URL=postgresql://cooplumen:cooplumen@db:5432/cooplumen \
  backend npm run db:migrate

# Run the suite
cd frontend && npm run test:e2e
```

`npm run test:e2e:ui` opens the Playwright inspector instead, which is the
fastest way to watch a spec run. `npm run test:e2e:report` serves the report
from the last run, and `npm run test:e2e:install` downloads the browser the
suite uses.

The suite talks to the stack on these ports:

| Service    | Origin                  | Purpose                          |
| ---------- | ----------------------- | -------------------------------- |
| App        | `http://127.0.0.1:3000` | The Next.js frontend             |
| API        | `http://127.0.0.1:4000` | The backend                      |
| E2E origin | `http://127.0.0.1:3100` | What the browser loads and calls |

### Why the suite has its own origin

A browser only hands a response to the page when the response comes from the
page's own origin, unless the server explicitly opts into credentialed
cross-origin requests. The app and the API run on different ports, so a
browser that loads the app from one port and calls the API from the other
never sees any data: the browser drops the response before the app can read
it.

The suite removes that constraint for itself. `frontend/e2e/support/gateway.ts`
serves the page, its assets and the API from one origin — the same shape a
deployment gets when it sits behind a reverse proxy — and forwards `/api/*`
to the backend and everything else to the frontend. The upstream services are
untouched, and the specs still exercise the real frontend against the real
backend.

### Writing a spec

Import `test` and `expect` from the shared fixtures, not from
`@playwright/test` directly, so every spec gets the same arrangement:

```ts
import { expect, test } from './support/fixtures';

test('a member registers a community', async ({
  authenticatedPage: page,
  request,
  apiUrl,
  memberAddress,
}) => {
  await page.goto('/communities/new');
  await page.getByLabel('Community name').fill(`E2E Community ${Date.now()}`);
  await page.getByLabel('Issuer public key').fill(memberAddress);
  await page.getByRole('button', { name: 'Create community' }).click();

  await expect(page.getByText('Community created successfully.')).toBeVisible();
});
```

The fixtures are:

| Fixture             | What it gives a spec                                      |
| ------------------- | --------------------------------------------------------- |
| `page`              | The browser page, as the suite's anonymous visitor        |
| `authenticatedPage` | A page whose API requests carry a session token           |
| `memberAddress`     | The Stellar address the suite acts as                     |
| `sessionToken`      | A token the backend accepts for that address              |
| `apiUrl`            | The backend origin, for requests made outside the browser |

A few conventions keep the suite honest:

- **Assert on what a person sees.** Prefer roles, labels and visible text
  (`getByRole`, `getByLabel`, `getByText`) over CSS selectors, so a markup
  change that keeps the experience intact does not fail the suite.
- **Arrange through the API, assert through the browser.** Use the `request`
  fixture to set up state, and the page to check what the product does with
  it.
- **Name every community uniquely.** The suite shares one database, so a name
  derived from `Date.now()` keeps reruns from colliding.
- **Never mock the app.** The suite is the last line of defence before a
  change reaches a person; a mocked API would test the mock.

### Environment variables

| Variable                  | Default                 | Used by                                  |
| ------------------------- | ----------------------- | ---------------------------------------- |
| `PLAYWRIGHT_BASE_URL`     | `http://127.0.0.1:3100` | The origin the browser loads             |
| `PLAYWRIGHT_GATEWAY_PORT` | `3100`                  | The port the gateway listens on          |
| `PLAYWRIGHT_APP_URL`      | `http://127.0.0.1:3000` | The frontend the gateway serves          |
| `PLAYWRIGHT_API_URL`      | `http://127.0.0.1:4000` | The backend the gateway relays to        |
| `AUTH_SESSION_SECRET`     | `governance-e2e-secret` | The secret the backend signs tokens with |

`AUTH_SESSION_SECRET` must match the value the backend runs with; the E2E
Compose file sets the same value on both sides.

### In CI

The `e2e` job in `.github/workflows/ci.yml` starts the Compose stack, applies
the migrations, runs the suite and uploads the Playwright report as the
`playwright-report` artifact. The job is part of `quality-gate`, so every
pull request runs it.
