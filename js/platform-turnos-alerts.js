/**
 * Control de Turnos — notificaciones admin (solo cuando está en otra pestaña)
 */
(function (global) {
  'use strict';

  var C = function () { return global.PlatformTurnosCore; };
  var seen = {};
  var bootstrapped = false;

  function isAdminViewActive() {
    var root = document.getElementById('turnosAdminRoot');
    return !!(root && document.body.classList.contains('turnos-admin-mode') &&
      !root.classList.contains('is-hidden'));
  }

  function shouldNotify() {
    return isAdminViewActive() && document.visibilityState === 'hidden';
  }

  function requestPermission() {
    if (!global.Notification) return Promise.resolve(false);
    if (Notification.permission === 'granted') return Promise.resolve(true);
    if (Notification.permission === 'denied') return Promise.resolve(false);
    try {
      return Notification.requestPermission().then(function (p) { return p === 'granted'; });
    } catch (e) {
      return Promise.resolve(false);
    }
  }

  function showBrowserNotification(entry) {
    if (!global.Notification || Notification.permission !== 'granted') return;
    if (!shouldNotify()) return;
    var title = entry.prioridad ? 'Turno PRIORITARIO — ' + entry.turno : 'Nuevo turno — ' + entry.turno;
    var body = (entry.choferNombre || 'Chofer') + ' · ' + (entry.choferCompania || '—') +
      ' · ' + (C().TIPO_LABELS[entry.tipo] || entry.tipo);
    if (entry.prioridad && entry.horaLimite) body += ' · Prioritario';
    try {
      var n = new Notification(title, {
        body: body,
        tag: 'turnos-admin-' + entry.id,
        renotify: true,
        requireInteraction: !!entry.prioridad
      });
      n.onclick = function () {
        try { global.focus(); } catch (e) { /* noop */ }
        n.close();
      };
    } catch (e) { /* noop */ }
  }

  function alertForEntry(entry) {
    if (!entry || entry.estado === 'CANCELADO') return;
    if (!isAdminViewActive()) return;
    if (shouldNotify()) showBrowserNotification(entry);
  }

  function trackEntry(entry) {
    var key = entry.id;
    var sig = String(entry.updatedAt || entry.createdAt || '') + '|' + entry.estado +
      '|' + (entry.horaLimite || '') + '|' + (entry.prioridad ? '1' : '0') +
      '|' + (entry.convocadoAt || '');
    var prev = seen[key];
    seen[key] = sig;
    return { isNew: !prev, changed: prev && prev !== sig, prev: prev };
  }

  function bootstrap(entries) {
    (entries || []).forEach(function (e) { trackEntry(e); });
    bootstrapped = true;
  }

  function onStoreUpdate(shared) {
    if (!isAdminViewActive()) return;
    var entries = (shared && shared.entries) || [];
    if (!bootstrapped) {
      bootstrap(entries);
      return;
    }
    entries.forEach(function (e) {
      var t = trackEntry(e);
      if (t.isNew && e.estado !== 'CANCELADO') {
        alertForEntry(e);
        return;
      }
      if (t.changed && e.prioridad && e.estado === 'PENDIENTE' && shouldNotify()) {
        if (/prioridad/.test(t.prev || '') === false && e.prioridad) {
          alertForEntry(e);
        }
      }
    });
  }

  function reset() {
    seen = {};
    bootstrapped = false;
  }

  function start() {
    reset();
    requestPermission();
  }

  function stop() {
    reset();
  }

  global.PlatformTurnosAlerts = {
    start: start,
    stop: stop,
    reset: reset,
    onStoreUpdate: onStoreUpdate,
    requestPermission: requestPermission,
    stopAlarm: function () { /* compat admin */ },
    isAdminViewActive: isAdminViewActive
  };
})(typeof window !== 'undefined' ? window : this);
