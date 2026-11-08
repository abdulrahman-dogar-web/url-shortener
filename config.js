/* ShortHub — server configuration.
 *
 * The app talks to the live backend at apiBase (Vercel + Vercel Blob,
 * durable storage) — PUT/GET/DELETE {apiBase}/v1/kv/{prefix}{key}.
 * Set apiBase to "" to fall back to KVdb directly (bucket below).
 *
 * © 2026 Mr. Abdul Rahman Dogar
 */
window.APP_CONFIG = {
  bucket: "R3J1t5fYRx6t5bcaSorAfj",
  prefix: "us:",
  apiBase: "https://apps-backend.abdulrahman-dogar.workers.dev"
};
