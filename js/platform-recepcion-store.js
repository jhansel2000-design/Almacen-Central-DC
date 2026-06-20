/**
 * Store — Control Patio · Recepción de contenedores
 */
(function (global) {
  'use strict';

  var STORAGE_KEY = 'almacen_platform_data_recepcion';
  var TZ = 'America/Santo_Domingo';

  var TIPOS = [
    { id: 'importado', label: 'Importado' },
    { id: 'local', label: 'Local' }
  ];

  var DIVISIONES = ['COA/CP', 'COASIS', 'CPH', 'LIMENT', 'OTRO'];

  var broadcast = typeof global.BroadcastChannel !== 'undefined'
    ? new global.BroadcastChannel('recepcion-live-board')
    : null;

  function nowIso() {
    return new Date().toISOString();
  }

  function uid() {
    return 'rec_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
  }

  function emptyPayload() {
    return {
      module: 'recepcion',
      version: 1,
      updatedAt: nowIso(),
      contenedores: [],
      liveShareBoard: null
    };
  }

  function load() {
    if (!global.localStorage) return emptyPayload();
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return emptyPayload();
      var data = JSON.parse(raw);
      return normalizePayload(data);
    } catch (e) {
      return emptyPayload();
    }
  }

  function normalizePayload(data) {
    data = data || emptyPayload();
    data.module = 'recepcion';
    data.contenedores = (data.contenedores || []).map(normalizeContenedor);
    data.liveShareBoard = normalizeLiveShare(data.liveShareBoard);
    return data;
  }

  function normalizeContenedor(c) {
    c = c || {};
    return {
      id: c.id || uid(),
      fecha: c.fecha || c.createdAt || nowIso(),
      contenedor: String(c.contenedor || '').trim().toUpperCase(),
      tipo: c.tipo === 'local' ? 'local' : 'importado',
      division: String(c.division || '').trim(),
      descripcion: String(c.descripcion || '').trim(),
      paletas: Math.max(0, parseInt(c.paletas, 10) || 0),
      muelle: String(c.muelle || '').trim().toUpperCase(),
      validado: c.validado === 'ok' ? 'ok' : 'pendiente',
      entrada: c.entrada === 'ok' ? 'ok' : 'pendiente',
      createdAt: c.createdAt || nowIso(),
      createdBy: c.createdBy || '—',
      updatedAt: c.updatedAt || c.createdAt || nowIso(),
      updatedBy: c.updatedBy || c.createdBy || '—',
      historial: Array.isArray(c.historial) ? c.historial.slice(0, 40) : []
    };
  }

  function normalizeLiveShare(share) {
    if (!share || !share.active) return null;
    return {
      active: true,
      updatedAt: share.updatedAt || nowIso(),
      sharedBy: share.sharedBy || '—'
    };
  }

  function save(data, opts) {
    opts = opts || {};
    data = normalizePayload(data);
    data.updatedAt = nowIso();
    if (global.localStorage) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    }
    if (!opts.silent) notify(data);
    return data;
  }

  function notify(data) {
    try {
      global.dispatchEvent(new CustomEvent('recepcion-updated', {
        detail: { data: data, at: nowIso() }
      }));
    } catch (e) { /* noop */ }
    if (broadcast) {
      try { broadcast.postMessage({ type: 'recepcion-updated', at: Date.now() }); } catch (e) { /* noop */ }
    }
  }

  function notifyLiveShare(share) {
    try {
      global.dispatchEvent(new CustomEvent('recepcion-live-board', {
        detail: { share: share, at: nowIso() }
      }));
    } catch (e) { /* noop */ }
  }

  function pushHistorial(item, entry) {
    item.historial = item.historial || [];
    item.historial.unshift({
      at: entry.at || nowIso(),
      usuario: entry.usuario || '—',
      accion: entry.accion || '',
      nota: entry.nota || ''
    });
    item.historial = item.historial.slice(0, 40);
  }

  function formatFecha(iso) {
    if (!iso) return '—';
    try {
      return new Intl.DateTimeFormat('es-DO', {
        dateStyle: 'short',
        timeStyle: 'short',
        timeZone: TZ
      }).format(new Date(iso));
    } catch (e) {
      return String(iso).slice(0, 16).replace('T', ' ');
    }
  }

  function formatFechaSolo(iso) {
    if (!iso) return '—';
    try {
      return new Intl.DateTimeFormat('es-DO', {
        dateStyle: 'short',
        timeZone: TZ
      }).format(new Date(iso));
    } catch (e) {
      return String(iso).slice(0, 10);
    }
  }

  function registrarContenedor(payload, usuario) {
    payload = payload || {};
    usuario = usuario || '—';
    var contenedor = String(payload.contenedor || '').trim().toUpperCase();
    if (!contenedor) return { ok: false, error: 'Ingrese el número de contenedor.' };
    if (!String(payload.division || '').trim()) return { ok: false, error: 'Seleccione la división.' };
    if (!String(payload.descripcion || '').trim()) return { ok: false, error: 'Ingrese la descripción.' };

    var data = load();
    var dup = (data.contenedores || []).some(function (c) {
      return c.contenedor === contenedor && c.entrada !== 'ok';
    });
    if (dup) return { ok: false, error: 'Ese contenedor ya está en seguimiento activo.' };

    var ts = nowIso();
    var item = normalizeContenedor({
      id: uid(),
      fecha: payload.fecha || ts,
      contenedor: contenedor,
      tipo: payload.tipo === 'local' ? 'local' : 'importado',
      division: payload.division,
      descripcion: payload.descripcion,
      paletas: payload.paletas,
      muelle: payload.muelle || '',
      validado: 'pendiente',
      entrada: 'pendiente',
      createdAt: ts,
      createdBy: usuario,
      updatedAt: ts,
      updatedBy: usuario,
      historial: []
    });
    pushHistorial(item, {
      at: ts,
      usuario: usuario,
      accion: 'registro',
      nota: 'Contenedor registrado · ' + (item.tipo === 'local' ? 'Local' : 'Importado')
    });
    data.contenedores.unshift(item);
    save(data);
    return { ok: true, data: data, item: item };
  }

  function findById(data, id) {
    return (data.contenedores || []).findIndex(function (c) { return c.id === id; });
  }

  function marcarValidado(id, usuario) {
    var data = load();
    var idx = findById(data, id);
    if (idx < 0) return { ok: false, error: 'Contenedor no encontrado.' };
    var item = data.contenedores[idx];
    if (item.validado === 'ok') return { ok: true, data: data, item: item, unchanged: true };
    var ts = nowIso();
    item.validado = 'ok';
    item.updatedAt = ts;
    item.updatedBy = usuario || '—';
    pushHistorial(item, { at: ts, usuario: usuario, accion: 'validado', nota: 'Validación OK' });
    save(data);
    return { ok: true, data: data, item: item };
  }

  function actualizarMuelle(id, muelle, usuario) {
    var data = load();
    var idx = findById(data, id);
    if (idx < 0) return { ok: false, error: 'Contenedor no encontrado.' };
    var item = data.contenedores[idx];
    if (item.entrada === 'ok') {
      return { ok: false, error: 'El muelle ya quedó confirmado con la entrada.' };
    }
    muelle = String(muelle || '').trim().toUpperCase();
    if (!muelle) return { ok: false, error: 'Indique el muelle.' };
    if (item.muelle === muelle) {
      return { ok: true, data: data, item: item, unchanged: true };
    }
    var ts = nowIso();
    item.muelle = muelle;
    item.updatedAt = ts;
    item.updatedBy = usuario || '—';
    pushHistorial(item, {
      at: ts,
      usuario: usuario,
      accion: 'muelle',
      nota: 'Muelle asignado · ' + muelle
    });
    save(data);
    return { ok: true, data: data, item: item };
  }

  function marcarEntrada(id, muelle, usuario) {
    var data = load();
    var idx = findById(data, id);
    if (idx < 0) return { ok: false, error: 'Contenedor no encontrado.' };
    var item = data.contenedores[idx];
    if (item.validado !== 'ok') return { ok: false, error: 'Debe validar el contenedor antes de dar entrada.' };
    muelle = String(muelle || item.muelle || '').trim().toUpperCase();
    if (!muelle) return { ok: false, error: 'Indique el muelle de entrada.' };
    if (item.entrada === 'ok' && item.muelle === muelle) {
      return { ok: true, data: data, item: item, unchanged: true };
    }
    var ts = nowIso();
    item.entrada = 'ok';
    item.muelle = muelle;
    item.updatedAt = ts;
    item.updatedBy = usuario || '—';
    pushHistorial(item, { at: ts, usuario: usuario, accion: 'entrada', nota: 'Entrada OK · muelle ' + muelle });
    save(data);
    return { ok: true, data: data, item: item };
  }

  function eliminarContenedor(id, usuario) {
    var data = load();
    var idx = findById(data, id);
    if (idx < 0) return { ok: false, error: 'Contenedor no encontrado.' };
    data.contenedores.splice(idx, 1);
    save(data);
    return { ok: true, data: data };
  }

  function getContenedoresActivos(contenedores) {
    return (contenedores || []).slice().sort(function (a, b) {
      return String(b.fecha || '').localeCompare(String(a.fecha || ''));
    });
  }

  function countResumen(contenedores) {
    var list = contenedores || [];
    var out = {
      total: list.length,
      importado: 0,
      local: 0,
      pendienteValidar: 0,
      validado: 0,
      conEntrada: 0
    };
    list.forEach(function (c) {
      if (c.tipo === 'local') out.local += 1;
      else out.importado += 1;
      if (c.validado !== 'ok') out.pendienteValidar += 1;
      else out.validado += 1;
      if (c.entrada === 'ok') out.conEntrada += 1;
    });
    return out;
  }

  function getLiveShareBoard(data) {
    data = data || load();
    return data.liveShareBoard || null;
  }

  function isLiveShareBoardActive(data) {
    var s = getLiveShareBoard(data);
    return !!(s && s.active);
  }

  function startLiveShareBoard(usuario) {
    var data = load();
    data.liveShareBoard = {
      active: true,
      updatedAt: nowIso(),
      sharedBy: usuario || '—'
    };
    save(data, { silent: true });
    notifyLiveShare(data.liveShareBoard);
    notify(data);
    return data.liveShareBoard;
  }

  function stopLiveShareBoard() {
    var data = load();
    data.liveShareBoard = null;
    save(data, { silent: true });
    notifyLiveShare(null);
    notify(data);
    return null;
  }

  function toggleLiveShareBoard(usuario) {
    var data = load();
    if (isLiveShareBoardActive(data)) return stopLiveShareBoard();
    return startLiveShareBoard(usuario);
  }

  function bindSync(callback) {
    if (!callback) return function () {};
    function onCustom(ev) {
      callback(ev.detail && ev.detail.data ? ev.detail.data : load());
    }
    function onStorage(ev) {
      if (ev.key === STORAGE_KEY) callback(load());
    }
    function onLive() { callback(load()); }
    global.addEventListener('recepcion-updated', onCustom);
    global.addEventListener('recepcion-live-board', onLive);
    global.addEventListener('storage', onStorage);
    if (broadcast) {
      broadcast.onmessage = function () { callback(load()); };
    }
    return function () {
      global.removeEventListener('recepcion-updated', onCustom);
      global.removeEventListener('recepcion-live-board', onLive);
      global.removeEventListener('storage', onStorage);
    };
  }

  global.PlatformRecepcionStore = {
    STORAGE_KEY: STORAGE_KEY,
    TIPOS: TIPOS,
    DIVISIONES: DIVISIONES,
    load: load,
    save: save,
    formatFecha: formatFecha,
    formatFechaSolo: formatFechaSolo,
    registrarContenedor: registrarContenedor,
    marcarValidado: marcarValidado,
    actualizarMuelle: actualizarMuelle,
    marcarEntrada: marcarEntrada,
    eliminarContenedor: eliminarContenedor,
    getContenedoresActivos: getContenedoresActivos,
    countResumen: countResumen,
    getLiveShareBoard: getLiveShareBoard,
    isLiveShareBoardActive: isLiveShareBoardActive,
    startLiveShareBoard: startLiveShareBoard,
    stopLiveShareBoard: stopLiveShareBoard,
    toggleLiveShareBoard: toggleLiveShareBoard,
    bindSync: bindSync
  };
})(typeof window !== 'undefined' ? window : this);
