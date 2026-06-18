/**
 * Portal Control de Turnos — arranque chofer + admin
 */
(function (global) {
  'use strict';

  var PC = global.PanelCore;
  var Auth = global.PlatformAdmin;
  var ADMIN_VIEW_KEY = 'dc_turnos_admin_view';

  function markAdminView(active) {
    try {
      if (active) sessionStorage.setItem(ADMIN_VIEW_KEY, '1');
      else sessionStorage.removeItem(ADMIN_VIEW_KEY);
    } catch (e) { /* noop */ }
  }

  function wantsAdminView() {
    try {
      return sessionStorage.getItem(ADMIN_VIEW_KEY) === '1';
    } catch (e) {
      return false;
    }
  }

  function $(id) { return document.getElementById(id); }

  function refreshPwaUi() {
    if (global.PlatformTurnosPwa && global.PlatformTurnosPwa.updateUi) {
      global.PlatformTurnosPwa.updateUi();
    }
  }

  function showChofer() {
    markAdminView(false);
    if (global.PlatformTurnosPwa && global.PlatformTurnosPwa.setRole) {
      global.PlatformTurnosPwa.setRole('chofer');
    }
    if (global.PlatformTurnosChofer) {
      global.PlatformTurnosChofer.show();
      global.PlatformTurnosChofer.start();
    }
    if (global.PlatformTurnosAdmin) global.PlatformTurnosAdmin.hide();
    hideAuth();
    document.body.classList.remove('turnos-admin-mode');
    refreshPwaUi();
  }

  function showAdminApp(user) {
    markAdminView(true);
    if (global.PlatformTurnosPwa && global.PlatformTurnosPwa.setRole) {
      global.PlatformTurnosPwa.setRole('supervisor');
    }
    if (global.PlatformTurnosChofer) global.PlatformTurnosChofer.hide();
    hideAuth();
    if (global.PlatformTurnosAdmin) {
      global.PlatformTurnosAdmin.show();
      global.PlatformTurnosAdmin.start(user);
    }
    if (PC && PC.touchAveriasSession) PC.touchAveriasSession(user);
    document.body.classList.add('turnos-admin-mode');
    refreshPwaUi();
  }

  function showAuth() {
    if (global.PlatformTurnosPwa && global.PlatformTurnosPwa.setRole) {
      global.PlatformTurnosPwa.setRole('supervisor');
    }
    var overlay = $('turnosAuthOverlay');
    if (overlay) {
      overlay.classList.remove('is-hidden');
      overlay.setAttribute('aria-hidden', 'false');
    }
    document.body.classList.add('turnos-auth-open');
  }

  function hideAuth() {
    var overlay = $('turnosAuthOverlay');
    if (overlay) {
      overlay.classList.add('is-hidden');
      overlay.setAttribute('aria-hidden', 'true');
    }
    document.body.classList.remove('turnos-auth-open');
  }

  function showAuthError(msg) {
    var el = $('turnosAuthError');
    if (!el) return;
    el.textContent = msg || '';
    el.hidden = !msg;
  }

  function doLogin() {
    if (!PC || !Auth) {
      showAuthError('No se pudo cargar el sistema de usuarios.');
      return;
    }
    var username = PC.sanitizeUsername($('turnosAuthUsername') && $('turnosAuthUsername').value);
    var password = String(($('turnosAuthPassword') && $('turnosAuthPassword').value) || '').trim();
    showAuthError('');

    var allowed = PC.checkAveriasLoginAllowed();
    if (!allowed.ok) {
      showAuthError(allowed.message);
      return;
    }
    if (!username || !password) {
      showAuthError('Completa usuario y contraseña.');
      return;
    }

    var btn = $('turnosAuthSubmit');
    if (btn) btn.disabled = true;

    var Sec = global.PlatformSecurity;
    var verifyHuman = Sec && Sec.verifyBeforeLogin
      ? Sec.verifyBeforeLogin({ portal: 'turnos', form: $('turnosAuthForm') })
      : Promise.resolve({ ok: true });

    verifyHuman.then(function (human) {
      if (!human.ok) {
        if (btn) btn.disabled = false;
        showAuthError(human.error || 'Completa la verificación humana.');
        return;
      }
      try {
        var hash = PC.sha256Sync(password);
        var user = Auth.authenticate(username, hash);
        if (btn) btn.disabled = false;
        if (!user) {
          PC.recordAveriasLoginFailure();
          showAuthError('Usuario o contraseña incorrectos.');
          return;
        }
        PC.clearAveriasLoginAttempts();
        PC.persistRememberedLoginUsername('turnos', username, !!($('turnosAuthRememberUser') && $('turnosAuthRememberUser').checked));
        PC.saveAveriasSession(user);
        showAdminApp(user);
      } catch (err) {
        if (btn) btn.disabled = false;
        showAuthError('No se pudo validar la sesión.');
      }
    });
  }

  function tryRestoreAdmin() {
    if (!PC || !Auth) return false;
    var session = PC.getAveriasSession();
    if (!session) return false;
    var user = Auth.findUserById(session.userId);
    if (!user) {
      PC.clearAveriasSession();
      return false;
    }
    showAdminApp(user);
    return true;
  }

  function logoutAdmin() {
    if (PC) PC.clearAveriasSession();
    showChofer();
  }

  function initAuth() {
    var form = $('turnosAuthForm');
    if (!form) return;
    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      doLogin();
    });
    if (PC) PC.applyRememberedLoginUsername('turnos', $('turnosAuthUsername'), $('turnosAuthRememberUser'));
    if (global.PlatformSecurity && global.PlatformSecurity.mountLoginForm) {
      global.PlatformSecurity.mountLoginForm(form, 'turnos');
    }
    var toggle = $('turnosBtnTogglePassword');
    var pwd = $('turnosAuthPassword');
    if (toggle && pwd) {
      toggle.addEventListener('click', function () {
        var show = pwd.type === 'password';
        pwd.type = show ? 'text' : 'password';
        toggle.textContent = show ? 'Ocultar' : 'Ver';
      });
    }
    var adminLink = $('turnosAdminLink');
    if (adminLink) {
      adminLink.addEventListener('click', function (ev) {
        ev.preventDefault();
        if (tryRestoreAdmin()) return;
        showAuth();
      });
    }
    var backChofer = $('turnosBackChoferLink');
    if (backChofer) {
      backChofer.addEventListener('click', function (ev) {
        ev.preventDefault();
        logoutAdmin();
      });
    }
    var overlay = $('turnosAuthOverlay');
    if (overlay) {
      overlay.addEventListener('click', function (ev) {
        if (ev.target.closest('[data-chofer-back]')) {
          ev.preventDefault();
          hideAuth();
        }
      });
    }
  }

  function boot() {
    initAuth();
    var params = new URLSearchParams(global.location.search);
    if (global.PlatformTurnosPwa && global.PlatformTurnosPwa.setRole) {
      if (params.get('admin') === '1' || wantsAdminView()) {
        global.PlatformTurnosPwa.setRole('supervisor');
      } else {
        global.PlatformTurnosPwa.setRole('chofer');
      }
    }
    if (wantsAdminView() && tryRestoreAdmin()) return;
    if (params.get('admin') === '1') {
      if (tryRestoreAdmin()) return;
      showAuth();
      return;
    }
    showChofer();
  }

  document.addEventListener('DOMContentLoaded', function () {
    var start = boot;
    if (global.PlatformTurnosPwa && global.PlatformTurnosPwa.init) {
      global.PlatformTurnosPwa.init();
    }
    if (global.PlatformWebUsers && global.PlatformWebUsers.ready) {
      global.PlatformWebUsers.ready().then(start).catch(start);
    } else {
      start();
    }
  });

  global.PlatformTurnosApp = {
    showChofer: showChofer,
    showAdminApp: showAdminApp,
    showAuth: showAuth,
    logoutAdmin: logoutAdmin
  };
})(typeof window !== 'undefined' ? window : this);
