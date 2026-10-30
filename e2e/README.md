# Browser end-to-end tests

Run the isolated browser suite with:

```sh
npm ci
npx playwright install chromium
npm run test:e2e
```

The suite starts its own application server and mock GitHub OAuth/API server. It never uses a GitHub account or production credentials. The PostgreSQL title-persistence case runs only when `E2E_DATABASE_URL` points to a local disposable database named `githubplanet_e2e`; the workflow creates that database as an ephemeral service. The test runner rejects other hosts or database names and truncates test tables only in that database.

Coverage includes anonymous shared-card links, every deterministic language card, shared secondary-language trail shader compilation and time-uniform updates on a planet without a dedicated language feature, Japanese/English three-language mobile showcase layout with an active WebGL canvas, OAuth/PKCE/session/`/api/me`, PostgreSQL title persistence across a fresh OAuth session, and a signed webhook delivered to another browser over Socket.IO polling.

The trail check exercises the browser rendering runtime; it does not compare rendered colors or orbital paths against a reference image.

The current main page does not include a showcase timeline control, so the suite does not claim timeline interaction coverage. Add that interaction test when the UI is present.
