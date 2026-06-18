/**
 * Control de Turnos — permisos obligatorios del chofer (notificaciones + audio)
 */
(function (global) {
  'use strict';

  var audioUnlocked = false;
  var pollTimer = null;

  function notificationSupported() {
    return !!global.Notification;
  }

  function getNotificationState() {
    if (!notificationSupported()) return 'unsupported';
    return Notification.permission || 'default';
  }

  function unlockAudio() {
    return new Promise(function (resolve) {
      try {
        var AC = global.AudioContext || global.webkitAudioContext;
        if (!AC) {
          audioUnlocked = true;
          resolve(true);
          return;
        }
        var ctx = new AC();
        var start = ctx.state === 'suspended' ? ctx.resume() : Promise.resolve();
        start.then(function () {
          var osc = ctx.createOscillator();
          var g = ctx.createGain();
          g.gain.value = 0.001;
          osc.connect(g);
          g.connect(ctx.destination);
          osc.start();
          osc.stop(ctx.currentTime + 0.04);
          audioUnlocked = true;
          return ctx.close();
        }).then(function () {
          resolve(true);
        }).catch(function () {
          resolve(false);
        });
      } catch (e) {
        resolve(false);
      }
    });
  }

  function preloadSpeech() {
    try {
      if (!global.speechSynthesis) return;
      if (speechSynthesis.getVoices().length) return;
      speechSynthesis.addEventListener('voiceschanged', function () { /* preload */ }, { once: true });
    } catch (e) { /* noop */ }
  }

  function requestNotifications() {
    if (!notificationSupported()) return Promise.resolve(true);
    if (Notification.permission === 'granted') return Promise.resolve(true);
    if (Notification.permission === 'denied') return Promise.resolve(false);
    try {
      return Notification.requestPermission().then(function (p) { return p === 'granted'; });
    } catch (e) {
      return Promise.resolve(false);
    }
  }

  function getStatus() {
    var notif = getNotificationState();
    var notifOk = notif === 'granted' || notif === 'unsupported';
    return {
      notifications: notif,
      notificationsOk: notifOk,
      audioOk: audioUnlocked,
      ready: notifOk && audioUnlocked
    };
  }

  function isReady() {
    return getStatus().ready;
  }

  function requestAll() {
    return unlockAudio().then(function () {
      preloadSpeech();
      try {
        if (navigator.vibrate) navigator.vibrate(80);
      } catch (e) { /* noop */ }
      return requestNotifications();
    }).then(function (notifOk) {
      var st = getStatus();
      return st.ready || (st.notificationsOk && st.audioOk);
    });
  }

  function ensureGateDom() {
    var root = document.getElementById('turnosChoferRoot');
    if (!root) return null;
    var gate = document.getElementById('turnosPermGate');
    if (gate) return gate;
    gate = document.createElement('div');
    gate.id = 'turnosPermGate';
    gate.className = 'turnos-perm-gate';
    gate.setAttribute('role', 'dialog');
    gate.setAttribute('aria-modal', 'true');
    gate.setAttribute('aria-labelledby', 'turnosPermTitle');
    gate.innerHTML =
      '<div class="turnos-perm-card">' +
      '<p class="turnos-perm-eyebrow">Paso obligatorio</p>' +
      '<h2 id="turnosPermTitle">Active las alertas de su turno</h2>' +
      '<p class="turnos-perm-lead">Si no autoriza, <strong>no sonará</strong> cuando lo convoquen y usted no esté en esta página.</p>' +
      '<p class="turnos-perm-ios" id="turnosPermIos" hidden><strong>iPhone:</strong> después de autorizar, use <strong>Compartir → Agregar a pantalla de inicio</strong> y abra el portal desde ese icono. Así las notificaciones suenan aunque apague la pantalla.</p>' +
      '<ul class="turnos-perm-list">' +
      '<li id="turnosPermItemNotif" class="turnos-perm-item turnos-perm-item--pending"><span class="turnos-perm-icon">1</span><span>Notificaciones del celular</span></li>' +
      '<li id="turnosPermItemAudio" class="turnos-perm-item turnos-perm-item--pending"><span class="turnos-perm-icon">2</span><span>Sonido, voz y alarma</span></li>' +
      '</ul>' +
      '<button type="button" class="turnos-btn turnos-btn--primary turnos-btn--xl turnos-perm-btn" id="turnosPermBtn">Autorizar ahora</button>' +
      '<p class="turnos-perm-hint" id="turnosPermHint">Toque el botón y seleccione <strong>Permitir</strong> cuando el navegador lo pida.</p>' +
      '<p class="turnos-perm-denied" id="turnosPermDenied" hidden>Si los bloqueó antes: abra el menú del navegador → Configuración del sitio → Notificaciones → <strong>Permitir</strong>. Luego vuelva aquí y pulse Autorizar.</p>' +
      '</div>';
    root.appendChild(gate);
    gate.querySelector('#turnosPermBtn').addEventListener('click', function () {
      var btn = gate.querySelector('#turnosPermBtn');
      if (btn) {
        btn.disabled = true;
        btn.textContent = 'Autorizando…';
      }
      requestAll().finally(function () {
        if (btn) {
          btn.disabled = false;
          btn.textContent = 'Autorizar ahora';
        }
        refreshGate();
      });
    });
    return gate;
  }

  function setItemState(id, ok, label) {
    var el = document.getElementById(id);
    if (!el) return;
    el.classList.toggle('turnos-perm-item--ok', !!ok);
    el.classList.toggle('turnos-perm-item--pending', !ok);
    el.classList.toggle('turnos-perm-item--fail', ok === false);
    var span = el.querySelector('span:last-child');
    if (span && label) span.textContent = label;
  }

  function showGate() {
    var gate = ensureGateDom();
    if (!gate) return;
    gate.classList.remove('is-hidden');
    document.body.classList.add('turnos-perm-open');
  }

  function hideGate() {
    var gate = document.getElementById('turnosPermGate');
    if (gate) gate.classList.add('is-hidden');
    document.body.classList.remove('turnos-perm-open');
  }

  function isIOSDevice() {
    if (/iPad|iPhone|iPod/i.test(navigator.userAgent)) return true;
    return navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
  }

  function refreshGate() {
    var st = getStatus();
    var Call = global.PlatformTurnosChoferCall;
    if (Call && Call.isActive && Call.isActive()) {
      hideGate();
      return st;
    }
    setItemState('turnosPermItemNotif', st.notificationsOk,
      st.notifications === 'granted' ? 'Notificaciones — activadas' :
      st.notifications === 'denied' ? 'Notificaciones — bloqueadas' :
      st.notifications === 'unsupported' ? 'Notificaciones — no disponibles en este navegador' :
      'Notificaciones — pendiente');
    setItemState('turnosPermItemAudio', st.audioOk,
      st.audioOk ? 'Sonido, voz y alarma — listos' : 'Sonido, voz y alarma — pendiente');
    var denied = document.getElementById('turnosPermDenied');
    if (denied) denied.hidden = st.notifications !== 'denied';
    var iosHint = document.getElementById('turnosPermIos');
    if (iosHint) iosHint.hidden = !isIOSDevice();
    if (st.ready) {
      hideGate();
    } else {
      showGate();
    }
    return st;
  }

  function requireBeforeAction() {
    refreshGate();
    return isReady();
  }

  function startPolling() {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(refreshGate, 2500);
    document.addEventListener('visibilitychange', refreshGate);
    global.addEventListener('focus', refreshGate);
  }

  function init() {
    ensureGateDom();
    refreshGate();
    startPolling();
  }

  global.PlatformTurnosChoferPerms = {
    init: init,
    isReady: isReady,
    getStatus: getStatus,
    requestAll: requestAll,
    refreshGate: refreshGate,
    requireBeforeAction: requireBeforeAction
  };
})(typeof window !== 'undefined' ? window : this);
