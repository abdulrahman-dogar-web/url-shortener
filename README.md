# ShortHub — URL Shortener & Analytics

A fast, premium, server-backed URL shortener with click analytics and QR codes.
Open `index.html` in any modern browser — no build step, no server to run yourself, no account, no install.

> Short links look like `https://abdulrahman-dogar-web.github.io/url-shortener/?r=xxxxxx`
> and **work on any device**: opening one looks the code up on the server,
> counts the click there, and redirects to the original URL. “My links” below
> is a cache of the links you created in this browser — clicks from anywhere
> are counted on the server and synced into it.

## Features

- **Create short links** — paste a long URL, optionally pick a custom alias
  (3–30 characters: letters, numbers, `-` or `_`). Random codes are 6 characters
  from an unambiguous alphabet (no `0`/`O`/`1`/`l`/`I`), generated with
  `crypto.getRandomValues` when available.
- **Copy button** — copies the short link with a clipboard-API fallback for older browsers.
- **Click counting** — every visit to a short link increments the counter on the server and records a timestamp in the link's click log, wherever the click came from.
- **Dashboard table** — all links with clicks, created date (relative, e.g. "2 days ago",
  full date on hover), and last-clicked time. Sort by newest / oldest / most /
  least clicked, filter by clicked / never clicked / created today, and search by
  code or URL.
- **QR codes** — one per link, generated **locally in the browser** with the
  vendored `qrcodejs` library (`vendor/qrcode.min.js`, MIT). Download the QR as
  a PNG from the dialog. If that library ever fails to load, the dialog falls back
  to a clearly labelled image from the public `api.qrserver.com` service
  (needs internet) — that fallback is optional and never used when the local
  library works.
- **Analytics** — total links, total clicks, clicks today, top link, average
  clicks per link, a **7-day bar chart drawn with plain CSS/JS** (no chart CDN),
  and a top-5 links chart.
- **Manage links** — delete one link, delete all (with confirmation), export all
  links as JSON or CSV.
- **Demo data** — a "Load demo data" button adds 3 clearly labelled demo links
  with 11 clicks so you can explore the analytics. Your own links are never
  faked: the app starts empty.
- **Persistence** — links live on the server. The table in this app is a local cache (`localStorage` key `shorthub.links.v1`) of the links you created in this browser; clearing browser data clears the cache, not the links.

## Files

| File | Purpose |
| --- | --- |
| `index.html` | The whole app shell: create form, stats, charts, links table, QR dialog. |
| `styles.css` | All styling — dark theme, responsive, no frameworks or external fonts. |
| `config.js` | Server config: KVdb bucket + prefix, `apiBase` (`""` = KVdb). |
| `store.js` | `window.KVStore`: PUT/GET/DELETE against KVdb or `apiBase`. |
| `app.js` | All logic: shortening, server storage, clicks, analytics, charts, QR dialog, export. |
| `vendor/qrcode.min.js` | Vendored `qrcodejs` 1.0.0 (davidshimjs, MIT) for offline QR generation. |
| `README.md` | This file. |
| `LICENSE` | MIT License, © 2026 Mr. Abdul Rahman Dogar. |
| `.gitignore` | Ignores OS/editor junk and `node_modules/` (there are no dependencies). |

## Run it

1. Download or clone this folder.
2. Open `index.html` in a browser (double-click it, or serve it — see below).
3. Paste a long URL, click **Shorten URL**, then **Copy** or **Visit & count click**.
4. Open the short link on any device — it redirects to the original URL and the click count goes up. Reload this page and confirm the server click count is synced into the table.

Note: the KVdb account behind the configured bucket must be email-verified before server writes work; until then, creating a link shows “Could not reach the server — try again.”

Serving it locally (optional, avoids any `file://` quirks in some browsers):

```bash
# Python 3
python3 -m http.server 8000
# then open http://localhost:8000

# or Node.js
npx serve .
```

## How it works (server-backed)

- **Storage:** one server record per short code, `{ v, code, target, createdAt, clicks, lastClickedAt, clickLog[] }`, stored in KVdb under the `us:` prefix (or in a self-hosted backend when `config.js` sets `apiBase`). The app in this browser keeps a local cache of the links it created, under `localStorage` key `shorthub.links.v1`.
  `clickLog` keeps up to 500 timestamps per link; the 7-day chart is computed
  from those timestamps, so it stays correct across reloads.
- **Short codes:** random 6-character codes, checked for collisions against the server (a `GET` first, regenerate if taken); custom aliases are validated and checked for duplicates the same way.
- **Short links:** the real GitHub Pages URL plus `?r=<code>`, e.g. `https://abdulrahman-dogar-web.github.io/url-shortener/?r=abc123`. On page load with `?r=<code>` (or `#r=<code>`), the app fetches the record from the server, increments the click count there, and redirects with `window.location.replace(target)`. An unknown code shows a clear “link not found” page instead of redirecting.
- **Clicks:** counted on the server inside the redirect, so clicks from any device are counted. The dashboard re-syncs the server counts into the local cache on load.
- **QR codes:** `QRCode` from the vendored library renders a table/canvas in
  the dialog, encoding the real short link; the PNG download reads that canvas. No QR data leaves the browser.

## Switching backends

The default backend is KVdb (configured in `config.js`). To use the
self-hosted backend instead, set `apiBase` in `config.js` to the backend
origin — the front end then uses `PUT/GET/DELETE {apiBase}/v1/kv/{prefix}{key}`
with a JSON body, and nothing else changes. KVdb has a rate limit (1000
requests/hour on the bucket used here); there is no auth on link creation in
this static front end, so do not use it for anything abuse-sensitive without
adding rate limiting / a blocklist in front of it.

## Testing

- `node --check app.js` / `node --check store.js` / `node --check config.js` — syntax checks (must exit 0).
- Open `index.html`, create a link, copy it, click "Visit", and confirm the
  click count, "last clicked", total clicks and the 7-day chart all update,
  then reload the page and confirm the link is still there.
- Headless flow test against a local mock KVdb server (mock + test scripts are
  not shipped — see `TEST-LOG.md` for the exact checks and how they were run):
  the `ShortHub` API exported by `app.js` was exercised in Node with a
  `localStorage` stub — create with auto code and custom alias, validation
  rejections, collision handling, resolve → redirect target with the click
  count incrementing on the server, unknown code → null, stats, 7-day chart
  totals, search/filter/sort, CSV export, delete and delete-all, and
  50 generated codes (all 6 characters, unambiguous alphabet).

## Browser support

Any modern browser with `localStorage`, `URL`, and `crypto.getRandomValues`
(Chrome, Edge, Firefox, Safari — current versions, plus the last few years).
No build step and no dependencies to install.

## License

MIT License — see [LICENSE](LICENSE). Copyright © 2026 Mr. Abdul Rahman Dogar.
