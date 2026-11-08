/* KVStore — shared key-value data layer for SecretDrop / ShortHub.
 *
 * Plain <script>, no modules, no dependencies. Exposes window.KVStore:
 *   configure({ bucket, prefix, apiBase })
 *   put(key, value) -> Promise<boolean>
 *   get(key)        -> Promise<any|null>   (null when the key does not exist)
 *   del(key)        -> Promise<boolean>
 *
 * Backends (selected by window.APP_CONFIG in config.js):
 *  - apiBase set:  PUT/GET/DELETE {apiBase}/v1/kv/{prefix}{key}, JSON body.
 *  - apiBase empty (default): KVdb — PUT/GET/DELETE
 *    https://kvdb.io/{bucket}/{prefix}{key}, PUT with
 *    Content-Type "text/plain" and a JSON-string body (avoids a CORS preflight).
 * Keys are encodeURIComponent'd. put/del never throw on 4xx (or on network
 * failure) — they resolve false instead. get resolves null on 404.
 *
 * © 2026 Mr. Abdul Rahman Dogar
 */
(function () {
  "use strict";

  var cfg = { bucket: "", prefix: "", apiBase: "" };

  function configure(options) {
    options = options || {};
    if (typeof options.bucket === "string") cfg.bucket = options.bucket;
    if (typeof options.prefix === "string") cfg.prefix = options.prefix;
    if (typeof options.apiBase === "string") cfg.apiBase = options.apiBase;
    return cfg;
  }

  function urlFor(key) {
    var k = encodeURIComponent(String(key));
    if (cfg.apiBase) {
      return String(cfg.apiBase).replace(/\/+$/, "") + "/v1/kv/" + cfg.prefix + k;
    }
    return "https://kvdb.io/" + cfg.bucket + "/" + cfg.prefix + k;
  }

  function put(key, value) {
    if (typeof fetch !== "function") return Promise.resolve(false);
    var headers = cfg.apiBase
      ? { "Content-Type": "application/json" }
      : { "Content-Type": "text/plain" };
    return fetch(urlFor(key), {
      method: "PUT",
      headers: headers,
      body: JSON.stringify(value)
    }).then(function (res) { return !!res.ok; })
      .catch(function () { return false; });
  }

  function get(key) {
    if (typeof fetch !== "function") return Promise.resolve(null);
    return fetch(urlFor(key), { method: "GET" }).then(function (res) {
      if (res.status === 404) return null;
      if (!res.ok) throw new Error("KVStore GET failed with HTTP " + res.status);
      return res.text().then(function (text) {
        if (!text) return null;
        try { return JSON.parse(text); } catch (e) { return text; }
      });
    });
  }

  function del(key) {
    if (typeof fetch !== "function") return Promise.resolve(false);
    return fetch(urlFor(key), { method: "DELETE" })
      .then(function (res) { return !!res.ok; })
      .catch(function () { return false; });
  }

  var api = { configure: configure, put: put, get: get, del: del };

  if (typeof window !== "undefined") window.KVStore = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
