/**
 * Tablón informativo — modelo y caché local
 */
(function (global) {
  'use strict';

  var LS_KEY = 'almacen_hub_news';
  var SEED_VERSION = 6;

  function refreshSeedCopy(items) {
    var seeds = defaultSeedItems();
    return (items || []).map(function (item) {
      var seed = seeds.find(function (s) {
        return s.id === item.id || (s.theme === item.theme && s.title === item.title);
      });
      if (seed) {
        return Object.assign({}, item, {
          body: seed.body,
          imageUrl: seed.imageUrl,
          linkUrl: seed.linkUrl,
          theme: seed.theme
        });
      }
      return item;
    });
  }

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
        body: 'Qué puedes hacer:\n• Preparar y validar pedidos en vivo\n• Ver listas, estados y avance del despacho\n• Trabajar sincronizado con todo el equipo',
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
        body: 'Qué puedes hacer:\n• Registrar y seguir averías de piso\n• Auditorías 5S, seguridad y equipos\n• Monitoreo de temperatura y módulos en vivo',
        publishedAt: '2026-06-17T11:00:00.000Z',
        publishedBy: 'Almacén Central DC',
        active: true,
        pinned: true,
        imageUrl: 'assets/img/login-averias-poster.jpg',
        linkUrl: 'averias.html',
        theme: 'ops'
      },
      {
        id: 'seed_portal_turnos',
        title: 'Control de Turnos de Despacho',
        body: 'Qué puedes hacer:\n• Elegir trámite: despacho, liquidación o nota de crédito\n• Pedir turno desde el celular sin hacer fila\n• Recibir aviso con voz y alarma cuando sea su turno\n\nCarteles para imprimir (código QR y pasos): carpeta «Turnos-Imprimir-DC» en el Escritorio de esta PC — no están publicados en la web.',
        publishedAt: '2026-06-16T10:00:00.000Z',
        publishedBy: 'Almacén Central DC',
        active: true,
        pinned: true,
        imageUrl: 'assets/img/turnos-hub-poster.jpg',
        linkUrl: 'turnos.html',
        theme: 'turnos'
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
        items = refreshSeedCopy(ensurePortalSeeds(items));
        writeLocal(items);
        global.localStorage.setItem(LS_KEY + '_seed_v', String(SEED_VERSION));
      } else {
        items = refreshSeedCopy(ensurePortalSeeds(items));
        writeLocal(items);
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
    SEED_VERSION: SEED_VERSION,
    defaultSeedItems: defaultSeedItems,
    refreshSeedCopy: refreshSeedCopy,
    mapRow: mapRow,
    sortItems: sortItems,
    activeItems: activeItems,
    validateItem: validateItem,
    readLocal: readLocal,
    writeLocal: writeLocal,
    toDbRow: toDbRow
  };
})(typeof window !== 'undefined' ? window : this);
