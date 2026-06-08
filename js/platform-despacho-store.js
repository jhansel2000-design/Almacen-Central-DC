/**
 * Despacho — pedidos, estados y historial (localStorage + eventos)
 */
(function (global) {
  'use strict';

  var STORAGE_KEY = 'almacen_platform_data_despacho';

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
      pedidos: []
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
      data.pedidos = data.pedidos.map(normalizePedido);
      return data;
    } catch (e) {
      return emptyPayload();
    }
  }

  function normalizePedido(p) {
    p = p || {};
    return {
      id: p.id || uid(),
      idc: String(p.idc || '').trim(),
      jaula: String(p.jaula || '').trim(),
      estado: ESTADOS[p.estado] ? p.estado : 'en_proceso',
      createdAt: p.createdAt || nowIso(),
      createdBy: p.createdBy || '—',
      updatedAt: p.updatedAt || p.createdAt || nowIso(),
      updatedBy: p.updatedBy || p.createdBy || '—',
      historial: Array.isArray(p.historial) ? p.historial : []
    };
  }

  function save(data) {
    if (!global.localStorage) return false;
    data = data || emptyPayload();
    data.module = 'despacho';
    data.updatedAt = nowIso();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    notify(data);
    return true;
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
    var n = String(idc || '').trim().toLowerCase();
    if (!n) return -1;
    return (pedidos || []).findIndex(function (p) {
      return String(p.idc || '').trim().toLowerCase() === n;
    });
  }

  function registrarPedido(idc, jaula, estado, usuario) {
    idc = String(idc || '').trim();
    jaula = String(jaula || '').trim();
    estado = ESTADOS[estado] && PREPARADOR_ESTADOS.indexOf(estado) >= 0 ? estado : 'en_proceso';
    usuario = usuario || '—';

    if (!idc) return { ok: false, error: 'Ingrese el ID del pedido (IDC).' };
    if (!jaula) return { ok: false, error: 'Ingrese el número de jaula.' };

    var data = load();
    var idx = findByIdc(data.pedidos, idc);
    var ts = nowIso();

    if (idx >= 0) {
      var existing = data.pedidos[idx];
      if (VALIDADOR_ESTADOS.indexOf(existing.estado) >= 0) {
        return { ok: false, error: 'El pedido ' + idc + ' ya está en validación/despacho. Use el panel Validador.' };
      }
      var prev = existing.estado;
      existing.jaula = jaula;
      existing.estado = estado;
      existing.updatedAt = ts;
      existing.updatedBy = usuario;
      pushHistorial(existing, {
        at: ts,
        usuario: usuario,
        panel: 'preparador',
        desde: prev,
        hacia: estado,
        nota: 'Actualización preparador'
      });
      save(data);
      return { ok: true, data: data, pedido: existing, updated: true };
    }

    var pedido = {
      id: uid(),
      idc: idc,
      jaula: jaula,
      estado: estado,
      createdAt: ts,
      createdBy: usuario,
      updatedAt: ts,
      updatedBy: usuario,
      historial: []
    };
    pushHistorial(pedido, {
      at: ts,
      usuario: usuario,
      panel: 'preparador',
      desde: null,
      hacia: estado,
      nota: 'Registro inicial'
    });
    data.pedidos.unshift(pedido);
    save(data);
    return { ok: true, data: data, pedido: pedido, updated: false };
  }

  function cambiarEstado(pedidoId, nuevoEstado, usuario) {
    if (!ESTADOS[nuevoEstado] || VALIDADOR_ESTADOS.indexOf(nuevoEstado) < 0) {
      return { ok: false, error: 'Estado no válido para el validador.' };
    }
    var data = load();
    var idx = (data.pedidos || []).findIndex(function (p) { return p.id === pedidoId; });
    if (idx < 0) return { ok: false, error: 'Pedido no encontrado.' };

    var pedido = data.pedidos[idx];
    var prev = pedido.estado;
    if (prev === nuevoEstado) {
      return { ok: true, data: data, pedido: pedido, unchanged: true };
    }

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
      nota: 'Cambio de estado validador'
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
    list.sort(function (a, b) {
      return (b.updatedAt || '').localeCompare(a.updatedAt || '');
    });
    return list;
  }

  function countByEstado(pedidos) {
    var counts = {};
    Object.keys(ESTADOS).forEach(function (k) { counts[k] = 0; });
    (pedidos || []).forEach(function (p) {
      if (counts[p.estado] != null) counts[p.estado] += 1;
    });
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
    cambiarEstado: cambiarEstado,
    filterPedidos: filterPedidos,
    countByEstado: countByEstado,
    formatEstado: formatEstado,
    formatHistorialEntry: formatHistorialEntry,
    bindSync: bindSync
  };
})(typeof window !== 'undefined' ? window : this);
