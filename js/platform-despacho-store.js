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
      label: 'Pendiente por cargar',
      short: 'Pend. por cargar',
      kpiLabel: 'Pendiente por cargar',
      icon: '',
      iconType: 'lupa',
      fase: 'validacion',
      color: 'red',
      preparador: false,
      validador: true
    },
    en_validacion: {
      id: 'en_validacion',
      label: 'Validado',
      short: 'Validado',
      kpiLabel: 'Validado',
      icon: '',
      iconType: 'check',
      fase: 'validacion',
      color: 'yellow',
      preparador: false,
      validador: true
    },
    listo_despacho: {
      id: 'listo_despacho',
      label: 'Cargado',
      short: 'Cargado',
      kpiLabel: 'Cargado',
      icon: '',
      iconType: 'truck',
      fase: 'despacho',
      color: 'green',
      preparador: false,
      validador: true
    }
  };

  var PREPARADOR_ESTADOS = ['facturado'];
  var VALIDADOR_ESTADOS = ['pendiente_carga', 'en_validacion', 'listo_despacho'];
  var VALIDADORES_ASIGNABLES = [
    'Franklin M.',
    'Francisco Gil',
    'Eduardo L.',
    'Kelvin P.',
    'Ramon M.',
    'Raul M.',
    'José P.'
  ];
  var FLUJO = ['facturado', 'pendiente_carga', 'en_validacion', 'listo_despacho'];

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
      estado: ESTADOS[liveShare.estado] ? liveShare.estado : 'facturado',
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
    if (!seguimientoValidador && p.visibleValidador !== false &&
        PREPARADOR_ESTADOS.indexOf(estado) >= 0) {
      seguimientoValidador = true;
      estado = 'pendiente_carga';
    }
    var estadoOperador = p.estadoOperador;
    if (!estadoOperador || PREPARADOR_ESTADOS.indexOf(estadoOperador) < 0) {
      estadoOperador = inferEstadoOperador(p);
    }
    if (estadoOperador === 'en_proceso') estadoOperador = 'facturado';
    return {
      id: p.id || uid(),
      idc: formatIdc(p.idc || ''),
      jaula: String(p.jaula || '').trim(),
      cliente: String(p.cliente || '').trim(),
      estadoOperador: estadoOperador,
      estado: estado,
      seguimientoValidador: seguimientoValidador,
      visibleValidador: p.visibleValidador !== false,
      archivadoValidadorAt: p.archivadoValidadorAt || null,
      archivadoValidadorBy: p.archivadoValidadorBy || null,
      archivadoPasillo: p.archivadoPasillo != null ? String(p.archivadoPasillo) : null,
      createdAt: p.createdAt || nowIso(),
      createdBy: p.createdBy || '—',
      validadorAsignado: String(p.validadorAsignado || '').trim(),
      updatedAt: p.updatedAt || p.createdAt || nowIso(),
      updatedBy: p.updatedBy || p.createdBy || '—',
      historial: Array.isArray(p.historial) ? p.historial : []
    };
  }

  function inferEstadoOperador(p) {
    p = p || {};
    if (p.estadoOperador && PREPARADOR_ESTADOS.indexOf(p.estadoOperador) >= 0) {
      return p.estadoOperador;
    }
    var hist = p.historial || [];
    for (var i = 0; i < hist.length; i++) {
      var n = String(hist[i].nota || '');
      if (/facturado/i.test(n)) return 'facturado';
      if (/en proceso/i.test(n)) return 'en_proceso';
    }
    return 'facturado';
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
      try {
        global.dispatchEvent(new CustomEvent('despacho-updated', {
          detail: { data: data, at: nowIso(), source: 'live-share' }
        }));
      } catch (e) { /* noop */ }
    } else if (!opts.silent) {
      notify(data);
    }
    if (!opts.silent && global.PlatformDespachoCloudSync && global.PlatformDespachoCloudSync.pushLocal) {
      global.PlatformDespachoCloudSync.pushLocal(3);
    }
    return true;
  }

  function promoverASeguimientoValidador(pedido, estadoOperador, usuario, ts) {
    estadoOperador = PREPARADOR_ESTADOS.indexOf(estadoOperador) >= 0 ? estadoOperador : 'facturado';
    var opLabel = ESTADOS[estadoOperador] ? ESTADOS[estadoOperador].short : estadoOperador;
    var prevEstado = pedido.estado;
    pedido.seguimientoValidador = true;
    pedido.visibleValidador = true;
    pedido.estadoOperador = estadoOperador;
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

  function registrarPedido(idc, jaula, estado, usuario, cliente, validadorAsignado) {
    idc = formatIdc(idc);
    jaula = String(jaula || '').trim();
    cliente = String(cliente || '').trim();
    validadorAsignado = String(validadorAsignado || '').trim();
    estado = ESTADOS[estado] && PREPARADOR_ESTADOS.indexOf(estado) >= 0 ? estado : 'facturado';
    usuario = usuario || '—';

    if (!idc) return { ok: false, error: 'Ingrese el ID del pedido (IDC).' };
    if (!jaula) return { ok: false, error: 'Ingrese la jaula.' };
    if (!validadorAsignado) return { ok: false, error: 'Seleccione el validador asignado al pedido.' };
    if (VALIDADORES_ASIGNABLES.indexOf(validadorAsignado) < 0) {
      return { ok: false, error: 'Seleccione un validador de la lista autorizada.' };
    }

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
      existing.cliente = cliente;
      existing.validadorAsignado = validadorAsignado;
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
      cliente: cliente,
      validadorAsignado: validadorAsignado,
      estadoOperador: estado,
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
      nota: 'Registro operador (' + opLabel + ') → validador ' + validadorAsignado
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
    if (!jaula) return { ok: false, error: 'Ingrese la jaula.' };
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
        ? 'Validador marcó como cargado'
        : (prevFase === 'preparacion' && newFase !== 'preparacion')
          ? 'Validador cambió estado desde preparación'
          : 'Cambio de estado validador'
    });
    save(data);
    return { ok: true, data: data, pedido: pedido };
  }

  /** Orden validador: fecha/hora de registro (no reordenar al cambiar estado). */
  function pedidoTimestamp(p) {
    var t = Date.parse(p && p.createdAt);
    if (t) return t;
    return Date.parse(p && p.updatedAt) || 0;
  }

  /** Validador: más antiguos primero (arriba). Preparador u otros: jaula + IDC. */
  function sortPedidosValidador(pedidos) {
    return (pedidos || []).slice().sort(function (a, b) {
      var ta = pedidoTimestamp(a);
      var tb = pedidoTimestamp(b);
      if (ta !== tb) return ta - tb;
      var ja = String(a.jaula || '').localeCompare(String(b.jaula || ''), 'es', { numeric: true });
      if (ja !== 0) return ja;
      return String(a.idc || '').localeCompare(String(b.idc || ''), 'es', { numeric: true });
    });
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
            String(p.jaula).toLowerCase().indexOf(q) >= 0 ||
            String(p.cliente || '').toLowerCase().indexOf(q) >= 0 ||
            String(p.validadorAsignado || '').toLowerCase().indexOf(q) >= 0;
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
    if (opts.soloValidador || opts.visiblesValidador) {
      return sortPedidosValidador(list);
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
    return e ? (e.short || e.label) : id;
  }

  function renderEstadoIconSvg(estadoId, opts) {
    opts = opts || {};
    var e = ESTADOS[estadoId];
    if (!e || !e.iconType) return '';
    var cls = 'desp-estado-icon desp-estado-icon--' + e.iconType;
    if (opts.compact) cls += ' desp-estado-icon--sm';
    if (opts.inBtn) cls += ' desp-estado-icon--btn';
    var svg = '';
    if (e.iconType === 'lupa') {
      svg = '<svg class="desp-estado-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">' +
        '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.35-4.35"/></svg>';
    } else if (e.iconType === 'check') {
      svg = '<svg class="desp-estado-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">' +
        '<path d="M20 6L9 17l-5-5"/></svg>';
    } else if (e.iconType === 'truck') {
      svg = '<svg class="desp-estado-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
        '<path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/>' +
        '<path d="M15 18h2"/>' +
        '<path d="M19 18h2v-3.34a1 1 0 0 0-.76-.97L19 13V9a1 1 0 0 0-1-1h-3"/>' +
        '<circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/></svg>';
    }
    return '<span class="' + cls + '" aria-hidden="true">' + svg + '</span>';
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
    estado = ESTADOS[estado] && PREPARADOR_ESTADOS.indexOf(estado) >= 0 ? estado : 'facturado';
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
    data.liveShare = {
      active: false,
      updatedAt: nowIso(),
      sharedBy: usuario || '—'
    };
    save(data);
    notifyLiveShare(null);
    return { ok: true, data: data, stoppedBy: usuario };
  }

  function syncLiveShare(idc, jaula, estado, usuario) {
    return publishLiveShare(idc, jaula, estado, usuario, { requireActive: true });
  }

  function publishLiveShare(idc, jaula, estado, usuario, opts) {
    opts = opts || {};
    idc = formatIdc(idc);
    jaula = String(jaula || '').trim();
    estado = ESTADOS[estado] && PREPARADOR_ESTADOS.indexOf(estado) >= 0 ? estado : 'facturado';
    var data = load();
    var prev = data.liveShare;
    if (opts.requireActive && (!prev || !prev.active)) {
      return { ok: true, synced: false, data: data };
    }
    if (!idc && !jaula && opts.requireActive) {
      return { ok: true, synced: false, data: data };
    }
    data.liveShare = {
      active: true,
      idc: idc,
      jaula: jaula,
      estado: ESTADOS[estado] && PREPARADOR_ESTADOS.indexOf(estado) >= 0
        ? estado
        : ((prev && prev.estado) || 'facturado'),
      updatedAt: nowIso(),
      sharedBy: usuario || (prev && prev.sharedBy) || '—'
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
    data.liveShareLista = {
      active: false,
      updatedAt: nowIso(),
      sharedBy: usuario || '—'
    };
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
      nota: 'Retirado de vista validador · IDC ' + pedido.idc + ' · Jaula ' + (pasillo || '—')
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
    return sortPedidosValidador((pedidos || []).filter(function (p) {
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

  function getRegistroEnviadosValidador(pedidos) {
    return (pedidos || []).filter(function (p) {
      return p.seguimientoValidador === true;
    }).sort(function (a, b) {
      return (b.createdAt || b.updatedAt || '').localeCompare(a.createdAt || a.updatedAt || '');
    });
  }

  function countKpiOperador(pedidos) {
    var registro = getRegistroEnviadosValidador(pedidos);
    var activos = registro.filter(function (p) { return p.visibleValidador !== false; });
    var retirados = registro.filter(function (p) { return p.visibleValidador === false; });
    var stats = {
      activos: activos.length,
      retirados: retirados.length,
      total: registro.length
    };
    VALIDADOR_ESTADOS.forEach(function (id) {
      stats[id] = activos.filter(function (p) { return p.estado === id; }).length;
    });
    return stats;
  }

  /** Totales visibles en el panel del validador (activos, no retirados). */
  function countResumenValidador(pedidos) {
    var activos = getPedidosVisiblesValidador(pedidos);
    var counts = { total: activos.length };
    VALIDADOR_ESTADOS.forEach(function (id) {
      counts[id] = activos.filter(function (p) { return p.estado === id; }).length;
    });
    return counts;
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
    function onLiveShare() {
      callback(load());
    }
    function onLan(ev) {
      if (ev.detail && ev.detail.store === 'despacho') callback(load());
    }
    global.addEventListener('despacho-updated', onCustom);
    global.addEventListener('despacho-live-share', onLiveShare);
    global.addEventListener('despacho-live-lista', onLiveShare);
    global.addEventListener('storage', onStorage);
    global.addEventListener('lan-sync', onLan);
    return function () {
      global.removeEventListener('despacho-updated', onCustom);
      global.removeEventListener('despacho-live-share', onLiveShare);
      global.removeEventListener('despacho-live-lista', onLiveShare);
      global.removeEventListener('storage', onStorage);
      global.removeEventListener('lan-sync', onLan);
    };
  }

  function wipeAll() {
    var empty = emptyPayload();
    save(empty);
    if (broadcast) {
      try { broadcast.postMessage({ type: 'despacho-wipe', at: Date.now() }); } catch (e) { /* noop */ }
    }
    if (broadcastLista) {
      try { broadcastLista.postMessage({ type: 'despacho-wipe', at: Date.now() }); } catch (e) { /* noop */ }
    }
    try {
      global.dispatchEvent(new CustomEvent('despacho-web-wiped'));
    } catch (e) { /* noop */ }
    return empty;
  }

  global.PlatformDespachoStore = {
    STORAGE_KEY: STORAGE_KEY,
    ESTADOS: ESTADOS,
    PREPARADOR_ESTADOS: PREPARADOR_ESTADOS,
    VALIDADOR_ESTADOS: VALIDADOR_ESTADOS,
    VALIDADORES_ASIGNABLES: VALIDADORES_ASIGNABLES,
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
    getRegistroEnviadosValidador: getRegistroEnviadosValidador,
    countKpiOperador: countKpiOperador,
    countResumenValidador: countResumenValidador,
    filterPedidos: filterPedidos,
    countByEstado: countByEstado,
    formatEstado: formatEstado,
    renderEstadoIconSvg: renderEstadoIconSvg,
    formatHistorialEntry: formatHistorialEntry,
    formatIdc: formatIdc,
    getLiveShare: getLiveShare,
    isLiveShareActive: isLiveShareActive,
    startLiveShare: startLiveShare,
    stopLiveShare: stopLiveShare,
    syncLiveShare: syncLiveShare,
    publishLiveShare: publishLiveShare,
    toggleLiveShare: toggleLiveShare,
    getLiveShareLista: getLiveShareLista,
    isLiveShareListaActive: isLiveShareListaActive,
    startLiveShareLista: startLiveShareLista,
    stopLiveShareLista: stopLiveShareLista,
    toggleLiveShareLista: toggleLiveShareLista,
    getPedidosActivos: getPedidosActivos,
    bindSync: bindSync,
    wipeAll: wipeAll
  };
})(typeof window !== 'undefined' ? window : this);
