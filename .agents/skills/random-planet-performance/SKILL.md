---
name: random-planet-performance
description: Safely measure and optimize the random planet search, PostgreSQL session persistence, HTTP response time, and browser rendering without changing production data or endpoint behavior.
---

# Random Planet Performance

Use this skill when investigating or optimizing the random planet search, especially the flow that stores `req.session.lastRandomVisitedId` and excludes the previously visited planet.

## Non-negotiable safety rules

- Never change, delete, truncate, or initialize the production database.
- Run benchmarks against temporary tables, a disposable database, or an isolated test environment only.
- Do not remove or overwrite unrelated user changes.
- Preserve the existing API response shape, exclusion behavior, empty-database behavior, and fallback order.
- Do not call GitHub APIs or Gemini updates during database/performance tests.

## Local-only load testing

- Run GitHubPlanet k6 load tests only against the local application: `localhost`, `127.0.0.1`, `[::1]`, or Docker's `host.docker.internal` bridge.
- Never send load to Cloud Run, Cloudflare, `githubplanet.dev`, another public URL, or a production/staging service from this workflow.
- Use the local k6 web dashboard when a visual monitor is useful; do not move this workload to Grafana Cloud k6.
- If a future request asks for a non-local load test, stop and request a separate, explicit scope and authorization instead of treating an environment variable as sufficient permission.

## Establish the baseline first

Before changing SQL, indexes, session storage, or application code, measure the current implementation. Do not conclude that it is faster from one request or one average value.

Use representative dataset sizes:

- 145 rows
- 1,000 rows
- 10,000 rows
- 100,000 rows
- 1,000,000 rows when practical

For each dataset, test all three exclusion cases:

- no excluded ID
- one excluded ID
- two excluded IDs

Warm up the process and database first, then collect at least 100 measurements per case.

## Measure each layer separately

Keep these timings separate so a slow session write is not mistaken for a slow random query:

1. PostgreSQL execution time for the random selection SQL.
2. Database round-trip time for the random selection.
3. Session persistence time, including the write to the PostgreSQL `session` table.
4. Total `/api/planets/random` HTTP time.
5. In a browser, time from API completion to planet display and the rendering FPS.

The assignment to `req.session.lastRandomVisitedId` may cause a session save before the response. Treat session persistence as a hypothesis until it has been measured independently.

## Record these results

For every case, record:

- minimum
- median
- average
- p95
- p99
- maximum
- query plan
- scan method
- rows read
- relevant database and application configuration

When using PostgreSQL plan inspection, use `EXPLAIN (ANALYZE, BUFFERS)` only against the disposable benchmark database or temporary data. Never run it in a way that modifies production data.

## Functional regression checks

After any optimization, verify that:

- the response shape is unchanged;
- excluded planets are never returned;
- the no-exclusion, one-exclusion, and two-exclusion cases all work;
- an empty database has the same behavior as before;
- fallback order is unchanged;
- random search still stores the returned planet ID as `req.session.lastRandomVisitedId` when expected;
- GitHub and Gemini update integrations are not invoked by the benchmark or random-search path.

## Acceptance criteria

Call the change an improvement only when the target dataset sizes show better p95 and p99 behavior, and excluding two IDs is not slower than the baseline. Database-only improvement is not enough: report separately whether HTTP latency and browser display time/FPS improved.

If the database becomes faster but the HTTP response or browser experience does not, describe it as a database optimization rather than claiming that the user experience became faster.

## Reporting

Report baseline and optimized measurements side by side, including the test environment and dataset size. State clearly which layer improved and which did not. If a required environment or dataset size could not be tested, say so instead of extrapolating.
