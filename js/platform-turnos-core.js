/**
 * Control de Turnos — modelo, estados y persistencia v2
 */
(function (global) {
  'use strict';

  var STORAGE_KEY = 'dc_turnos_despacho_v2';
  var CHOFER_NAME_KEY = 'dc_turnos_chofer_name';
  var MY_TURN_KEY = 'dc_turnos_my_active';
  var CONVOCADO_SEEN_PREFIX = 'dc_turnos_convocado_seen_';
  var DEDUP_MS = 8000;

  var TIPOS = {
    DESPACHO: 'despacho_facturas',
    LIQUIDACION: 'liquidacion_facturas',
    NOTA_CREDITO: 'nota_credito'
  };

  var TIPO_LABELS = {
    despacho_facturas: 'Despacho de facturas',
    liquidacion_facturas: 'Liquidación de facturas',
    nota_credito: 'Nota de crédito'
  };

  var VENTANA_LABELS = {
    despacho_facturas: 'Ventana de Despacho de facturas',
    liquidacion_facturas: 'Ventana de Liquidación de facturas',
    nota_credito: 'Ventana de Nota de crédito'
  };

  function todayKey(d) {
    d = d || new Date();
    return d.toISOString().slice(0, 10);
  }

  function formatTime(d) {
    d = d || new Date();
    return d.toTimeString().slice(0, 8);
  }

  function formatTurno(n) {
    return 'T-' + String(Math.max(0, n)).padStart(4, '0');
  }

  function normalizeEntry(raw) {
    if (!raw || typeof raw !== 'object') return null;
    var estado = String(raw.estado || 'PENDIENTE').toUpperCase();
    if (estado === 'VALIDADO') estado = 'COMPLETADO';
    var tipo = raw.tipo || TIPOS.DESPACHO;
    if (!TIPO_LABELS[tipo]) tipo = TIPOS.DESPACHO;
    return {
      id: raw.id || (Date.now() + '-' + Math.random().toString(36).slice(2, 7)),
      turno: raw.turno || formatTurno(0),
      fecha: raw.fecha || todayKey(),
      hora: raw.hora || formatTime(),
      createdAt: Number(raw.createdAt) || Date.now(),
      tipo: tipo,
      choferNombre: String(raw.choferNombre || '').trim(),
      idsCarga: String(raw.idsCarga || raw.qrContent || '').trim(),
      cantidadViajes: raw.cantidadViajes != null ? Number(raw.cantidadViajes) : null,
      detalle: String(raw.detalle || '').trim(),
      estado: estado,
      convocadoAt: raw.convocadoAt != null ? Number(raw.convocadoAt) : null,
      updatedAt: raw.updatedAt != null ? Number(raw.updatedAt) : null,
      updatedBy: String(raw.updatedBy || '').trim()
    };
  }

  function ventanaLabel(tipo) {
    return VENTANA_LABELS[tipo] || 'Ventana de atención';
  }

  function isTurnActive(entry) {
    if (!entry) return false;
    if (entry.estado === 'COMPLETADO' || entry.estado === 'ASENTADO') return false;
    return true;
  }

  function saveMyTurn(entry) {
    if (!entry || !entry.id) return;
    try {
      localStorage.setItem(MY_TURN_KEY, JSON.stringify({
        id: entry.id,
        turno: entry.turno,
        tipo: entry.tipo
      }));
    } catch (e) { /* noop */ }
  }

  function getMyTurnRef() {
    try {
      var raw = localStorage.getItem(MY_TURN_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) {
      return null;
    }
  }

  function clearMyTurn() {
    try { localStorage.removeItem(MY_TURN_KEY); } catch (e) { /* noop */ }
  }

  function getConvocadoSeen(id) {
    try {
      return Number(localStorage.getItem(CONVOCADO_SEEN_PREFIX + id)) || 0;
    } catch (e) {
      return 0;
    }
  }

  function markConvocadoSeen(id, ts) {
    try {
      localStorage.setItem(CONVOCADO_SEEN_PREFIX + id, String(ts || Date.now()));
    } catch (e) { /* noop */ }
  }

  function vibrateCall() {
    try {
      if (navigator.vibrate) navigator.vibrate([300, 120, 300, 120, 500, 120, 500]);
    } catch (e) { /* noop */ }
    playBeep();
  }

  function migrateState(parsed) {
    var entries = (parsed.entries || []).map(normalizeEntry).filter(Boolean);
    return {
      counter: Number(parsed.counter) || 0,
      entries: entries
    };
  }

  function loadState() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return migrateState(JSON.parse(raw));
      raw = localStorage.getItem('dc_turnos_despacho_v1');
      if (raw) {
        var migrated = migrateState(JSON.parse(raw));
        saveState(migrated);
        return migrated;
      }
    } catch (e) { /* noop */ }
    return { counter: 0, entries: [] };
  }

  function saveState(state) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function buildDetalle(payload) {
    var nombre = String(payload.choferNombre || '').trim();
    if (payload.tipo === TIPOS.DESPACHO) {
      return 'Chofer: ' + nombre + ' · ID carga: ' + String(payload.idsCarga || '').trim();
    }
    if (payload.tipo === TIPOS.LIQUIDACION) {
      return 'Chofer: ' + nombre + ' · Viajes: ' + String(payload.cantidadViajes || '');
    }
    if (payload.tipo === TIPOS.NOTA_CREDITO) {
      return 'Chofer: ' + nombre + ' · Nota de crédito';
    }
    return nombre;
  }

  function createTurn(counter, payload) {
    var now = new Date();
    payload = payload || {};
    return normalizeEntry({
      id: String(now.getTime()) + '-' + Math.random().toString(36).slice(2, 7),
      turno: formatTurno(counter),
      fecha: todayKey(now),
      hora: formatTime(now),
      createdAt: now.getTime(),
      tipo: payload.tipo || TIPOS.DESPACHO,
      choferNombre: payload.choferNombre,
      idsCarga: payload.idsCarga,
      cantidadViajes: payload.cantidadViajes,
      detalle: buildDetalle(payload),
      estado: 'PENDIENTE'
    });
  }

  function allowedStates(tipo) {
    if (tipo === TIPOS.NOTA_CREDITO) {
      return ['PENDIENTE', 'CONFIRMADO', 'ASENTADO'];
    }
    return ['PENDIENTE', 'EN_PROCESO', 'COMPLETADO'];
  }

  function isValidTransition(entry, nextEstado) {
    var allowed = allowedStates(entry.tipo);
    return allowed.indexOf(nextEstado) >= 0;
  }

  function isDuplicateSubmit(entries, payload) {
    var cutoff = Date.now() - DEDUP_MS;
    var nombre = String(payload.choferNombre || '').trim().toLowerCase();
    var tipo = payload.tipo;
    return entries.some(function (e) {
      if (e.createdAt < cutoff || e.tipo !== tipo) return false;
      if (e.choferNombre.toLowerCase() !== nombre) return false;
      if (tipo === TIPOS.DESPACHO) {
        return String(e.idsCarga).trim() === String(payload.idsCarga || '').trim();
      }
      if (tipo === TIPOS.LIQUIDACION) {
        return Number(e.cantidadViajes) === Number(payload.cantidadViajes);
      }
      return true;
    });
  }

  function statsToday(entries) {
    var day = todayKey();
    var today = entries.filter(function (e) { return e.fecha === day; });
    return {
      totalHoy: today.length,
      pendientes: today.filter(function (e) { return e.estado === 'PENDIENTE'; }).length,
      enProceso: today.filter(function (e) { return e.estado === 'EN_PROCESO'; }).length,
      completados: today.filter(function (e) { return e.estado === 'COMPLETADO'; }).length,
      notasPendientes: today.filter(function (e) {
        return e.tipo === TIPOS.NOTA_CREDITO && e.estado === 'PENDIENTE';
      }).length,
      confirmados: today.filter(function (e) { return e.estado === 'CONFIRMADO'; }).length,
      asentados: today.filter(function (e) { return e.estado === 'ASENTADO'; }).length
    };
  }

  function rememberChoferName(name) {
    try {
      localStorage.setItem(CHOFER_NAME_KEY, String(name || '').trim());
    } catch (e) { /* noop */ }
  }

  function getRememberedChoferName() {
    try {
      return localStorage.getItem(CHOFER_NAME_KEY) || '';
    } catch (e) {
      return '';
    }
  }

  function playBeep() {
    try {
      var ctx = new (global.AudioContext || global.webkitAudioContext)();
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      osc.frequency.value = 880;
      gain.gain.value = 0.08;
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.25);
      osc.stop(ctx.currentTime + 0.26);
      setTimeout(function () { ctx.close(); }, 400);
    } catch (e) { /* noop */ }
  }

  function statusClass(estado) {
    if (estado === 'COMPLETADO' || estado === 'ASENTADO') return 'ok';
    if (estado === 'EN_PROCESO' || estado === 'CONFIRMADO') return 'process';
    return 'pending';
  }

  global.PlatformTurnosCore = {
    STORAGE_KEY: STORAGE_KEY,
    TIPOS: TIPOS,
    TIPO_LABELS: TIPO_LABELS,
    loadState: loadState,
    saveState: saveState,
    createTurn: createTurn,
    allowedStates: allowedStates,
    isValidTransition: isValidTransition,
    isDuplicateSubmit: isDuplicateSubmit,
    statsToday: statsToday,
    formatTurno: formatTurno,
    playBeep: playBeep,
    todayKey: todayKey,
    rememberChoferName: rememberChoferName,
    getRememberedChoferName: getRememberedChoferName,
    statusClass: statusClass,
    normalizeEntry: normalizeEntry,
    ventanaLabel: ventanaLabel,
    isTurnActive: isTurnActive,
    saveMyTurn: saveMyTurn,
    getMyTurnRef: getMyTurnRef,
    clearMyTurn: clearMyTurn,
    getConvocadoSeen: getConvocadoSeen,
    markConvocadoSeen: markConvocadoSeen,
    vibrateCall: vibrateCall,
    VENTANA_LABELS: VENTANA_LABELS
  };
})(typeof window !== 'undefined' ? window : this);
