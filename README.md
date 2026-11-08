# ShortHub — URL Shortener & Analytics

A fast, premium, fully client-side URL shortener with click analytics and QR codes.
Open `index.html` in any modern browser — no build step, no server, no account, no install.

> **Honest label:** this is a **local demo**. Short links (shown as `hub.ly/xxxxxx`)
> only work inside this app, in this browser. Clicking one opens the original URL
> and counts the click here. Nothing is uploaded anywhere. See
> [Deploying a real backend](#deploying-a-real-backend) below for how to make
> short links work for everyone, everywhere.

## Features

- **Create short links** — paste a long URL, optionally pick a custom alias
  (3–30 characters: letters, numbers, `-` or `_`). Random codes are 6 characters
  from an unambiguous alphabet (no `0`/`O`/`1`/`l`/`I`), generated with
  `crypto.getRandomValues` when available.
- **Copy button** — copies the short link with a clipboard-API fallback for older browsers.
- **Click counting** — every visit (table link, "Visit" button, or the result-box
  link) increments the counter and records a timestamp in the link's click log.
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
- **Persistence** — links survive reloads via `localStorage` key `shorthub.links.v1`.
  Clearing browser data deletes them.

## Files

| File | Purpose |
| --- | --- |
| `index.html` | The whole app shell: create form, stats, charts, links table, QR dialog. |
| `styles.css` | All styling — dark theme, responsive, no frameworks or external fonts. |
| `app.js` | All logic: shortening, storage, clicks, analytics, charts, QR dialog, export. |
| `vendor/qrcode.min.js` | Vendored `qrcodejs` 1.0.0 (davidshimjs, MIT) for offline QR generation. |
| `README.md` | This file. |
| `LICENSE` | MIT License, © 2026 Mr. Abdul Rahman Dogar. |
| `.gitignore` | Ignores OS/editor junk and `node_modules/` (there are no dependencies). |

## Run the demo

1. Download or clone this folder.
2. Open `index.html` in a browser (double-click it, or serve it — see below).
3. Paste a long URL, click **Shorten URL**, then **Copy** or **Visit & count click**.
4. Click a short link in the table to record a click and watch the stats and
   7-day chart update. Use **QR** on any row for its QR code.

Serving it locally (optional, avoids any `file://` quirks in some browsers):

```bash
# Python 3
python3 -m http.server 8000
# then open http://localhost:8000

# or Node.js
npx serve .
```

## How it works (design notes)

- **Storage:** one `localStorage` array. Each link is
  `{ id, code, longUrl, shortUrl, createdAt, clicks, lastClickedAt, clickLog[] }`.
  `clickLog` keeps up to 500 timestamps per link; the 7-day chart is computed
  from those timestamps, so it stays correct across reloads.
- **Short codes:** random 6-character codes, checked for collisions against
  existing codes; custom aliases are validated and checked for duplicates.
- **Clicks:** counted on the client when a link is opened from this app.
  There is no server, so clicks from other people/devices cannot be seen —
  that is the fundamental limit of a client-side demo, and why a real backend
  is needed for production (below).
- **QR codes:** `QRCode` from the vendored library renders a table/canvas in
  the dialog; the PNG download reads that canvas. No QR data leaves the browser.

## Deploying a real backend

Design notes only — **no backend is included or faked in this repo.** To turn
this into a production shortener, keep this front end and add:

1. **Redirect service** — e.g. a Cloudflare Worker, Vercel/Netlify serverless
   function, or a small Node/Express app. `GET /:code` looks the code up and
   issues a `301`/`302` redirect to the stored long URL. That is what makes
   `hub.ly/xxxxxx` work for anyone who clicks it, not just in this browser.
2. **Database** — Cloudflare KV / D1, Vercel KV / Postgres, Supabase, or
   DynamoDB. Store `code → longUrl, createdAt, ownerId` plus a clicks table or
   counter. Add a unique index on `code` so alias collisions are impossible.
3. **Click tracking** — increment the counter (and append a timestamp, country,
   referrer, device) inside the redirect handler, before redirecting. Use an
   atomic increment; do not trust a count sent from the browser.
4. **API for this front end** — `POST /api/links` (create, with server-side URL
   validation, alias validation and rate limiting), `GET /api/links` (list the
   signed-in user's links), `DELETE /api/links/:code`, `GET /api/stats`.
   Replace the `localStorage` calls in `app.js` with `fetch()` calls to these
   endpoints; keep `localStorage` only as an offline cache if you want one.
5. **Real domain + HTTPS** — buy/register a short domain, point its DNS at the
   Worker/function, and serve everything over HTTPS. The `hub.ly` domain in
   this demo is a display label only and is not owned or configured here.
6. **Abuse protection** — auth for creating links (or at least per-IP rate
   limits), a blocklist for phishing/malware URLs, `rel="nofollow"` on
   user-submitted links, and expiry for unused codes.

Rough effort: a Cloudflare Worker + KV version is a weekend-sized project;
a full product with accounts, custom domains and detailed analytics is larger.

## Testing

- `node --check app.js` — syntax check (must exit 0).
- Open `index.html`, create a link, copy it, click "Visit", and confirm the
  click count, "last clicked", total clicks and the 7-day chart all update,
  then reload the page and confirm the link is still there.
- Headless logic test (run during the build, not shipped as a dependency):
  the `ShortHub` API exported by `app.js` was exercised in Node with a
  `localStorage` stub — create with auto code and custom alias, validation
  rejections, 3 clicks on one link + 1 on another, stats (2 links, 4 clicks,
  4 today, correct top link), 7-day chart totals, search/filter/sort,
  persistence across a fresh load, CSV export, delete and delete-all, and
  50 generated codes (all 6 characters, unambiguous alphabet). All 11 checks passed.

## Browser support

Any modern browser with `localStorage`, `URL`, and `crypto.getRandomValues`
(Chrome, Edge, Firefox, Safari — current versions, plus the last few years).
No build step and no dependencies to install.

## License

MIT License — see [LICENSE](LICENSE). Copyright © 2026 Mr. Abdul Rahman Dogar.
