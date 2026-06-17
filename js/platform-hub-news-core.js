/**
 * Tablón informativo — modelo y caché local
 */
(function (global) {
  'use strict';

  var LS_KEY = 'almacen_hub_news';

  function mapRow(row) {
    if (!row) return null;
    return {
      id: String(row.id || row.uuid || ''),
      title: String(row.title || '').trim(),
      body: String(row.body || '').trim(),
      publishedAt: row.published_at || row.publishedAt || new Date().toISOString(),
      publishedBy: String(row.published_by || row.publishedBy || '').trim(),
      active: row.active !== false,
      pinned: !!row.pinned
    };
  }

  function sortItems(items) {
    return (items || []).slice().sort(function (a, b) {
      if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
      return String(b.publishedAt).localeCompare(String(a.publishedAt));
    });
  }

  function activeItems(items) {
    return sortItems((items || []).filter(function (n) { return n && n.active !== false && n.title; }));
  }

  function validateItem(data) {
    var title = String(data && data.title || '').trim();
    var body = String(data && data.body || '').trim();
    if (title.length < 3) return { ok: false, message: 'El título debe tener al menos 3 caracteres.' };
    if (title.length > 120) return { ok: false, message: 'El título es demasiado largo (máx. 120).' };
    if (body.length > 2000) return { ok: false, message: 'El texto es demasiado largo (máx. 2000).' };
    return { ok: true, item: { title: title, body: body, pinned: !!data.pinned } };
  }

  function readLocal() {
    if (!global.localStorage) return [];
    try {
      var raw = global.localStorage.getItem(LS_KEY);
      var parsed = raw ? JSON.parse(raw) : [];
      return activeItems((parsed || []).map(mapRow).filter(Boolean));
    } catch (e) {
      return [];
    }
  }

  function writeLocal(items) {
    if (!global.localStorage) return;
    try {
      global.localStorage.setItem(LS_KEY, JSON.stringify(items || []));
    } catch (e) { /* noop */ }
  }

  function toDbRow(item) {
    return {
      id: item.id || undefined,
      title: item.title,
      body: item.body || '',
      published_at: item.publishedAt || new Date().toISOString(),
      published_by: item.publishedBy || '',
      active: item.active !== false,
      pinned: !!item.pinned
    };
  }

  global.PlatformHubNewsCore = {
    LS_KEY: LS_KEY,
    mapRow: mapRow,
    sortItems: sortItems,
    activeItems: activeItems,
    validateItem: validateItem,
    readLocal: readLocal,
    writeLocal: writeLocal,
    toDbRow: toDbRow
  };
})(typeof window !== 'undefined' ? window : this);
