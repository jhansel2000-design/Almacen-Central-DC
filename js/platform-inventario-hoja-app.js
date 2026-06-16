/**
 * Portal Hoja de inventario (escritorio web · 3 hojas Excel)
 */
(function (global) {
  'use strict';

  var SYNC = global.PlatformInventarioSync;
  var CONC = global.PlatformInventarioConciliacion;
  var HOJA = global.PlatformInventarioHoja;

  function $(id) { return document.getElementById(id); }

  function toast(msg, type) {
    if (global.PlatformToast && msg) {
      if (type === 'err') global.PlatformToast.error(msg);
      else if (type === 'ok') global.PlatformToast.success(msg);
      else global.PlatformToast.info(msg);
      return;
    }
    var t = $('ixhToast');
    if (!t) return;
    t.textContent = msg || '';
    t.classList.add('show');
    global.setTimeout(function () { t.classList.remove('show'); }, 2600);
  }

  function esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function setAuthVisible(visible) {
    var overlay = $('ixhAuthOverlay');
    var app = $('ixhApp');
    if (overlay) overlay.hidden = !visible;
    if (app) {
      app.hidden = visible;
      app.classList.toggle('is-hidden', visible);
    }
    document.body.classList.toggle('ix-auth-locked', visible);
  }

  function enterApp() {
    setAuthVisible(false);
    if (HOJA) HOJA.show();
  }

  function doLogin() {
    var code = ($('ixhAdmUser') || {}).value || 'admin';
    var pin = ($('ixhAdmPin') || {}).value || '';
    SYNC.verifyLogin('admin', code, pin).then(function (user) {
      if (!user || user.role !== 'ADMIN') {
        toast('Usuario o PIN incorrecto', 'err');
        return;
      }
      try { global.sessionStorage.setItem('ixhUser', JSON.stringify(user)); } catch (e) { /* noop */ }
      enterApp();
      toast('Bienvenido, ' + user.displayName, 'ok');
    }).catch(function () {
      toast('Error al validar acceso', 'err');
    });
  }

  function logout() {
    try { global.sessionStorage.removeItem('ixhUser'); } catch (e) { /* noop */ }
    if (HOJA) HOJA.hide();
    setAuthVisible(true);
  }

  function tryRestoreSession() {
    try {
      if (!global.sessionStorage.getItem('ixhUser')) return;
      enterApp();
    } catch (e) { /* noop */ }
  }

  function bindEvents() {
    $('ixhBtnEnter') && $('ixhBtnEnter').addEventListener('click', doLogin);
    ['ixhAdmUser', 'ixhAdmPin'].forEach(function (id) {
      var el = $(id);
      if (!el) return;
      el.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); doLogin(); }
      });
    });
    document.querySelectorAll('.ixh-btn-logout').forEach(function (btn) {
      btn.addEventListener('click', logout);
    });
  }

  function boot() {
    if (document.documentElement.classList.contains('ix-mobile-block')) {
      var block = $('ixhMobileBlock');
      if (block) block.hidden = false;
      return;
    }
    if (!SYNC || !CONC || !HOJA) {
      document.body.innerHTML += '<p class="noscript-msg">Error al cargar la hoja de inventario.</p>';
      return;
    }
    HOJA.init({ CONC: CONC, SYNC: SYNC, toast: toast, esc: esc });
    bindEvents();
    SYNC.onChange(function (kind) {
      if (kind === 'sync' || kind === 'entry' || kind === 'clear') {
        if ($('ixhAuthOverlay') && !$('ixhAuthOverlay').hidden) return;
        HOJA.refresh();
      }
    });
    SYNC.init().then(function () {
      tryRestoreSession();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(typeof window !== 'undefined' ? window : this);
