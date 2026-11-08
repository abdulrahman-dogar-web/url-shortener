/* ShortHub — URL Shortener & Analytics
 * Fully client-side demo. All links live in localStorage under STORAGE_KEY.
 * No network request is made for shortening, counting or charting.
 * QR codes are generated locally with the vendored qrcodejs library
 * (vendor/qrcode.min.js); if that library is unavailable, the QR dialog
 * falls back to a labelled api.qrserver.com image (optional, online only).
 */
(function () {
  'use strict';

  var STORAGE_KEY = 'shorthub.links.v1';
  var SHORT_DOMAIN = 'hub.ly';
  var CODE_LENGTH = 6;
  var CODE_CHARS = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no 0/O/1/l/I
  var ALIAS_RE = /^[A-Za-z0-9_-]{3,30}$/;
  var MAX_CLICK_LOG = 500;

  var hasDocument = typeof document !== 'undefined';
  var hasWindow = typeof window !== 'undefined';
  var hasLocalStorage = false;
  try { hasLocalStorage = typeof localStorage !== 'undefined' && !!localStorage.getItem; } catch (e) { hasLocalStorage = false; }

  /* ---------------- pure helpers (also exposed for testing) ---------------- */

  function generateCode(length) {
    var n = length || CODE_LENGTH;
    var out = '';
    var cryptoObj = (hasWindow && window.crypto && window.crypto.getRandomValues) ? window.crypto : null;
    if (cryptoObj) {
      var buf = new Uint32Array(n);
      cryptoObj.getRandomValues(buf);
      for (var i = 0; i < n; i++) out += CODE_CHARS[buf[i] % CODE_CHARS.length];
    } else {
      for (var j = 0; j < n; j++) out += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
    }
    return out;
  }

  function normalizeUrl(raw) {
    var value = String(raw || '').trim();
    if (!value) return '';
    if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(value)) value = 'https://' + value;
    return value;
  }

  function isValidUrl(raw) {
    var value = normalizeUrl(raw);
    try {
      var parsed = new URL(value);
      return (parsed.protocol === 'http:' || parsed.protocol === 'https:') && parsed.hostname.indexOf('.') !== -1;
    } catch (e) { return false; }
  }

  function isValidAlias(alias) { return ALIAS_RE.test(alias); }

  function shortDisplay(code) { return SHORT_DOMAIN + '/' + code; }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function formatDate(iso) {
    if (!iso) return '—';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) +
      ' ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  }

  function timeAgo(iso) {
    if (!iso) return 'Never';
    var diff = Date.now() - new Date(iso).getTime();
    if (isNaN(diff) || diff < 0) return 'Just now';
    var min = Math.floor(diff / 60000);
    if (min < 1) return 'Just now';
    if (min < 60) return min + ' min ago';
    var h = Math.floor(min / 60);
    if (h < 24) return h + ' hr ago';
    var d = Math.floor(h / 24);
    if (d < 30) return d + ' day' + (d === 1 ? '' : 's') + ' ago';
    return formatDate(iso);
  }

  function startOfDay(d) { var c = new Date(d); c.setHours(0, 0, 0, 0); return c; }
  function sameDay(a, b) { return startOfDay(a).getTime() === startOfDay(b).getTime(); }

  /* ---------------- storage ---------------- */

  var memoryFallback = [];
  function loadLinks() {
    if (!hasLocalStorage) return memoryFallback.slice();
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      var parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) { return []; }
  }

  function saveLinks(links) {
    if (!hasLocalStorage) { memoryFallback = links.slice(); return; }
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(links)); } catch (e) { /* storage full/blocked: keep in-memory copy */ memoryFallback = links.slice(); }
  }

  /* ---------------- core actions (pure-ish, DOM-free) ---------------- */

  function findByCode(links, code) {
    var lower = String(code).toLowerCase();
    for (var i = 0; i < links.length; i++) if (links[i].code.toLowerCase() === lower) return links[i];
    return null;
  }

  // Returns { ok, link } or { ok:false, error } — never throws for bad input.
  function createLink(longUrlRaw, aliasRaw) {
    var longUrl = normalizeUrl(longUrlRaw);
    if (!isValidUrl(longUrlRaw)) return { ok: false, error: 'Enter a valid URL, for example https://example.com/page' };
    var alias = String(aliasRaw || '').trim();
    if (alias && !isValidAlias(alias)) return { ok: false, error: 'Custom alias must be 3–30 characters: letters, numbers, - or _ only.' };

    var links = loadLinks();
    if (alias && findByCode(links, alias)) return { ok: false, error: 'That alias is already taken. Try a different one.' };

    var code = alias || generateCode();
    var guard = 0;
    while (!alias && findByCode(links, code) && guard < 50) { code = generateCode(); guard++; }
    if (findByCode(links, code)) return { ok: false, error: 'Could not generate a unique code. Please try again.' };

    var now = new Date().toISOString();
    var link = {
      id: 'l_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8),
      code: code,
      longUrl: longUrl,
      shortUrl: shortDisplay(code),
      createdAt: now,
      clicks: 0,
      lastClickedAt: null,
      clickLog: []
    };
    links.unshift(link);
    saveLinks(links);
    return { ok: true, link: link };
  }

  function recordClick(id) {
    var links = loadLinks();
    for (var i = 0; i < links.length; i++) {
      if (links[i].id === id) {
        links[i].clicks += 1;
        links[i].lastClickedAt = new Date().toISOString();
        links[i].clickLog = links[i].clickLog || [];
        links[i].clickLog.push(links[i].lastClickedAt);
        if (links[i].clickLog.length > MAX_CLICK_LOG) links[i].clickLog = links[i].clickLog.slice(-MAX_CLICK_LOG);
        saveLinks(links);
        return links[i];
      }
    }
    return null;
  }

  function deleteLink(id) {
    var links = loadLinks().filter(function (l) { return l.id !== id; });
    saveLinks(links);
    return links;
  }

  function deleteAllLinks() { saveLinks([]); return []; }

  function getStats(links) {
    var totalClicks = 0, todayClicks = 0, top = null;
    var now = new Date();
    links.forEach(function (l) {
      totalClicks += l.clicks || 0;
      if (l.clickLog) l.clickLog.forEach(function (ts) { if (sameDay(new Date(ts), now)) todayClicks++; });
      if (!top || (l.clicks || 0) > (top.clicks || 0)) top = l;
    });
    return {
      totalLinks: links.length,
      totalClicks: totalClicks,
      clicksToday: todayClicks,
      avgClicks: links.length ? (totalClicks / links.length) : 0,
      topLink: top && top.clicks > 0 ? top : null
    };
  }

  // Clicks per day for the last 7 days (oldest -> today), from clickLog timestamps.
  function getLast7Days(links) {
    var days = [];
    for (var i = 6; i >= 0; i--) {
      var d = new Date(); d.setDate(d.getDate() - i);
      days.push({ date: d, label: d.toLocaleDateString(undefined, { weekday: 'short' }), clicks: 0, isToday: i === 0 });
    }
    links.forEach(function (l) {
      (l.clickLog || []).forEach(function (ts) {
        var t = new Date(ts);
        for (var j = 0; j < days.length; j++) if (sameDay(t, days[j].date)) days[j].clicks++;
      });
    });
    return days;
  }

  function filteredLinks(links, query, sort, filter) {
    var q = String(query || '').trim().toLowerCase();
    var out = links.filter(function (l) {
      if (q && l.code.toLowerCase().indexOf(q) === -1 && l.longUrl.toLowerCase().indexOf(q) === -1) return false;
      if (filter === 'clicked') return (l.clicks || 0) > 0;
      if (filter === 'never') return (l.clicks || 0) === 0;
      if (filter === 'today') return sameDay(new Date(l.createdAt), new Date());
      return true;
    });
    var sorted = out.slice();
    if (sort === 'oldest') sorted.sort(function (a, b) { return new Date(a.createdAt) - new Date(b.createdAt); });
    else if (sort === 'most-clicked') sorted.sort(function (a, b) { return (b.clicks || 0) - (a.clicks || 0); });
    else if (sort === 'least-clicked') sorted.sort(function (a, b) { return (a.clicks || 0) - (b.clicks || 0); });
    else sorted.sort(function (a, b) { return new Date(b.createdAt) - new Date(a.createdAt); });
    return sorted;
  }

  function toCSV(links) {
    var rows = [['short_link', 'original_url', 'clicks', 'created_at', 'last_clicked_at']];
    links.forEach(function (l) {
      rows.push([l.shortUrl, l.longUrl, String(l.clicks || 0), l.createdAt || '', l.lastClickedAt || '']);
    });
    return rows.map(function (r) { return r.map(function (c) { return '"' + String(c).replace(/"/g, '""') + '"'; }).join(','); }).join('\n');
  }

  /* ---------------- DOM helpers (no-ops outside a browser) ---------------- */

  function $(id) { return hasDocument ? document.getElementById(id) : null; }
  function on(el, event, fn) { if (el && el.addEventListener) el.addEventListener(event, fn); }
  function show(el, visible) { if (el) el.hidden = !visible; }

  function toast(message, type) {
    var wrap = $('toast-wrap');
    if (!wrap) return;
    var t = document.createElement('div');
    t.className = 'toast' + (type ? ' ' + type : '');
    t.textContent = message;
    wrap.appendChild(t);
    setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 3200);
  }

  function copyText(text, successMessage) {
    function done() { toast(successMessage || 'Copied to clipboard', 'success'); }
    function fallback() {
      try {
        var ta = document.createElement('textarea');
        ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.select();
        document.execCommand('copy'); document.body.removeChild(ta); done();
      } catch (e) { toast('Copy failed — select the link manually', 'error'); }
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(fallback);
    } else fallback();
  }

  function downloadFile(filename, content, mime) {
    var blob = new Blob([content], { type: mime || 'text/plain' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    setTimeout(function () { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
  }

  /* ---------------- rendering ---------------- */

  var currentResult = null; // last created link, for the result box + QR dialog

  function renderAll() {
    var links = loadLinks();
    renderStats(links);
    renderWeekChart(links);
    renderTopList(links);
    renderTable();
  }

  function renderStats(links) {
    var s = getStats(links);
    var set = function (id, text) { var el = $(id); if (el) el.textContent = text; };
    set('stat-total-links', String(s.totalLinks));
    set('stat-total-clicks', String(s.totalClicks));
    set('stat-clicks-today', String(s.clicksToday));
    set('stat-links-sub', s.totalLinks === 0 ? 'No links yet' : (s.totalLinks === 1 ? '1 link stored locally' : s.totalLinks + ' links stored locally'));
    set('stat-clicks-sub', s.totalLinks === 0 ? 'No clicks yet' : ('Avg ' + s.avgClicks.toFixed(1) + ' per link'));
    set('stat-top-link', s.topLink ? s.topLink.shortUrl : '—');
    set('stat-top-sub', s.topLink ? (s.topLink.clicks + ' click' + (s.topLink.clicks === 1 ? '' : 's')) : 'No clicks yet');
  }

  function renderWeekChart(links) {
    var chart = $('week-chart');
    var empty = $('week-empty');
    if (!chart) return;
    var days = getLast7Days(links);
    var max = Math.max.apply(null, days.map(function (d) { return d.clicks; }).concat([1]));
    var total = days.reduce(function (sum, d) { return sum + d.clicks; }, 0);
    chart.innerHTML = days.map(function (d) {
      var height = Math.max(4, Math.round((d.clicks / max) * 100));
      return '<div class="bar-col' + (d.isToday ? ' today' : '') + '" title="' + escapeHtml(d.label) + ': ' + d.clicks + ' click' + (d.clicks === 1 ? '' : 's') + '">' +
        '<span class="bar-value">' + d.clicks + '</span>' +
        '<div class="bar" style="height:' + height + '%"></div>' +
        '<span class="bar-label">' + escapeHtml(d.label) + '</span></div>';
    }).join('');
    chart.setAttribute('aria-label', 'Bar chart of clicks in the last 7 days. Total: ' + total + ' clicks.');
    if (empty) show(empty, total === 0);
  }

  function renderTopList(links) {
    var list = $('top-list');
    var empty = $('top-empty');
    if (!list) return;
    var top = links.slice().sort(function (a, b) { return (b.clicks || 0) - (a.clicks || 0); }).slice(0, 5);
    var max = top.length ? Math.max.apply(null, top.map(function (l) { return l.clicks || 0; }).concat([1])) : 1;
    var hasClicks = top.some(function (l) { return (l.clicks || 0) > 0; });
    list.innerHTML = hasClicks ? top.filter(function (l) { return (l.clicks || 0) > 0; }).map(function (l) {
      var pct = Math.max(4, Math.round(((l.clicks || 0) / max) * 100));
      return '<div class="top-row"><span class="top-code">' + escapeHtml(l.shortUrl) + '</span>' +
        '<span class="top-count">' + (l.clicks || 0) + ' click' + ((l.clicks || 0) === 1 ? '' : 's') + '</span>' +
        '<span class="top-bar-track"><span class="top-bar-fill" style="display:block;width:' + pct + '%"></span></span></div>';
    }).join('') : '';
    if (empty) show(empty, !hasClicks);
  }

  function renderTable() {
    var body = $('links-body');
    if (!body) return;
    var searchEl = $('search'), sortEl = $('sort'), filterEl = $('filter');
    var links = loadLinks();
    var rows = filteredLinks(links, searchEl ? searchEl.value : '', sortEl ? sortEl.value : 'newest', filterEl ? filterEl.value : 'all');
    var countEl = $('links-count'); if (countEl) countEl.textContent = String(links.length);
    var emptyState = $('empty-state'); if (emptyState) emptyState.classList.toggle('show', links.length === 0);
    var noResults = $('no-results'); if (noResults) show(noResults, links.length > 0 && rows.length === 0);

    body.innerHTML = rows.map(function (l) {
      return '<tr>' +
        '<td class="short-cell"><a href="' + escapeHtml(l.longUrl) + '" target="_blank" rel="noopener" data-visit="' + escapeHtml(l.id) + '" title="Open original URL and count a click">' + escapeHtml(l.shortUrl) + '</a></td>' +
        '<td class="long-cell"><a href="' + escapeHtml(l.longUrl) + '" target="_blank" rel="noopener" data-visit="' + escapeHtml(l.id) + '" title="' + escapeHtml(l.longUrl) + '">' + escapeHtml(l.longUrl) + '</a></td>' +
        '<td><span class="click-badge">' + (l.clicks || 0) + '</span></td>' +
        '<td class="muted-cell" title="' + escapeHtml(formatDate(l.createdAt)) + '">' + escapeHtml(timeAgo(l.createdAt)) + '</td>' +
        '<td class="muted-cell">' + (l.lastClickedAt ? escapeHtml(timeAgo(l.lastClickedAt)) : 'Never') + '</td>' +
        '<td><div class="row-actions">' +
        '<button type="button" class="icon-btn" data-copy="' + escapeHtml(l.id) + '">Copy</button>' +
        '<button type="button" class="icon-btn" data-qr="' + escapeHtml(l.id) + '">QR</button>' +
        '<button type="button" class="icon-btn" data-visit-btn="' + escapeHtml(l.id) + '">Visit</button>' +
        '<button type="button" class="icon-btn danger" data-delete="' + escapeHtml(l.id) + '">Delete</button>' +
        '</div></td></tr>';
    }).join('');
  }

  /* ---------------- QR dialog ---------------- */

  function openQR(link) {
    var modal = $('qr-modal'), box = $('qr-box'), label = $('qr-short-label'), note = $('qr-note');
    if (!modal || !box) return;
    currentResult = link;
    if (label) label.textContent = link.shortUrl;
    box.innerHTML = '';
    if (typeof QRCode !== 'undefined') {
      try {
        new QRCode(box, { text: link.longUrl, width: 180, height: 180, correctLevel: QRCode.CorrectLevel.M });
        if (note) note.textContent = 'Scan with your phone camera to open the original URL. Generated locally in your browser.';
      } catch (e) { fallbackQR(box, link, note); }
    } else {
      fallbackQR(box, link, note);
    }
    show(modal, true);
  }

  function fallbackQR(box, link, note) {
    // Optional online fallback only — the vendored library is the primary path.
    var img = document.createElement('img');
    img.alt = 'QR code for ' + link.shortUrl;
    img.src = 'https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=' + encodeURIComponent(link.longUrl);
    box.appendChild(img);
    if (note) note.textContent = 'Local QR library unavailable — QR image loaded from the public api.qrserver.com service (needs internet).';
  }

  function closeQR() { var modal = $('qr-modal'); if (modal) show(modal, false); }

  function downloadQR() {
    var box = $('qr-box');
    if (!box || !currentResult) return;
    var img = box.querySelector('img');
    var canvas = box.querySelector('canvas');
    if (canvas) {
      var a = document.createElement('a');
      a.href = canvas.toDataURL('image/png');
      a.download = 'shorthub-qr-' + currentResult.code + '.png';
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      toast('QR code downloaded', 'success');
    } else if (img) {
      window.open(img.src, '_blank', 'noopener');
      toast('QR image opened in a new tab — save it from there', 'success');
    }
  }

  /* ---------------- demo data (clearly labelled, opt-in only) ---------------- */

  function loadDemoData() {
    if (loadLinks().length > 0 && !window.confirm('Demo data will be added alongside your existing links. Continue?')) return;
    var now = Date.now();
    var day = 86400000;
    function demoLink(code, longUrl, daysAgo, clickDaysAgo) {
      var created = new Date(now - daysAgo * day).toISOString();
      var clickLog = (clickDaysAgo || []).map(function (d) { return new Date(now - d * day - 3600000).toISOString(); });
      return {
        id: 'demo_' + code, code: code, longUrl: longUrl, shortUrl: shortDisplay(code),
        createdAt: created, clicks: clickLog.length,
        lastClickedAt: clickLog.length ? clickLog[clickLog.length - 1] : null, clickLog: clickLog
      };
    }
    var demo = [
      demoLink('launch1', 'https://example.com/product-launch', 6, [0, 0, 1, 1, 2, 3, 5]),
      demoLink('blog42', 'https://example.com/blog/how-to-shorten-links', 4, [0, 1, 2]),
      demoLink('summer', 'https://example.com/summer-sale-2026', 2, [0])
    ];
    saveLinks(demo.concat(loadLinks()));
    renderAll();
    toast('Demo data loaded — 3 links, 11 clicks', 'success');
  }

  /* ---------------- wiring ---------------- */

  function showResult(link) {
    currentResult = link;
    var result = $('result');
    if (!result) return;
    var shortEl = $('result-short');
    if (shortEl) { shortEl.textContent = link.shortUrl; shortEl.href = link.longUrl; shortEl.setAttribute('data-visit', link.id); }
    var longEl = $('result-long'); if (longEl) longEl.textContent = link.longUrl;
    show(result, true);
    result.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function init() {
    if (!hasDocument) return;
    var form = $('shorten-form');
    on(form, 'submit', function (e) {
      e.preventDefault();
      var urlEl = $('long-url'), aliasEl = $('custom-alias'), errEl = $('form-error');
      var res = createLink(urlEl ? urlEl.value : '', aliasEl ? aliasEl.value : '');
      if (!res.ok) {
        if (errEl) { errEl.textContent = res.error; show(errEl, true); }
        toast(res.error, 'error');
        return;
      }
      if (errEl) show(errEl, false);
      showResult(res.link);
      renderAll();
      toast('Short link created: ' + res.link.shortUrl, 'success');
      if (aliasEl) aliasEl.value = '';
    });

    on($('clear-form'), 'click', function () {
      var urlEl = $('long-url'), aliasEl = $('custom-alias'), errEl = $('form-error');
      if (urlEl) urlEl.value = '';
      if (aliasEl) aliasEl.value = '';
      if (errEl) show(errEl, false);
      show($('result'), false);
      if (urlEl) urlEl.focus();
    });

    on($('load-demo'), 'click', loadDemoData);
    on($('result-copy'), 'click', function () { if (currentResult) copyText(currentResult.shortUrl, 'Short link copied'); });
    on($('result-qr'), 'click', function () { if (currentResult) openQR(currentResult); });
    on($('result-visit'), 'click', function () {
      if (!currentResult) return;
      recordClick(currentResult.id);
      renderAll();
      window.open(currentResult.longUrl, '_blank', 'noopener');
    });

    ['search', 'sort', 'filter'].forEach(function (id) {
      on($(id), 'input', renderTable);
      on($(id), 'change', renderTable);
    });

    on($('export-json'), 'click', function () {
      downloadFile('shorthub-links.json', JSON.stringify(loadLinks(), null, 2), 'application/json');
      toast('Links exported as JSON', 'success');
    });
    on($('export-csv'), 'click', function () {
      downloadFile('shorthub-links.csv', toCSV(loadLinks()), 'text/csv');
      toast('Links exported as CSV', 'success');
    });
    on($('clear-all'), 'click', function () {
      if (!loadLinks().length) { toast('No links to delete'); return; }
      if (window.confirm('Delete ALL links? This cannot be undone.')) {
        deleteAllLinks();
        show($('result'), false);
        renderAll();
        toast('All links deleted', 'success');
      }
    });

    // Delegated actions inside the links table (copy / QR / visit / delete).
    var body = $('links-body');
    on(body, 'click', function (e) {
      var t = e.target;
      if (!t || !t.getAttribute) return;
      var copyId = t.getAttribute('data-copy');
      var qrId = t.getAttribute('data-qr');
      var visitId = t.getAttribute('data-visit-btn');
      var delId = t.getAttribute('data-delete');
      if (copyId) {
        var l = loadLinks().find(function (x) { return x.id === copyId; });
        if (l) copyText(l.shortUrl, 'Short link copied');
      } else if (qrId) {
        var l2 = loadLinks().find(function (x) { return x.id === qrId; });
        if (l2) openQR(l2);
      } else if (visitId) {
        var updated = recordClick(visitId);
        renderAll();
        if (updated) window.open(updated.longUrl, '_blank', 'noopener');
      } else if (delId) {
        deleteLink(delId);
        renderAll();
        toast('Link deleted', 'success');
      }
    });

    // Clicking a short/original link in the table counts a click, then follows the href.
    on(body, 'click', function (e) {
      var t = e.target;
      if (t && t.getAttribute && t.getAttribute('data-visit')) {
        recordClick(t.getAttribute('data-visit'));
        renderAll();
      }
    });

    on($('qr-close'), 'click', closeQR);
    on($('qr-modal'), 'click', function (e) { if (e.target && e.target.id === 'qr-modal') closeQR(); });
    on($('qr-download'), 'click', downloadQR);
    on($('qr-copy'), 'click', function () { if (currentResult) copyText(currentResult.shortUrl, 'Short link copied'); });
    on(document, 'keydown', function (e) { if (e.key === 'Escape') closeQR(); });

    renderAll();
  }

  // Public API — used by the result box, and exposed for automated testing.
  var api = {
    createLink: createLink, recordClick: recordClick, deleteLink: deleteLink,
    deleteAllLinks: deleteAllLinks, loadLinks: loadLinks, getStats: getStats,
    getLast7Days: getLast7Days, filteredLinks: filteredLinks, toCSV: toCSV,
    generateCode: generateCode, normalizeUrl: normalizeUrl, isValidUrl: isValidUrl,
    isValidAlias: isValidAlias, shortDisplay: shortDisplay, STORAGE_KEY: STORAGE_KEY
  };
  if (hasWindow) window.ShortHub = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;

  if (hasDocument) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
  }
})();
