# Rate limiting and slowdown

The API limits requests per client IP in two stages: `express-slow-down` delays
a client that is sending too much, and `express-rate-limit` rejects it with
`429` if it keeps going. Both live in `backend/src/api/middleware/rateLimit.ts`.

## Limits

All windows are 60 seconds. "Slowdown" is the number of requests served at full
speed before each further request is delayed by one more step than the last,
up to the cap.

| Scope                             | Slowdown after | Step   | Delay cap | Hard limit (429) |
| --------------------------------- | -------------- | ------ | --------- | ---------------- |
| Whole API (`/api/v1`)             | 150            | 50 ms  | 2 s       | 300              |
| `/api/v1/auth`                    | 5              | 250 ms | 5 s       | 20               |
| `/api/v1/tokens`                  | 10             | 200 ms | 4 s       | 30               |
| Write routes (communities, loans) | none           | n/a    | n/a       | 10 (writes only) |

Limits stack: a request to `/api/v1/auth` counts against the API-wide limit and
the auth limit. `/health` is outside `/api/v1` and is never limited, so
orchestrator probes cannot be locked out. `/api/v1/webhooks` is also exempt: its
deliveries are HMAC-signed and arrive in bursts from few IPs. The pre-existing per-IP limit on failed
`POST /auth/verify` attempts is unchanged.

A throttled response is `429` with `{ "data": null, "error": "Too many requests, please try again later" }`
and the standard `RateLimit` headers (`standardHeaders: true`, unchanged from before).

## Redis store

When `REDIS_URL` is set, counters live in Redis (`rate-limit-redis`), so a limit
holds across every backend instance, including the two slots during a blue/green
deploy. Keys are namespaced `rl:<limiter>:` and the slowdown and hard limit for
the same route use separate keys. The connection is the shared `redisCache`
client used for the price and balance caches.

When `REDIS_URL` is not set, each limiter uses its own in-memory store. That is
correct for local development and a single instance, but limits are then per
process.

## Failure behaviour: fail open

If Redis cannot be reached or a command times out (1 second), the request is
**allowed** and a warning is logged (`passOnStoreError`). A cache outage should
not become an API outage. The cost is real: while Redis is down, limits are not
enforced, and auth brute-force protection weakens with them. Alert on the
`Rate limit store could not load Redis scripts` and `Redis command timed out`
log lines. The store reloads its scripts on the next request after Redis
returns, with no restart.

## Behind a proxy

Limits are keyed on `req.ip`. Behind nginx or a load balancer that is the proxy's
address unless Express is told to trust it, which would throttle every client as
one. Set `TRUST_PROXY` to the number of proxy hops (`1` for the bundled nginx).
Do not set it when the API is exposed directly, because clients could then spoof
`X-Forwarded-For` to dodge limits.

## Tests

Limiters are skipped when `NODE_ENV=test` so suites are not throttled.
`createRateLimiter` and `createSlowDown` take `enforceInTests` for suites that
exercise them directly:

- `backend/src/api/middleware/__tests__/rateLimit.test.ts`: 429 after the limit,
  per-IP counting, write-only skipping, progressive delay and its cap, slowdown
  ahead of the hard limit, fail-open on store errors, recovery after Redis returns.
- `backend/src/api/middleware/__tests__/rateLimit.redis.integration.test.ts`:
  two independent instances share one counter through real Redis. Runs when
  `REDIS_URL` is set (as in the CI `test-backend` job) and is skipped otherwise.
