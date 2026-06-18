/**
 * Control de Turnos — convocatoria al chofer (voz, alarma, notificación móvil)
 */
(function (global) {
  'use strict';

  var C = function () { return global.PlatformTurnosCore; };
  var activeEntry = null;
  var alarmTimer = null;
  var repeatTimer = null;
  var alarmCtx = null;
  var speaking = false;
  var wakeLock = null;

  function ventanaSpeech(entry) {
    var v = C().ventanaLabel(entry.tipo);
    return v.replace(/^Ventana de /i, 'ventana de ');
  }

  function buildSpeechText(entry) {
    return 'Ya es su turno ' + entry.turno + '. Pase a la ' + ventanaSpeech(entry) + '.';
  }

  function stopAlarm() {
    if (alarmTimer) {
      clearInterval(alarmTimer);
      alarmTimer = null;
    }
    if (repeatTimer) {
      clearInterval(repeatTimer);
      repeatTimer = null;
    }
    if (alarmCtx) {
      try { alarmCtx.close(); } catch (e) { /* noop */ }
      alarmCtx = null;
    }
    try {
      if (global.speechSynthesis) global.speechSynthesis.cancel();
    } catch (e) { /* noop */ }
    speaking = false;
    releaseWakeLock();
  }

  function releaseWakeLock() {
    if (!wakeLock) return;
    try {
      wakeLock.release();
    } catch (e) { /* noop */ }
    wakeLock = null;
  }

  function requestWakeLock() {
    if (!navigator.wakeLock) return;
    try {
      navigator.wakeLock.request('screen').then(function (lock) {
        wakeLock = lock;
        lock.addEventListener('release', function () { wakeLock = null; });
      }).catch(function () { /* noop */ });
    } catch (e) { /* noop */ }
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

  function showNotification(entry) {
    if (!global.Notification || Notification.permission !== 'granted') return;
    try {
      var ventana = C().ventanaLabel(entry.tipo);
      var n = new Notification('¡Ya es su turno! ' + entry.turno, {
        body: 'Pase a la ' + ventana,
        tag: 'turnos-chofer-call-' + entry.id,
        renotify: true,
        requireInteraction: true
      });
      n.onclick = function () {
        try { global.focus(); } catch (e) { /* noop */ }
        n.close();
      };
    } catch (e) { /* noop */ }
  }

  function vibrateAggressive() {
    try {
      if (navigator.vibrate) {
        navigator.vibrate([400, 150, 400, 150, 600, 150, 800]);
      }
    } catch (e) { /* noop */ }
    if (C()) C().vibrateCall();
  }

  function playCallSiren(cycles) {
    cycles = cycles || 14;
    stopAlarm();
    try {
      alarmCtx = new (global.AudioContext || global.webkitAudioContext)();
      if (alarmCtx.state === 'suspended') {
        alarmCtx.resume().catch(function () { /* noop */ });
      }
      var step = 0;
      alarmTimer = setInterval(function () {
        if (!activeEntry) {
          stopAlarm();
          return;
        }
        if (step >= cycles) {
          clearInterval(alarmTimer);
          alarmTimer = null;
          return;
        }
        var t = alarmCtx.currentTime;
        var osc = alarmCtx.createOscillator();
        var g = alarmCtx.createGain();
        var freqs = [880, 1200, 1600, 1200];
        osc.type = 'sawtooth';
        osc.frequency.value = freqs[step % freqs.length];
        g.gain.value = 0.42;
        osc.connect(g);
        g.connect(alarmCtx.destination);
        osc.start(t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
        osc.stop(t + 0.56);
        step += 1;
      }, 580);
    } catch (e) { /* noop */ }
  }

  function speakThenAlarm(entry) {
    if (!global.speechSynthesis) {
      playCallSiren(14);
      return;
    }
    speaking = true;
    var u = new SpeechSynthesisUtterance(buildSpeechText(entry));
    u.lang = 'es-ES';
    u.rate = 0.88;
    u.pitch = 1.05;
    u.volume = 1;
    var voices = speechSynthesis.getVoices();
    var es = voices.filter(function (v) { return /es/i.test(v.lang); });
    if (es.length) u.voice = es[0];
    var done = function () {
      speaking = false;
      if (activeEntry && activeEntry.id === entry.id) {
        playCallSiren(14);
      }
    };
    u.onend = done;
    u.onerror = done;
    try {
      speechSynthesis.cancel();
      speechSynthesis.speak(u);
    } catch (e) {
      speaking = false;
      playCallSiren(14);
    }
  }

  function startRepeatAlert(entry) {
    if (repeatTimer) clearInterval(repeatTimer);
    repeatTimer = setInterval(function () {
      if (!activeEntry || activeEntry.id !== entry.id) {
        clearInterval(repeatTimer);
        repeatTimer = null;
        return;
      }
      vibrateAggressive();
      if (document.visibilityState === 'hidden') {
        showNotification(entry);
      }
      if (!speaking && !alarmTimer) {
        playCallSiren(6);
      }
    }, 12000);
  }

  function runFullAlert(entry) {
    vibrateAggressive();
    if (document.visibilityState === 'hidden') {
      showNotification(entry);
    }
    speakThenAlarm(entry);
    startRepeatAlert(entry);
  }

  function activate(entry) {
    if (!entry || !entry.convocadoAt) return false;
    if (C().getConvocadoSeen(entry.id) >= entry.convocadoAt) return false;

    var isNew = !activeEntry || activeEntry.id !== entry.id ||
      activeEntry.convocadoAt !== entry.convocadoAt;
    activeEntry = entry;

    if (isNew) {
      requestWakeLock();
      runFullAlert(entry);
    }
    return true;
  }

  function dismiss(entry) {
    if (entry && entry.convocadoAt) {
      C().markConvocadoSeen(entry.id, entry.convocadoAt);
    } else if (activeEntry && activeEntry.convocadoAt) {
      C().markConvocadoSeen(activeEntry.id, activeEntry.convocadoAt);
    }
    activeEntry = null;
    stopAlarm();
  }

  function isActive() {
    return !!activeEntry;
  }

  function getActiveEntry() {
    return activeEntry;
  }

  function onVisibilityChange() {
    if (!activeEntry) return;
    if (document.visibilityState === 'visible') {
      runFullAlert(activeEntry);
    }
  }

  function init() {
    document.addEventListener('visibilitychange', onVisibilityChange);
    if (global.speechSynthesis && speechSynthesis.getVoices().length === 0) {
      speechSynthesis.addEventListener('voiceschanged', function () { /* preload */ }, { once: true });
    }
    requestPermission();
  }

  global.PlatformTurnosChoferCall = {
    init: init,
    activate: activate,
    dismiss: dismiss,
    stop: stopAlarm,
    isActive: isActive,
    getActiveEntry: getActiveEntry,
    requestPermission: requestPermission,
    buildSpeechText: buildSpeechText
  };
})(typeof window !== 'undefined' ? window : this);
