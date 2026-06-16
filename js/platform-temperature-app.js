/**
 * Portal Monitoreo de Temperatura — auth WMS
 */
(function (global) {
  'use strict';

  var PC = global.PanelCore;
  var Auth = global.PlatformAdmin;

  function bootError(msg) {
    var box = document.createElement('p');
    box.className = 'noscript-msg';
    box.textContent = msg;
    document.body.appendChild(box);
  }

  if (!PC || !Auth) {
    document.addEventListener('DOMContentLoaded', function () {
      bootError('Error al cargar el portal de temperatura. Usa http://localhost:8080/temperatura.html');
    });
    return;
  }

  function $(id) {
    return document.getElementById(id);
  }

  function toast(msg, type) {
    if (!global.PlatformToast || !msg) return;
    if (type === 'err') global.PlatformToast.error(msg);
    else if (type === 'ok') global.PlatformToast.success(msg);
    else global.PlatformToast.info(msg);
  }

  function showAuthError(msg) {
    var el = $('tempAuthError');
    if (!el) return;
    el.textContent = msg || '';
    el.hidden = !msg;
  }

  function setAuthVisible(visible) {
    var overlay = $('tempAuthOverlay');
    var app = $('tempApp');
    if (overlay) {
      overlay.classList.toggle('is-hidden', !visible);
      overlay.setAttribute('aria-hidden', visible ? 'false' : 'true');
    }
    if (app) {
      app.classList.toggle('is-hidden', visible);
      app.setAttribute('aria-hidden', visible ? 'true' : 'false');
      if (visible) app.setAttribute('inert', '');
      else app.removeAttribute('inert');
    }
    document.body.classList.toggle('auth-locked', visible);
    document.body.classList.toggle('temp-dash-view', !visible);
  }

  function enterApp(user) {
    setAuthVisible(false);
    if (global.PlatformTemperatureUI && global.PlatformTemperatureUI.start) {
      global.PlatformTemperatureUI.start(user);
    }
  }

  function doLogin() {
    var username = PC.sanitizeUsername($('tempAuthUsername') && $('tempAuthUsername').value);
    var password = String(($('tempAuthPassword') && $('tempAuthPassword').value) || '').trim();

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

    var btn = $('tempAuthSubmit');
    if (btn) btn.disabled = true;

    var Sec = global.PlatformSecurity;
    var verifyHuman = Sec && Sec.verifyBeforeLogin
      ? Sec.verifyBeforeLogin({ portal: 'temperatura', form: $('tempAuthForm') })
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
        PC.persistRememberedLoginUsername(
          'temperatura',
          username,
          !!($('tempAuthRememberUser') && $('tempAuthRememberUser').checked)
        );
        PC.saveAveriasSession(user);
        enterApp(user);
        toast('Bienvenido, ' + (Auth.getDisplayName ? Auth.getDisplayName(user) : user.name) + '.', 'ok');
      } catch (err) {
        if (btn) btn.disabled = false;
        showAuthError('No se pudo validar la sesión.');
      }
    });
  }

  function tryRestoreSession() {
    var session = PC.getAveriasSession();
    if (!session) return false;
    var user = Auth.findUserById(session.userId);
    if (!user) {
      PC.clearAveriasSession();
      return false;
    }
    enterApp(user);
    return true;
  }

  function initAuth() {
    var form = $('tempAuthForm');
    if (!form) return;
    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      doLogin();
    });
    PC.applyRememberedLoginUsername('temperatura', $('tempAuthUsername'), $('tempAuthRememberUser'));
    if (global.PlatformSecurity && global.PlatformSecurity.mountLoginForm) {
      global.PlatformSecurity.mountLoginForm(form, 'temperatura');
    }
    var toggle = $('tempBtnTogglePassword');
    var pwd = $('tempAuthPassword');
    if (toggle && pwd) {
      toggle.addEventListener('click', function () {
        var show = pwd.type === 'password';
        pwd.type = show ? 'text' : 'password';
        toggle.textContent = show ? 'Ocultar' : 'Ver';
      });
    }
  }

  function initDrawer() {
    global.toggleDrawer = function () {
      var drawer = $('tempDrawer');
      var overlay = $('tempDrawerOverlay');
      if (drawer) drawer.classList.toggle('open');
      if (overlay) overlay.classList.toggle('open');
    };
    global.closeDrawer = function () {
      var drawer = $('tempDrawer');
      var overlay = $('tempDrawerOverlay');
      if (drawer) drawer.classList.remove('open');
      if (overlay) overlay.classList.remove('open');
    };
  }

  document.addEventListener('DOMContentLoaded', function () {
    initDrawer();
    initAuth();
    if (!tryRestoreSession()) setAuthVisible(true);
  });
})(typeof window !== 'undefined' ? window : this);
