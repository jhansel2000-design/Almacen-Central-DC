/**
 * Despacho — pedidos, estados y historial (localStorage + eventos)
 */
(function (global) {
  'use strict';

  var STORAGE_KEY = 'almacen_platform_data_despacho';
  var broadcast = typeof global.BroadcastChannel !== 'undefined'
    ? new global.BroadcastChannel('despacho-live-share')
    : null;
  var broadcastLista = typeof global.BroadcastChannel !== 'undefined'
    ? new global.BroadcastChannel('despacho-live-lista')
    : null;

  var ESTADOS = {
    en_proceso: {
      id: 'en_proceso',
      label: 'En proceso',
      short: 'En proceso',
      icon: '🔄',
      fase: 'preparacion',
      color: 'amber',
      preparador: true,
      validador: false
    },
    facturado: {
      id: 'facturado',
      label: 'Facturado',
      short: 'Facturado',
      icon: '🧾',
      fase: 'facturacion',
      color: 'blue',
      preparador: true,
      validador: false
    },
    pendiente_carga: {
      id: 'pendiente_carga',
      label: 'Pendiente por subir al área de carga',
      short: 'Pend. carga',
      icon: '📦',
      fase: 'validacion',
      color: 'orange',
      preparador: false,
      validador: true
    },
    en_validacion: {
      id: 'en_validacion',
      label: 'En validación para despacho',
      short: 'En validación',
      icon: '✅',
      fase: 'validacion',
      color: 'purple',
      preparador: false,
      validador: true
    },
    listo_despacho: {
      id: 'listo_despacho',
      label: 'Listo para despacho',
      short: 'Listo',
      icon: '🚚',
      fase: 'despacho',
      color: 'green',
      preparador: false,
      validador: true
    }
  };

  var PREPARADOR_ESTADOS = ['en_proceso', 'facturado'];
  var VALIDADOR_ESTADOS = ['pendiente_carga', 'en_validacion', 'listo_despacho'];
  var FLUJO = ['en_proceso', 'facturado', 'pendiente_carga', 'en_validacion', 'listo_despacho'];

  function uid() {
    return 'ped_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function emptyPayload() {
    return {
      module: 'despacho',
      version: 1,
      updatedAt: nowIso(),
      pedidos: [],
      liveShare: null,
      liveShareLista: null
    };
  }

  function normalizeLiveShare(liveShare) {
    if (!liveShare || !liveShare.active) return null;
    return {
      active: true,
      idc: formatIdc(liveShare.idc || ''),
      jaula: String(liveShare.jaula || '').trim(),
      estado: ESTADOS[liveShare.estado] ? liveShare.estado : 'en_proceso',
      updatedAt: liveShare.updatedAt || nowIso(),
      sharedBy: liveShare.sharedBy || '—'
    };
  }

  function normalizeLiveShareLista(liveShareLista) {
    if (!liveShareLista || !liveShareLista.active) return null;
    return {
      active: true,
      updatedAt: liveShareLista.updatedAt || nowIso(),
      sharedBy: liveShareLista.sharedBy || '—'
    };
  }

  function load() {
    if (!global.localStorage) return emptyPayload();
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return emptyPayload();
      var data = JSON.parse(raw);
      if (!data || !Array.isArray(data.pedidos)) return emptyPayload();
      data.module = 'despacho';
      var migrated = false;
      data.pedidos = (data.pedidos || []).map(function (p) {
        var before = p.estado;
        var beforeSeg = p.seguimientoValidador;
        var n = normalizePedido(p);
        if (n.estado !== before || n.seguimientoValidador !== beforeSeg) migrated = true;
        return n;
      });
      data.liveShare = normalizeLiveShare(data.liveShare);
      data.liveShareLista = normalizeLiveShareLista(data.liveShareLista);
      if (migrated) persistData(data, { silent: true });
      return data;
    } catch (e) {
      return emptyPayload();
    }
  }

  function normalizePedido(p) {
    p = p || {};
    var estado = ESTADOS[p.estado] ? p.estado : 'en_proceso';
    var seguimientoValidador = p.seguimientoValidador === true;
    if (p.seguimientoValidador == null && VALIDADOR_ESTADOS.indexOf(estado) >= 0) {
      seguimientoValidador = true;
    }
    if (seguimientoValidador && PREPARADOR_ESTADOS.indexOf(estado) >= 0) {
      estado = 'pendiente_carga';
    }
    return {
      id: p.id || uid(),
      idc: formatIdc(p.idc || ''),
      jaula: String(p.jaula || '').trim(),
      estado: estado,
      seguimientoValidador: seguimientoValidador,
      visibleValidador: p.visibleValidador !== false,
      archivadoValidadorAt: p.archivadoValidadorAt || null,
      archivadoValidadorBy: p.archivadoValidadorBy || null,
      archivadoPasillo: p.archivadoPasillo != null ? String(p.archivadoPasillo) : null,
      createdAt: p.createdAt || nowIso(),
      createdBy: p.createdBy || '—',
      updatedAt: p.updatedAt || p.createdAt || nowIso(),
      updatedBy: p.updatedBy || p.createdBy || '—',
      historial: Array.isArray(p.historial) ? p.historial : []
    };
  }

  function save(data) {
    return persistData(data, {});
  }

  function notify(data) {
    try {
      global.dispatchEvent(new CustomEvent('despacho-updated', { detail: { data: data, at: nowIso() } }));
    } catch (e) { /* noop */ }
  }

  function pushHistorial(pedido, entry) {
    pedido.historial = pedido.historial || [];
    pedido.historial.unshift({
      at: entry.at || nowIso(),
      usuario: entry.usuario || '—',
      panel: entry.panel || 'sistema',
      desde: entry.desde != null ? entry.desde : null,
      hacia: entry.hacia,
      nota: entry.nota || ''
    });
    pedido.historial = pedido.historial.slice(0, 50);
  }

  function findByIdc(pedidos, idc) {
    var n = formatIdc(idc).toLowerCase();
    if (!n) return -1;
    return (pedidos || []).findIndex(function (p) {
      return formatIdc(p.idc).toLowerCase() === n;
    });
  }

  function formatIdc(raw) {
    return String(raw || '').trim();
  }

  function persistData(data, opts) {
    opts = opts || {};
    if (!global.localStorage) return false;
    data = data || emptyPayload();
    data.module = 'despacho';
    data.updatedAt = nowIso();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    if (opts.liveShareOnly) {
      notifyLiveShare(data.liveShare || null);
    } else if (!opts.silent) {
      notify(data);
    }
    return true;
  }

  function promoverASeguimientoValidador(pedido, estadoOperador, usuario, ts) {
    estadoOperador = PREPARADOR_ESTADOS.indexOf(estadoOperador) >= 0 ? estadoOperador : 'en_proceso';
    var opLabel = ESTADOS[estadoOperador] ? ESTADOS[estadoOperador].short : estadoOperador;
    var prevEstado = pedido.estado;
    pedido.seguimientoValidador = true;
    pedido.visibleValidador = true;
    pedido.estado = 'pendiente_carga';
    pedido.archivadoValidadorAt = null;
    pedido.archivadoValidadorBy = null;
    pedido.archivadoPasillo = null;
    pedido.updatedAt = ts;
    pedido.updatedBy = usuario;
    pushHistorial(pedido, {
      at: ts,
      usuario: usuario,
      panel: 'preparador',
      desde: prevEstado,
      hacia: 'pendiente_carga',
      nota: 'Operador registró como ' + opLabel + ' → ingresó a seguimiento validador'
    });
  }

  function registrarPedido(idc, jaula, estado, usuario) {
    idc = formatIdc(idc);
    jaula = String(jaula || '').trim();
    estado = ESTADOS[estado] && PREPARADOR_ESTADOS.indexOf(estado) >= 0 ? estado : 'en_proceso';
    usuario = usuario || '—';

    if (!idc) return { ok: false, error: 'Ingrese el ID del pedido (IDC).' };
    if (!jaula) return { ok: false, error: 'Ingrese el pasillo.' };

    var data = load();
    var idx = findByIdc(data.pedidos, idc);
    var ts = nowIso();

    if (idx >= 0) {
      var existing = data.pedidos[idx];
      if (existing.seguimientoValidador && existing.visibleValidador !== false) {
        return { ok: false, error: 'El pedido ' + idc + ' está en seguimiento validador. El validador debe quitarlo.' };
      }
      var wasArchived = existing.visibleValidador === false;
      existing.jaula = jaula;
      existing.visibleValidador = true;
      promoverASeguimientoValidador(existing, estado, usuario, ts);
      if (wasArchived) {
        existing.historial[0].nota = 'Reactivado · ' + existing.historial[0].nota;
      }
      save(data);
      return { ok: true, data: data, pedido: existing, updated: true };
    }

    var pedido = {
      id: uid(),
      idc: idc,
      jaula: jaula,
      estado: 'pendiente_carga',
      seguimientoValidador: true,
      visibleValidador: true,
      archivadoValidadorAt: null,
      archivadoValidadorBy: null,
      archivadoPasillo: null,
      createdAt: ts,
      createdBy: usuario,
      updatedAt: ts,
      updatedBy: usuario,
      historial: []
    };
    var opLabel = ESTADOS[estado] ? ESTADOS[estado].short : estado;
    pushHistorial(pedido, {
      at: ts,
      usuario: usuario,
      panel: 'preparador',
      desde: null,
      hacia: 'pendiente_carga',
      nota: 'Registro operador (' + opLabel + ') → ingresó a seguimiento validador'
    });
    data.pedidos.unshift(pedido);
    save(data);
    return { ok: true, data: data, pedido: pedido, updated: false };
  }

  function enviarASeguimientoValidador(idc, jaula, usuario) {
    idc = formatIdc(idc);
    jaula = String(jaula || '').trim();
    usuario = usuario || '—';
    if (!idc) return { ok: false, error: 'Ingrese el ID del pedido (IDC).' };
    if (!jaula) return { ok: false, error: 'Ingrese el pasillo.' };
    var data = load();
    var idx = findByIdc(data.pedidos, idc);
    if (idx < 0) return { ok: false, error: 'Pedido no encontrado.' };
    var pedido = data.pedidos[idx];
    if (pedido.seguimientoValidador && pedido.visibleValidador !== false) {
      return { ok: true, data: data, pedido: pedido, unchanged: true };
    }
    var ts = nowIso();
    pedido.jaula = jaula;
    promoverASeguimientoValidador(pedido, pedido.estado, usuario, ts);
    save(data);
    return { ok: true, data: data, pedido: pedido };
  }

  function cambiarEstado(pedidoId, nuevoEstado, usuario) {
    if (!ESTADOS[nuevoEstado] || VALIDADOR_ESTADOS.indexOf(nuevoEstado) < 0) {
      return { ok: false, error: 'Estado no válido para el validador.' };
    }
    var data = load();
    var idx = (data.pedidos || []).findIndex(function (p) { return p.id === pedidoId; });
    if (idx < 0) return { ok: false, error: 'Pedido no encontrado.' };

    var pedido = data.pedidos[idx];
    if (!pedido.seguimientoValidador) {
      return { ok: false, error: 'Solo puede cambiar estado IDC en seguimiento validador.' };
    }
    var prev = pedido.estado;
    if (prev === nuevoEstado) {
      return { ok: true, data: data, pedido: pedido, unchanged: true };
    }

    var prevFase = ESTADOS[prev] ? ESTADOS[prev].fase : '';
    var newFase = ESTADOS[nuevoEstado] ? ESTADOS[nuevoEstado].fase : '';
    var ts = nowIso();
    pedido.estado = nuevoEstado;
    pedido.updatedAt = ts;
    pedido.updatedBy = usuario || '—';
    pushHistorial(pedido, {
      at: ts,
      usuario: usuario || '—',
      panel: 'validador',
      desde: prev,
      hacia: nuevoEstado,
      nota: nuevoEstado === 'listo_despacho'
        ? 'Validador marcó como listo para despacho'
        : (prevFase === 'preparacion' && newFase !== 'preparacion')
          ? 'Validador cambió estado desde preparación'
          : 'Cambio de estado validador'
    });
    save(data);
    return { ok: true, data: data, pedido: pedido };
  }

  function filterPedidos(pedidos, opts) {
    opts = opts || {};
    var list = (pedidos || []).slice();
    if (opts.estado && ESTADOS[opts.estado]) {
      list = list.filter(function (p) { return p.estado === opts.estado; });
    }
    if (opts.q) {
      var q = String(opts.q).trim().toLowerCase();
      if (q) {
        list = list.filter(function (p) {
          return String(p.idc).toLowerCase().indexOf(q) >= 0 ||
            String(p.jaula).toLowerCase().indexOf(q) >= 0;
        });
      }
    }
    if (opts.fase) {
      list = list.filter(function (p) {
        var e = ESTADOS[p.estado];
        return e && e.fase === opts.fase;
      });
    }
    if (opts.visiblesValidador) {
      list = list.filter(function (p) { return p.visibleValidador !== false; });
    }
    if (opts.archivadosValidador) {
      list = list.filter(function (p) { return p.visibleValidador === false; });
    }
    if (opts.soloPreparador) {
      list = list.filter(function (p) {
        return PREPARADOR_ESTADOS.indexOf(p.estado) >= 0 &&
          p.seguimientoValidador !== true &&
          p.visibleValidador !== false;
      });
    }
    if (opts.soloValidador) {
      list = list.filter(function (p) {
        return p.seguimientoValidador === true &&
          p.visibleValidador !== false &&
          VALIDADOR_ESTADOS.indexOf(p.estado) >= 0;
      });
    }
    list.sort(function (a, b) {
      return (b.updatedAt || '').localeCompare(a.updatedAt || '');
    });
    return list;
  }

  function countByEstado(pedidos, opts) {
    opts = opts || {};
    var counts = {};
    Object.keys(ESTADOS).forEach(function (k) { counts[k] = 0; });
    (pedidos || []).forEach(function (p) {
      if (p.visibleValidador === false) return;
      var enOperador = p.seguimientoValidador !== true;
      var enValidador = p.seguimientoValidador === true;
      if (PREPARADOR_ESTADOS.indexOf(p.estado) >= 0) {
        if (!enOperador) return;
      } else if (VALIDADOR_ESTADOS.indexOf(p.estado) >= 0) {
        if (!enValidador) return;
      }
      if (counts[p.estado] != null) counts[p.estado] += 1;
    });
    if (opts.soloPreparador) {
      VALIDADOR_ESTADOS.forEach(function (k) { counts[k] = 0; });
    }
    if (opts.soloValidador) {
      PREPARADOR_ESTADOS.forEach(function (k) { counts[k] = 0; });
    }
    return counts;
  }

  function formatEstado(id) {
    var e = ESTADOS[id];
    return e ? e.icon + ' ' + e.label : id;
  }

  function formatHistorialEntry(h) {
    if (!h) return '—';
    var desde = h.desde ? (ESTADOS[h.desde] ? ESTADOS[h.desde].short : h.desde) : '—';
    var hacia = h.hacia ? (ESTADOS[h.hacia] ? ESTADOS[h.hacia].short : h.hacia) : '—';
    return desde + ' → ' + hacia;
  }

  function notifyLiveShare(share) {
    try {
      global.dispatchEvent(new CustomEvent('despacho-live-share', {
        detail: { share: share, at: nowIso() }
      }));
    } catch (e) { /* noop */ }
    if (broadcast) {
      try { broadcast.postMessage({ at: Date.now() }); } catch (e) { /* noop */ }
    }
  }

  function notifyLiveShareLista(share) {
    try {
      global.dispatchEvent(new CustomEvent('despacho-live-lista', {
        detail: { share: share, at: nowIso() }
      }));
    } catch (e) { /* noop */ }
    if (broadcastLista) {
      try { broadcastLista.postMessage({ at: Date.now() }); } catch (e) { /* noop */ }
    }
  }

  function getLiveShare(data) {
    data = data || load();
    return data.liveShare && data.liveShare.active ? data.liveShare : null;
  }

  function isLiveShareActive(data) {
    return !!getLiveShare(data);
  }

  function startLiveShare(idc, jaula, estado, usuario) {
    idc = formatIdc(idc);
    jaula = String(jaula || '').trim();
    estado = ESTADOS[estado] && PREPARADOR_ESTADOS.indexOf(estado) >= 0 ? estado : 'en_proceso';
    var data = load();
    data.liveShare = {
      active: true,
      idc: idc,
      jaula: jaula,
      estado: estado,
      updatedAt: nowIso(),
      sharedBy: usuario || '—'
    };
    save(data);
    return { ok: true, data: data, liveShare: data.liveShare };
  }

  function stopLiveShare(usuario) {
    var data = load();
    data.liveShare = null;
    save(data);
    notifyLiveShare(null);
    return { ok: true, data: data, stoppedBy: usuario };
  }

  function syncLiveShare(idc, jaula, estado, usuario) {
    var data = load();
    if (!data.liveShare || !data.liveShare.active) {
      return { ok: true, synced: false, data: data };
    }
    data.liveShare = {
      active: true,
      idc: formatIdc(idc),
      jaula: String(jaula || '').trim(),
      estado: ESTADOS[estado] && PREPARADOR_ESTADOS.indexOf(estado) >= 0 ? estado : data.liveShare.estado,
      updatedAt: nowIso(),
      sharedBy: data.liveShare.sharedBy || usuario || '—'
    };
    persistData(data, { liveShareOnly: true });
    return { ok: true, synced: true, data: data, liveShare: data.liveShare };
  }

  function toggleLiveShare(idc, jaula, estado, usuario) {
    if (isLiveShareActive()) {
      return stopLiveShare(usuario);
    }
    return startLiveShare(idc, jaula, estado, usuario);
  }

  function getLiveShareLista(data) {
    data = data || load();
    return data.liveShareLista && data.liveShareLista.active ? data.liveShareLista : null;
  }

  function isLiveShareListaActive(data) {
    return !!getLiveShareLista(data);
  }

  function startLiveShareLista(usuario) {
    var data = load();
    data.liveShareLista = {
      active: true,
      updatedAt: nowIso(),
      sharedBy: usuario || '—'
    };
    save(data);
    notifyLiveShareLista(data.liveShareLista);
    return { ok: true, data: data, liveShareLista: data.liveShareLista };
  }

  function stopLiveShareLista(usuario) {
    var data = load();
    data.liveShareLista = null;
    save(data);
    notifyLiveShareLista(null);
    return { ok: true, data: data, stoppedBy: usuario };
  }

  function toggleLiveShareLista(usuario) {
    if (isLiveShareListaActive()) {
      return stopLiveShareLista(usuario);
    }
    return startLiveShareLista(usuario);
  }

  function archivarDeVistaValidador(pedidoId, usuario) {
    var data = load();
    var idx = (data.pedidos || []).findIndex(function (p) { return p.id === pedidoId; });
    if (idx < 0) return { ok: false, error: 'Pedido no encontrado.' };

    var pedido = data.pedidos[idx];
    if (!pedido.seguimientoValidador) {
      if (VALIDADOR_ESTADOS.indexOf(pedido.estado) >= 0) {
        pedido.seguimientoValidador = true;
      } else {
        return { ok: false, error: 'Este IDC no está en seguimiento validador.' };
      }
    }
    if (pedido.visibleValidador === false) {
      return { ok: true, data: data, pedido: pedido, unchanged: true };
    }

    var ts = nowIso();
    var pasillo = String(pedido.jaula || '').trim();
    pedido.visibleValidador = false;
    pedido.archivadoValidadorAt = ts;
    pedido.archivadoValidadorBy = usuario || '—';
    pedido.archivadoPasillo = pasillo;
    pedido.updatedAt = ts;
    pedido.updatedBy = usuario || '—';
    if (data.liveShareLista && data.liveShareLista.active) {
      data.liveShareLista = Object.assign({}, data.liveShareLista, { updatedAt: ts });
    }
    pushHistorial(pedido, {
      at: ts,
      usuario: usuario || '—',
      panel: 'validador',
      desde: pedido.estado,
      hacia: pedido.estado,
      nota: 'Retirado de vista validador · IDC ' + pedido.idc + ' · Pasillo ' + (pasillo || '—')
    });
    save(data);
    return { ok: true, data: data, pedido: pedido };
  }

  function getPedidosSeguimientoPreparador(pedidos) {
    return getPedidosActivos((pedidos || []).filter(function (p) {
      return p.seguimientoValidador !== true &&
        p.visibleValidador !== false &&
        PREPARADOR_ESTADOS.indexOf(p.estado) >= 0;
    }));
  }

  function getPedidosVisiblesValidador(pedidos) {
    return getPedidosActivos((pedidos || []).filter(function (p) {
      return p.seguimientoValidador === true &&
        p.visibleValidador !== false &&
        VALIDADOR_ESTADOS.indexOf(p.estado) >= 0;
    }));
  }

  function getPedidosArchivadosValidador(pedidos) {
    return (pedidos || []).filter(function (p) {
      return p.seguimientoValidador === true && p.visibleValidador === false;
    }).sort(function (a, b) {
      return (b.archivadoValidadorAt || b.updatedAt || '').localeCompare(a.archivadoValidadorAt || a.updatedAt || '');
    });
  }

  function getPedidosActivos(pedidos) {
    return (pedidos || []).slice().sort(function (a, b) {
      var ja = String(a.jaula || '').localeCompare(String(b.jaula || ''), 'es', { numeric: true });
      if (ja !== 0) return ja;
      return String(a.idc || '').localeCompare(String(b.idc || ''), 'es', { numeric: true });
    });
  }

  function bindSync(callback) {
    if (!callback) return function () {};
    function onCustom(ev) {
      callback(ev.detail && ev.detail.data ? ev.detail.data : load());
    }
    function onStorage(ev) {
      if (ev.key === STORAGE_KEY) callback(load());
    }
    global.addEventListener('despacho-updated', onCustom);
    global.addEventListener('storage', onStorage);
    return function () {
      global.removeEventListener('despacho-updated', onCustom);
      global.removeEventListener('storage', onStorage);
    };
  }

  global.PlatformDespachoStore = {
    STORAGE_KEY: STORAGE_KEY,
    ESTADOS: ESTADOS,
    PREPARADOR_ESTADOS: PREPARADOR_ESTADOS,
    VALIDADOR_ESTADOS: VALIDADOR_ESTADOS,
    FLUJO: FLUJO,
    load: load,
    save: save,
    registrarPedido: registrarPedido,
    enviarASeguimientoValidador: enviarASeguimientoValidador,
    cambiarEstado: cambiarEstado,
    archivarDeVistaValidador: archivarDeVistaValidador,
    getPedidosSeguimientoPreparador: getPedidosSeguimientoPreparador,
    getPedidosVisiblesValidador: getPedidosVisiblesValidador,
    getPedidosArchivadosValidador: getPedidosArchivadosValidador,
    filterPedidos: filterPedidos,
    countByEstado: countByEstado,
    formatEstado: formatEstado,
    formatHistorialEntry: formatHistorialEntry,
    formatIdc: formatIdc,
    getLiveShare: getLiveShare,
    isLiveShareActive: isLiveShareActive,
    startLiveShare: startLiveShare,
    stopLiveShare: stopLiveShare,
    syncLiveShare: syncLiveShare,
    toggleLiveShare: toggleLiveShare,
    getLiveShareLista: getLiveShareLista,
    isLiveShareListaActive: isLiveShareListaActive,
    startLiveShareLista: startLiveShareLista,
    stopLiveShareLista: stopLiveShareLista,
    toggleLiveShareLista: toggleLiveShareLista,
    getPedidosActivos: getPedidosActivos,
    bindSync: bindSync
  };
})(typeof window !== 'undefined' ? window : this);
