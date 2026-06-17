/**
 * Control de Turnos — estado compartido chofer / admin
 */
(function (global) {
  'use strict';

  var C = function () { return global.PlatformTurnosCore; };
  var shared = { counter: 0, entries: [] };
  var listeners = [];

  function load() {
    var s = C().loadState();
    shared.counter = s.counter;
    shared.entries = s.entries;
    notify();
    return shared;
  }

  function persist() {
    C().saveState({ counter: shared.counter, entries: shared.entries });
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

  function addTurn(payload) {
    if (C().isDuplicateSubmit(shared.entries, payload)) {
      return { ok: false, msg: 'Turno duplicado. Espere unos segundos e intente de nuevo.' };
    }
    shared.counter += 1;
    var entry = C().createTurn(shared.counter, payload);
    shared.entries.unshift(entry);
    persist();
    C().rememberChoferName(payload.choferNombre);
    C().playBeep();
    return { ok: true, entry: entry };
  }

  function setEstado(id, estado, adminUser) {
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
    persist();
    return { ok: true, entry: found };
  }

  function resetCounter() {
    shared.counter = 0;
    persist();
  }

  function getState() {
    return shared;
  }

  global.PlatformTurnosStore = {
    load: load,
    persist: persist,
    subscribe: subscribe,
    addTurn: addTurn,
    setEstado: setEstado,
    resetCounter: resetCounter,
    getState: getState
  };
})(typeof window !== 'undefined' ? window : this);
