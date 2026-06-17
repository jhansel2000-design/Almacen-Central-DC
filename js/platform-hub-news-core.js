/**
 * Tablón informativo — modelo y caché local
 */
(function (global) {
  'use strict';

  var LS_KEY = 'almacen_hub_news';
  var SEED_VERSION = 2;

  function ensurePortalSeeds(items) {
    var merged = (items || []).slice();
    defaultSeedItems().forEach(function (seed) {
      var exists = merged.some(function (n) {
        return n.theme === seed.theme && n.title === seed.title;
      });
      if (!exists) merged.push(Object.assign({}, seed));
    });
    return activeItems(merged);
  }

  function defaultSeedItems() {
    return [
      {
        id: 'seed_portal_despacho',
        title: 'Portal de Despacho',
        body: 'Prepara y valida pedidos en tiempo real desde el almacén central.\n\nQué puedes hacer:\n• Preparar órdenes como preparador de despacho\n• Validar pedidos y liberar carga como validador\n• Ver listas, estados y avance en vivo\n• Sincronizar el equipo en la misma información',
        publishedAt: '2026-06-17T12:00:00.000Z',
        publishedBy: 'Almacén Central DC',
        active: true,
        pinned: true,
        imageUrl: 'assets/img/login-dispatch-poster.jpg',
        linkUrl: 'despacho.html',
        theme: 'despacho'
      },
      {
        id: 'seed_portal_ops',
        title: 'Operaciones de Piso',
        body: 'Gestiona averías, 5S, seguridad y equipos del almacén desde un solo portal.\n\nQué puedes hacer:\n• Registrar y dar seguimiento a averías de piso\n• Ejecutar auditorías 5S y controles de seguridad\n• Administrar equipos y áreas operativas\n• Consultar monitoreo de temperatura y módulos en vivo',
        publishedAt: '2026-06-17T11:00:00.000Z',
        publishedBy: 'Almacén Central DC',
        active: true,
        pinned: true,
        imageUrl: 'assets/img/login-averias-poster.jpg',
        linkUrl: 'averias.html',
        theme: 'ops'
      }
    ];
  }

  function mapRow(row) {
    if (!row) return null;
    return {
      id: String(row.id || row.uuid || ''),
      title: String(row.title || '').trim(),
      body: String(row.body || '').trim(),
      publishedAt: row.published_at || row.publishedAt || new Date().toISOString(),
      publishedBy: String(row.published_by || row.publishedBy || '').trim(),
      active: row.active !== false,
      pinned: !!row.pinned,
      imageUrl: String(row.image_url || row.imageUrl || '').trim(),
      linkUrl: String(row.link_url || row.linkUrl || '').trim(),
      theme: String(row.theme || '').trim()
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
    var imageUrl = String(data && data.imageUrl || '').trim();
    var linkUrl = String(data && data.linkUrl || '').trim();
    var theme = String(data && data.theme || '').trim();
    if (title.length < 3) return { ok: false, message: 'El título debe tener al menos 3 caracteres.' };
    if (title.length > 120) return { ok: false, message: 'El título es demasiado largo (máx. 120).' };
    if (body.length > 2000) return { ok: false, message: 'El texto es demasiado largo (máx. 2000).' };
    if (imageUrl.length > 240) return { ok: false, message: 'La ruta de imagen es demasiado larga.' };
    if (linkUrl.length > 240) return { ok: false, message: 'El enlace es demasiado largo.' };
    return {
      ok: true,
      item: {
        title: title,
        body: body,
        pinned: !!data.pinned,
        imageUrl: imageUrl,
        linkUrl: linkUrl,
        theme: theme
      }
    };
  }

  function readLocal() {
    if (!global.localStorage) return [];
    try {
      var raw = global.localStorage.getItem(LS_KEY);
      var parsed = raw ? JSON.parse(raw) : [];
      var items = activeItems((parsed || []).map(mapRow).filter(Boolean));
      var seeded = global.localStorage.getItem(LS_KEY + '_seed_v');
      if (String(seeded) !== String(SEED_VERSION) || !items.length) {
        items = ensurePortalSeeds(items);
        writeLocal(items);
        global.localStorage.setItem(LS_KEY + '_seed_v', String(SEED_VERSION));
      } else {
        items = ensurePortalSeeds(items);
        if (items.length !== activeItems((parsed || []).map(mapRow).filter(Boolean)).length) {
          writeLocal(items);
        }
      }
      return items;
    } catch (e) {
      return defaultSeedItems();
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
      pinned: !!item.pinned,
      image_url: item.imageUrl || '',
      link_url: item.linkUrl || '',
      theme: item.theme || ''
    };
  }

  global.PlatformHubNewsCore = {
    LS_KEY: LS_KEY,
    defaultSeedItems: defaultSeedItems,
    mapRow: mapRow,
    sortItems: sortItems,
    activeItems: activeItems,
    validateItem: validateItem,
    readLocal: readLocal,
    writeLocal: writeLocal,
    toDbRow: toDbRow
  };
})(typeof window !== 'undefined' ? window : this);
