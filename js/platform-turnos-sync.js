/**
 * Control de Turnos — Supabase en vivo vía web_snapshots (sin migración extra)
 */
(function (global) {
  'use strict';

  var MODULE = 'turnos';
  var C = function () { return global.PlatformTurnosCore; };
  var Bridge = function () { return global.PlatformSupabaseBridge; };
  var listeners = [];
  var unsub = null;
  var readyPromise = null;
  var live = false;
  var setupRequired = false;

  function notify(kind, payload) {
    listeners.forEach(function (fn) {
      try { fn(kind, payload); } catch (e) { /* noop */ }
    });
  }

  function onChange(fn) {
    listeners.push(fn);
    return function () {
      listeners = listeners.filter(function (x) { return x !== fn; });
    };
  }

  function normalizeSnapshot(raw) {
    if (!raw || typeof raw !== 'object') return { counter: 0, entries: [] };
    var entries = (raw.entries || []).map(function (e) { return C().normalizeEntry(e); }).filter(Boolean);
    var counter = Number(raw.counter) || 0;
    if (!counter && entries.length) {
      counter = entries.reduce(function (max, e) {
        var n = parseInt(String(e.turno || '').replace(/\D/g, ''), 10) || 0;
        return Math.max(max, n);
      }, 0);
    }
    return { counter: counter, entries: entries };
  }

  function pullState() {
    var B = Bridge();
    if (!B) return Promise.reject(new Error('Sin Supabase'));
    return B.pull(MODULE).then(function (data) {
      live = true;
      setupRequired = false;
      return normalizeSnapshot(data);
    });
  }

  function pushState(state) {
    var B = Bridge();
    if (!B) return Promise.reject(new Error('Sin Supabase'));
    var payload = {
      counter: Number(state.counter) || 0,
      entries: (state.entries || []).map(function (e) { return C().normalizeEntry(e); }).filter(Boolean),
      updatedAt: new Date().toISOString()
    };
    return B.push(MODULE, payload).then(function (ok) {
      if (!ok) throw new Error('No se pudo guardar en la nube');
      live = true;
      setupRequired = false;
      return payload;
    });
  }

  function subscribeRealtime() {
    var B = Bridge();
    if (!B || !B.subscribe) return;
    if (unsub) unsub();
    unsub = B.subscribe(MODULE, function (remote) {
      if (!remote) return;
      live = true;
      setupRequired = false;
      notify('sync', normalizeSnapshot(remote));
    });
  }

  function ready() {
    if (readyPromise) return readyPromise;
    var B = Bridge();
    if (!B) {
      setupRequired = true;
      return Promise.resolve({ ok: false, local: true });
    }
    readyPromise = B.ensureReady().then(function () {
      if (!B.isEnabled || !B.isEnabled()) {
        setupRequired = true;
        return { ok: false, local: true };
      }
      return pullState().then(function (data) {
        subscribeRealtime();
        return { ok: true, data: data };
      }).catch(function () {
        setupRequired = false;
        live = true;
        subscribeRealtime();
        return { ok: true, data: { counter: 0, entries: [] } };
      });
    }).catch(function () {
      setupRequired = true;
      return { ok: false, local: true };
    });
    return readyPromise;
  }

  function nextCounter(entries, remoteCounter) {
    var counter = Number(remoteCounter) || 0;
    (entries || []).forEach(function (e) {
      var n = parseInt(String(e.turno || '').replace(/\D/g, ''), 10) || 0;
      counter = Math.max(counter, n);
    });
    return counter + 1;
  }

  function insertTurn(payload) {
    return pullState().then(function (remote) {
      if (C().isDuplicateSubmit(remote.entries, payload)) {
        return Promise.reject(new Error('Turno duplicado'));
      }
      var n = nextCounter(remote.entries, remote.counter);
      var entry = C().createTurn(n, payload);
      remote.counter = n;
      remote.entries.unshift(entry);
      return pushState(remote).then(function () { return entry; });
    });
  }

  function patchEntry(id, patch, updatedBy) {
    return pullState().then(function (remote) {
      var found = null;
      remote.entries = remote.entries.map(function (e) {
        if (e.id !== id) return e;
        var merged = Object.assign({}, e, patch, {
          updatedAt: Date.now(),
          updatedBy: updatedBy || patch.updatedBy || e.updatedBy || 'admin'
        });
        merged.historial = C().mergeSeguimientoOnPatch(e, patch, updatedBy || patch.updatedBy || 'admin');
        if (merged.historial.length <= (e.historial || []).length) {
          merged.historial = e.historial || merged.historial;
        }
        found = C().normalizeEntry(merged);
        return found;
      });
      if (!found) return Promise.reject(new Error('Turno no encontrado'));
      return pushState(remote).then(function () { return found; });
    });
  }

  function updateEstado(id, estado, adminUser) {
    return pullState().then(function (remote) {
      var entry = remote.entries.find(function (e) { return e.id === id; });
      if (!entry) return Promise.reject(new Error('Turno no encontrado'));
      if (!C().isValidTransition(entry, estado)) {
        return Promise.reject(new Error('Estado no permitido'));
      }
      return patchEntry(id, { estado: estado }, adminUser || 'admin');
    });
  }

  function convocarChofer(id, adminUser) {
    return pullState().then(function (remote) {
      var entry = remote.entries.find(function (e) { return e.id === id; });
      if (!entry) return Promise.reject(new Error('Turno no encontrado'));
      var patch = {
        convocadoAt: Date.now(),
        updatedBy: adminUser || 'admin'
      };
      if (C().allowedStates(entry.tipo).indexOf('EN_PROCESO') >= 0) {
        patch.estado = 'EN_PROCESO';
      }
      return patchEntry(id, patch, adminUser || 'admin');
    });
  }

  function setHoraLimite(id, horaLimite, adminUser) {
    horaLimite = String(horaLimite || '').trim();
    if (!horaLimite) return Promise.reject(new Error('Indique la hora límite'));
    return pullState().then(function (remote) {
      var entry = remote.entries.find(function (e) { return e.id === id; });
      if (!entry) return Promise.reject(new Error('Turno no encontrado'));
      if (!entry.prioridad) return Promise.reject(new Error('Solo turnos prioritarios'));
      return patchEntry(id, {
        horaLimite: horaLimite,
        detalle: C().buildDetalle(Object.assign({}, entry, { horaLimite: horaLimite }))
      }, adminUser || 'admin');
    });
  }

  function resetCounter() {
    return pullState().then(function (remote) {
      remote.counter = 0;
      return pushState(remote);
    });
  }

  function fetchAll() {
    return pullState();
  }

  function isLive() { return live; }
  function isSetupRequired() { return setupRequired; }

  function teardown() {
    if (unsub) unsub();
    unsub = null;
  }

  global.PlatformTurnosSync = {
    ready: ready,
    fetchAll: fetchAll,
    insertTurn: insertTurn,
    updateEstado: updateEstado,
    convocarChofer: convocarChofer,
    setHoraLimite: setHoraLimite,
    resetCounter: resetCounter,
    pushState: pushState,
    onChange: onChange,
    isLive: isLive,
    isSetupRequired: isSetupRequired,
    teardown: teardown
  };
})(typeof window !== 'undefined' ? window : this);
