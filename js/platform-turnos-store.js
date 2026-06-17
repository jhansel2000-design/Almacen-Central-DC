/**
 * Control de Turnos — estado compartido chofer / admin (+ Supabase en vivo)
 */
(function (global) {
  'use strict';

  var C = function () { return global.PlatformTurnosCore; };
  var Sync = function () { return global.PlatformTurnosSync; };
  var shared = { counter: 0, entries: [], live: false, setupRequired: false };
  var listeners = [];
  var initPromise = null;

  function loadLocal() {
    var s = C().loadState();
    shared.counter = s.counter;
    shared.entries = s.entries;
  }

  function persistLocal() {
    C().saveState({ counter: shared.counter, entries: shared.entries });
  }

  function applyRemote(data) {
    if (!data) return;
    shared.entries = (data.entries || []).slice();
    shared.counter = Number(data.counter) || shared.counter;
    if (!shared.counter && shared.entries.length) {
      shared.counter = shared.entries.reduce(function (max, e) {
        var n = parseInt(String(e.turno || '').replace(/\D/g, ''), 10) || 0;
        return Math.max(max, n);
      }, 0);
    }
    persistLocal();
    notify();
  }

  function notify() {
    listeners.forEach(function (fn) {
      try { fn(shared); } catch (e) { /* noop */ }
    });
  }

  function subscribe(fn) {
    if (typeof fn !== 'function') return function () {};
    listeners.push(fn);
    return function () {
      listeners = listeners.filter(function (x) { return x !== fn; });
    };
  }

  function findById(id) {
    return shared.entries.find(function (e) { return e.id === id; }) || null;
  }

  function localAddTurn(payload) {
    if (C().isDuplicateSubmit(shared.entries, payload)) {
      return { ok: false, msg: 'Turno duplicado. Espere unos segundos e intente de nuevo.' };
    }
    shared.counter += 1;
    var entry = C().createTurn(shared.counter, payload);
    shared.entries.unshift(entry);
    persistLocal();
    C().rememberChoferName(payload.choferNombre);
    C().playBeep();
    C().saveMyTurn(entry);
    notify();
    return { ok: true, entry: entry };
  }

  function addTurn(payload) {
    var sync = Sync();
    if (sync && shared.live) {
      return sync.insertTurn(payload).then(function (entry) {
        var idx = shared.entries.findIndex(function (e) { return e.id === entry.id; });
        if (idx >= 0) shared.entries[idx] = entry;
        else shared.entries.unshift(entry);
        shared.counter = Math.max(shared.counter, parseInt(String(entry.turno || '').replace(/\D/g, ''), 10) || 0);
        persistLocal();
        C().rememberChoferName(payload.choferNombre);
        C().playBeep();
        C().saveMyTurn(entry);
        notify();
        return { ok: true, entry: entry };
      }).catch(function () {
        return localAddTurn(payload);
      });
    }
    return Promise.resolve(localAddTurn(payload));
  }

  function localSetEstado(id, estado, adminUser) {
    var found = null;
    shared.entries = shared.entries.map(function (e) {
      if (e.id !== id) return e;
      if (!C().isValidTransition(e, estado)) return e;
      found = Object.assign({}, e, {
        estado: estado,
        updatedAt: Date.now(),
        updatedBy: adminUser || 'admin'
      });
      return found;
    });
    if (!found) return { ok: false, msg: 'No se pudo cambiar el estado.' };
    persistLocal();
    notify();
    return { ok: true, entry: found };
  }

  function setEstado(id, estado, adminUser) {
    var sync = Sync();
    if (sync && shared.live) {
      return sync.updateEstado(id, estado, adminUser).then(function (entry) {
        var idx = shared.entries.findIndex(function (e) { return e.id === id; });
        if (idx >= 0) shared.entries[idx] = entry;
        persistLocal();
        notify();
        return { ok: true, entry: entry };
      }).catch(function () {
        return localSetEstado(id, estado, adminUser);
      });
    }
    return Promise.resolve(localSetEstado(id, estado, adminUser));
  }

  function localConvocar(id, adminUser) {
    var found = null;
    shared.entries = shared.entries.map(function (e) {
      if (e.id !== id) return e;
      found = Object.assign({}, e, {
        convocadoAt: Date.now(),
        updatedAt: Date.now(),
        updatedBy: adminUser || 'admin'
      });
      if (C().allowedStates(e.tipo).indexOf('EN_PROCESO') >= 0) {
        found.estado = 'EN_PROCESO';
      }
      return found;
    });
    if (!found) return { ok: false, msg: 'Turno no encontrado.' };
    persistLocal();
    notify();
    return { ok: true, entry: found };
  }

  function convocarChofer(id, adminUser) {
    var sync = Sync();
    if (sync && shared.live) {
      return sync.convocarChofer(id, adminUser).then(function (entry) {
        var idx = shared.entries.findIndex(function (e) { return e.id === id; });
        if (idx >= 0) shared.entries[idx] = entry;
        persistLocal();
        notify();
        return { ok: true, entry: entry };
      }).catch(function () {
        return localConvocar(id, adminUser);
      });
    }
    return Promise.resolve(localConvocar(id, adminUser));
  }

  function resetCounter() {
    shared.counter = 0;
    persistLocal();
    notify();
  }

  function getState() {
    return shared;
  }

  function load() {
    loadLocal();
    notify();
    return shared;
  }

  function init() {
    if (initPromise) return initPromise;
    loadLocal();
    notify();
    var sync = Sync();
    if (!sync) {
      shared.live = false;
      return Promise.resolve(shared);
    }
    initPromise = sync.ready().then(function (res) {
      shared.setupRequired = sync.isSetupRequired();
      if (res.ok && res.data) {
        shared.live = true;
        applyRemote(res.data);
      } else {
        shared.live = false;
      }
      sync.onChange(function (kind, data) {
        if (kind === 'sync' && data) {
          shared.live = true;
          shared.setupRequired = false;
          applyRemote(data);
        }
      });
      return shared;
    });
    return initPromise;
  }

  global.PlatformTurnosStore = {
    load: load,
    init: init,
    persist: persistLocal,
    subscribe: subscribe,
    addTurn: addTurn,
    setEstado: setEstado,
    convocarChofer: convocarChofer,
    resetCounter: resetCounter,
    getState: getState,
    findById: findById
  };
})(typeof window !== 'undefined' ? window : this);
