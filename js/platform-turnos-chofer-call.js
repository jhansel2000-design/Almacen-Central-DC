/**
 * Control de Turnos — convocatoria al chofer (voz natural, alarma, notificación móvil)
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
  var voicesReady = false;

  function ventanaSpeechNatural(entry) {
    if (!entry) return 'ventana de atención';
    var tipo = entry.tipo;
    if (C() && tipo === C().TIPOS.DESPACHO) return 'ventana de despacho de facturas';
    if (C() && tipo === C().TIPOS.LIQUIDACION) return 'ventana de liquidación de facturas';
    if (C() && tipo === C().TIPOS.NOTA_CREDITO) return 'ventana de nota de crédito';
    return 'ventana de atención';
  }

  function saludoNatural() {
    var h = C() ? C().hourInTZ() : new Date().getHours();
    if (h < 12) return 'Buenos días';
    if (h < 19) return 'Buenas tardes';
    return 'Buenas noches';
  }

  function primerNombre(entry) {
    var n = String(entry && entry.choferNombre || '').trim();
    if (!n) return '';
    return n.split(/\s+/)[0];
  }

  function buildSpeechText(entry) {
    if (!entry) return 'Ya es su turno. Por favor, pase a la ventana indicada.';
    var saludo = saludoNatural();
    var nombre = primerNombre(entry);
    var turno = entry.turno || 'su turno';
    var ventana = ventanaSpeechNatural(entry);
    var texto = saludo;
    if (nombre) texto += ', ' + nombre;
    texto += '. Ya le corresponde el turno ' + turno + '. ';
    texto += 'Por favor, diríjase a la ' + ventana + '. Gracias.';
    return texto;
  }

  function pickSpanishVoice() {
    if (!global.speechSynthesis) return null;
    var voices = speechSynthesis.getVoices();
    var es = voices.filter(function (v) { return /^es/i.test(v.lang); });
    if (!es.length) return null;
    function find(re) {
      return es.find(function (v) { return re.test(v.name); });
    }
    return find(/natural|neural|premium|online/i) ||
      find(/helena|sabina|paulina|elvira|monica|laura|sofia|maria/i) ||
      find(/google.*espa|google.*spanish/i) ||
      find(/microsoft.*spanish|microsoft.*espa/i) ||
      find(/españa|español|spanish/i) ||
      es.find(function (v) { return /-ES|-MX|-DO/i.test(v.lang); }) ||
      es[0];
  }

  function preloadVoices() {
    if (!global.speechSynthesis || voicesReady) return;
    if (speechSynthesis.getVoices().length) voicesReady = true;
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
      var ventana = ventanaSpeechNatural(entry);
      var n = new Notification('¡Ya es su turno! ' + (entry.turno || ''), {
        body: 'Diríjase a la ' + ventana + '.',
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
    preloadVoices();
    var u = new SpeechSynthesisUtterance(buildSpeechText(entry));
    u.lang = 'es-DO';
    u.rate = 0.9;
    u.pitch = 1;
    u.volume = 1;
    var voice = pickSpanishVoice();
    if (voice) u.voice = voice;
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
    if (global.speechSynthesis) {
      speechSynthesis.addEventListener('voiceschanged', preloadVoices, { once: true });
      preloadVoices();
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
