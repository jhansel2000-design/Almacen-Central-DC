/**
 * Control de Turnos — alertas admin (notificación, voz IA, alarma)
 * Solo suena/avisa cuando el administrador NO está viendo la pestaña de turnos.
 */
(function (global) {
  'use strict';

  var C = function () { return global.PlatformTurnosCore; };
  var seen = {};
  var bootstrapped = false;
  var speechQueue = [];
  var speaking = false;
  var alarmTimer = null;
  var alarmCtx = null;
  var notifPermission = 'default';

  function isAdminViewActive() {
    var root = document.getElementById('turnosAdminRoot');
    return !!(root && document.body.classList.contains('turnos-admin-mode') &&
      !root.classList.contains('is-hidden'));
  }

  function shouldAlertExternally() {
    return isAdminViewActive() && document.visibilityState === 'hidden';
  }

  function stopAlarm() {
    if (alarmTimer) {
      clearInterval(alarmTimer);
      alarmTimer = null;
    }
    if (alarmCtx) {
      try { alarmCtx.close(); } catch (e) { /* noop */ }
      alarmCtx = null;
    }
    try {
      if (global.speechSynthesis) global.speechSynthesis.cancel();
    } catch (e) { /* noop */ }
    speaking = false;
    speechQueue = [];
  }

  function onTabVisible() {
    if (!isAdminViewActive()) return;
    stopAlarm();
    try {
      if (global.Notification && Notification.permission === 'granted') {
        // Cierra notificaciones del portal si el admin volvió a la pestaña
      }
    } catch (e) { /* noop */ }
  }

  function requestPermission() {
    if (!global.Notification) return Promise.resolve(false);
    if (Notification.permission === 'granted') {
      notifPermission = 'granted';
      return Promise.resolve(true);
    }
    if (Notification.permission === 'denied') {
      notifPermission = 'denied';
      return Promise.resolve(false);
    }
    try {
      return Notification.requestPermission().then(function (p) {
        notifPermission = p;
        return p === 'granted';
      });
    } catch (e) {
      return Promise.resolve(false);
    }
  }

  function showBrowserNotification(entry) {
    if (!global.Notification || Notification.permission !== 'granted') return;
    if (!shouldAlertExternally()) return;
    var title = entry.prioridad ? 'Turno PRIORITARIO — ' + entry.turno : 'Nuevo turno — ' + entry.turno;
    var body = (entry.choferNombre || 'Chofer') + ' · ' + (C().TIPO_LABELS[entry.tipo] || entry.tipo);
    if (entry.prioridad && entry.horaLimite) body += ' · Límite ' + entry.horaLimite;
    try {
      var n = new Notification(title, {
        body: body,
        tag: 'turnos-' + entry.id,
        renotify: true,
        requireInteraction: entry.prioridad
      });
      n.onclick = function () {
        try { global.focus(); } catch (e) { /* noop */ }
        n.close();
      };
    } catch (e) { /* noop */ }
  }

  function buildSpeechText(entry) {
    var tipo = C().TIPO_LABELS[entry.tipo] || 'trámite';
    if (entry.prioridad) {
      var lim = entry.horaLimite ? '. Hora límite ' + entry.horaLimite.replace(':', ' y ') : '';
      return 'Atención. Turno prioritario ' + entry.turno + ' para ' + entry.choferNombre + '. ' + tipo + lim;
    }
    return 'Nuevo turno ' + entry.turno + ' para ' + entry.choferNombre + '. ' + tipo;
  }

  function entryPrioridadFromText(t) {
    return /prioritario/i.test(t || '');
  }

  var lastEntryRef = null;

  function speakNext() {
    if (speaking || !speechQueue.length) return;
    if (!shouldAlertExternally()) {
      speechQueue = [];
      return;
    }
    if (!global.speechSynthesis) {
      var e0 = lastEntryRef;
      speechQueue = [];
      playSiren(e0 && e0.prioridad);
      return;
    }
    speaking = true;
    var text = speechQueue.shift();
    var isPriority = entryPrioridadFromText(text);
    var u = new SpeechSynthesisUtterance(text);
    u.lang = 'es-ES';
    u.rate = isPriority ? 0.95 : 1.05;
    u.pitch = 1;
    var voices = speechSynthesis.getVoices();
    var es = voices.filter(function (v) { return /es/i.test(v.lang); });
    if (es.length) u.voice = es[0];
    u.onend = u.onerror = function () {
      speaking = false;
      if (shouldAlertExternally()) playSiren(isPriority);
      else if (speechQueue.length) speakNext();
    };
    try { speechSynthesis.speak(u); } catch (e) {
      speaking = false;
      if (shouldAlertExternally()) playSiren(isPriority);
    }
  }

  function enqueueSpeech(entry) {
    lastEntryRef = entry;
    speechQueue.push(buildSpeechText(entry));
    speakNext();
  }

  function playBeepSoft() {
    try {
      var ctx = new (global.AudioContext || global.webkitAudioContext)();
      var osc = ctx.createOscillator();
      var g = ctx.createGain();
      osc.frequency.value = 660;
      g.gain.value = 0.12;
      osc.connect(g);
      g.connect(ctx.destination);
      osc.start();
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.2);
      osc.stop(ctx.currentTime + 0.22);
      setTimeout(function () { ctx.close(); }, 300);
    } catch (e) { /* noop */ }
  }

  function playSiren(priority) {
    if (!shouldAlertExternally()) return;
    stopAlarm();
    try {
      alarmCtx = new (global.AudioContext || global.webkitAudioContext)();
      var step = 0;
      var cycles = priority ? 8 : 4;
      alarmTimer = setInterval(function () {
        if (!shouldAlertExternally()) {
          stopAlarm();
          return;
        }
        if (step >= cycles) {
          stopAlarm();
          return;
        }
        var t = alarmCtx.currentTime;
        var osc = alarmCtx.createOscillator();
        var g = alarmCtx.createGain();
        var freq = priority ? (step % 2 === 0 ? 880 : 1320) : 740;
        osc.type = priority ? 'sawtooth' : 'square';
        osc.frequency.value = freq;
        g.gain.value = priority ? 0.22 : 0.14;
        osc.connect(g);
        g.connect(alarmCtx.destination);
        osc.start(t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + (priority ? 0.45 : 0.28));
        osc.stop(t + (priority ? 0.46 : 0.3));
        step += 1;
      }, priority ? 520 : 380);
    } catch (e) { /* noop */ }
  }

  function alertForEntry(entry, reason) {
    if (!entry || entry.estado === 'CANCELADO') return;
    if (!isAdminViewActive()) return;

    if (shouldAlertExternally()) {
      showBrowserNotification(entry);
      enqueueSpeech(entry);
    } else {
      playBeepSoft();
      if (entry.prioridad) playSiren(true);
    }
  }

  function trackEntry(entry) {
    var key = entry.id;
    var sig = String(entry.updatedAt || entry.createdAt || '') + '|' + entry.estado +
      '|' + (entry.horaLimite || '') + '|' + (entry.prioridad ? '1' : '0');
    var prev = seen[key];
    seen[key] = sig;
    return { isNew: !prev, changed: prev && prev !== sig, prev: prev };
  }

  function bootstrap(entries) {
    (entries || []).forEach(function (e) {
      trackEntry(e);
    });
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
        alertForEntry(e, 'new');
        return;
      }
      if (t.changed && e.prioridad && e.estado === 'PENDIENTE' && shouldAlertExternally()) {
        if (/prioridad|horaLimite/.test(t.prev || '') === false && e.horaLimite) {
          alertForEntry(e, 'deadline');
        }
      }
    });
  }

  function reset() {
    seen = {};
    bootstrapped = false;
    stopAlarm();
  }

  function start() {
    reset();
    requestPermission();
    if (global.speechSynthesis && speechSynthesis.getVoices().length === 0) {
      speechSynthesis.addEventListener('voiceschanged', function () { /* preload */ }, { once: true });
    }
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible') onTabVisible();
    });
    global.addEventListener('focus', onTabVisible);
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
    stopAlarm: stopAlarm,
    isAdminViewActive: isAdminViewActive
  };
})(typeof window !== 'undefined' ? window : this);
