# ShortHub — Test Log

Date: 2026-11-08. Scope: server-backed rebuild (KVdb via `store.js` / `config.js`).

## How it was tested

- **Syntax:** `node --check` on `config.js`, `store.js`, `app.js` — all exit 0.
- **Flow tests:** the real `store.js`, `config.js` and `app.js`
  (`window.ShortHub` API) were loaded in Node (minimal DOM/`localStorage`
  stubs) and driven against a local mock KVdb server
  (`/tmp/kvdb-mock/server.js`, in-memory, same
  `PUT/GET/DELETE /{bucket}/{key}` paths). `https://kvdb.io/…` fetches were
  rewritten to the mock so the real KVdb URL shape and `text/plain` PUT were
  exercised. No live KVdb request was made — the live KVdb account still
  needs email verification (parent's step), so live behaviour is
  **not yet verified**; the code paths are identical, only the transport
  origin differs.
- **"Second device":** a fresh Node process with empty `localStorage`
  (`/tmp/kvdb-mock/device-b-shortener.js`) that loads the real app files and
  calls `ShortHub.resolveCode(code)` — the same step the `?r=<code>` page
  load does.
- Test scripts (not shipped): `/tmp/kvdb-mock/test-shortener.js`,
  `/tmp/kvdb-mock/device-b-shortener.js`, `/tmp/kvdb-mock/server.js`,
  `/tmp/kvdb-mock/harness.js`.

## Results — 19/19 passed

| # | Check | Result |
|---|---|---|
| U0 | `config.js` has bucket `R3J1t5fYRx6t5bcaSorAfj`, prefix `us:`, `apiBase: ""` | PASS |
| U1 | `createLink` auto code: ok, 6 URL-safe chars, short URL is `https://abdulrahman-dogar-web.github.io/url-shortener/?r=<code>` | PASS |
| U1 | Server record is `{target, createdAt, clicks:0}` | PASS |
| U2 | Custom alias creates the real short link (`?r=my-link`) | PASS |
| U2 | Duplicate alias rejected (server GET found it taken) | PASS |
| U3 | Invalid URL and invalid alias rejected | PASS |
| U5 | Second device (fresh process) resolves `?r=<code>` to the target URL | PASS |
| U5 | Click count increments on the server after resolve (clicks=1) | PASS |
| U5 | Second resolve increments again (clicks=2) | PASS |
| U5 | Unknown code resolves to `null` (link-not-found page path) | PASS |
| U6 | `recordClick` increments the server count (clicks=3) | PASS |
| U6 | Stats: 2 links, 3 total clicks, correct top link | PASS |
| U7 | `refreshCounts` pulls the server click count into the local list (clicks=10) | PASS |
| U11 | 7-day chart totals match clicks (10); filter finds clicked links; CSV has 3 rows | PASS |
| U11 | 50 generated codes: all 6 chars, unambiguous alphabet | PASS |
| U8 | `deleteLink` removes the server record and the cached row | PASS |
| U8 | Resolving a deleted code returns `null` | PASS |
| U8 | `deleteAllLinks` empties the cache (and server records) | PASS |
| U9 | `apiBase` path: create + resolve via `/v1/kv/us:<key>` | PASS |

Note: one U11 assertion initially failed because the test bumped the `clicks`
counter without adding matching click-log entries (the 7-day chart correctly
counts log entries). The test was fixed to bump both; the app code was not
changed for this.

## Not covered by these tests (needs a browser / live KVdb)

- The rendered UI, the `?r=<code>` page-load redirect itself
  (`window.location.replace`), the "link not found" page rendering, and QR
  generation — these are DOM code paths; the server logic they call
  (`resolveCode`) is tested above.
- Live KVdb: same code paths, but unverified until the KVdb account's email
  is verified and a real PUT succeeds from the Pages site.

## License

MIT License — © 2026 Mr. Abdul Rahman Dogar.
