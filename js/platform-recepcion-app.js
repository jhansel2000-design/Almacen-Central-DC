/**
 * Aplicación — Control Patio · Recepción de contenedores
 */
(function (global) {
  'use strict';

  var PC = global.PanelCore;
  var Auth = global.PlatformRecepcionAuth;
  var SESSION_KEY = 'panel_recepcion_session';

  var state = {
    user: null,
    unbindSync: null
  };

  function $(id) { return document.getElementById(id); }

  function toast(msg, type) {
    if (!global.PlatformToast || !msg) return;
    if (type === 'err') global.PlatformToast.error(msg);
    else if (type === 'ok') global.PlatformToast.success(msg);
    else global.PlatformToast.info(msg);
  }

  function saveSession(user) {
    try {
      localStorage.setItem(SESSION_KEY, JSON.stringify({ user: user, at: Date.now() }));
    } catch (e) { /* noop */ }
  }

  function clearSession() {
    try { localStorage.removeItem(SESSION_KEY); } catch (e) { /* noop */ }
  }

  function getSessionRaw() {
    try {
      var raw = localStorage.getItem(SESSION_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  function setAuthVisible(visible) {
    var overlay = $('recAuthOverlay');
    var app = $('recApp');
    if (overlay) {
      overlay.classList.toggle('is-hidden', !visible);
      overlay.setAttribute('aria-hidden', visible ? 'false' : 'true');
    }
    if (app) {
      app.classList.toggle('is-hidden', visible);
      if (visible) app.setAttribute('aria-hidden', 'true');
      else app.removeAttribute('aria-hidden');
    }
    document.body.classList.toggle('auth-locked', visible);
    document.body.classList.toggle('rec-dash-view', !visible);
  }

  function renderApp() {
    var root = $('recApp');
    var store = global.PlatformRecepcionStore;
    var ui = global.PlatformRecepcionUI;
    if (!root || !store || !ui || !state.user) return;
    var data = store.load();
    root.innerHTML = ui.renderApp(state.user, data);
    ui.bindApp(root, state.user, {
      onRegister: handleRegister,
      onValidar: handleValidar,
      onEntrada: handleEntrada,
      onEliminar: handleEliminar,
      onToggleShare: handleToggleShare,
      onLogout: logout
    });
  }

  function handleRegister(payload, form) {
    var store = global.PlatformRecepcionStore;
    var res = store.registrarContenedor(payload, Auth.getDisplayName(state.user));
    if (!res.ok) {
      toast(res.error, 'err');
      return;
    }
    toast('Contenedor ' + res.item.contenedor + ' registrado.', 'ok');
    if (form) form.reset();
    var fecha = $('recFecha');
    if (fecha && global.PlatformRecepcionStore) {
      try {
        fecha.value = new Intl.DateTimeFormat('en-CA', {
          timeZone: 'America/Santo_Domingo',
          year: 'numeric', month: '2-digit', day: '2-digit'
        }).format(new Date());
      } catch (e) { /* noop */ }
    }
    renderApp();
  }

  function handleValidar(id) {
    var res = global.PlatformRecepcionStore.marcarValidado(id, Auth.getDisplayName(state.user));
    if (!res.ok) { toast(res.error, 'err'); return; }
    if (!res.unchanged) toast('Contenedor validado.', 'ok');
    renderApp();
  }

  function handleEntrada(id, currentMuelle) {
    var muelle = window.prompt('Muelle de entrada:', currentMuelle || '');
    if (muelle == null) return;
    var res = global.PlatformRecepcionStore.marcarEntrada(id, muelle, Auth.getDisplayName(state.user));
    if (!res.ok) { toast(res.error, 'err'); return; }
    if (!res.unchanged) toast('Entrada registrada en muelle ' + res.item.muelle + '.', 'ok');
    renderApp();
  }

  function handleEliminar(id) {
    if (!window.confirm('¿Quitar este contenedor del seguimiento?')) return;
    var res = global.PlatformRecepcionStore.eliminarContenedor(id, Auth.getDisplayName(state.user));
    if (!res.ok) { toast(res.error, 'err'); return; }
    toast('Contenedor retirado del seguimiento.', 'ok');
    renderApp();
  }

  function handleToggleShare() {
    var store = global.PlatformRecepcionStore;
    var active = store.isLiveShareBoardActive(store.load());
    store.toggleLiveShareBoard(Auth.getDisplayName(state.user));
    toast(active ? 'Pantalla TV detenida.' : 'Compartiendo seguimiento en pantalla TV.', active ? 'info' : 'ok');
    renderApp();
  }

  function enterApp(user) {
    state.user = user;
    setAuthVisible(false);
    if (state.unbindSync) state.unbindSync();
    state.unbindSync = global.PlatformRecepcionStore.bindSync(function () {
      renderApp();
    });
    renderApp();
  }

  function logout() {
    clearSession();
    state.user = null;
    if (state.unbindSync) {
      state.unbindSync();
      state.unbindSync = null;
    }
    setAuthVisible(true);
  }

  function doLogin() {
    var username = PC.sanitizeUsername($('recAuthUsername') && $('recAuthUsername').value);
    var password = String(($('recAuthPassword') && $('recAuthPassword').value) || '').trim();
    var errEl = $('recAuthError');
    if (errEl) { errEl.hidden = true; errEl.textContent = ''; }
    if (!username || !password) {
      if (errEl) { errEl.textContent = 'Usuario y contraseña requeridos.'; errEl.hidden = false; }
      return;
    }
    var Sec = global.PlatformSecurity;
    var verify = Sec && Sec.verifyBeforeLogin
      ? Sec.verifyBeforeLogin({ portal: 'recepcion', form: $('recAuthForm') })
      : Promise.resolve({ ok: true });
    verify.then(function (human) {
      if (!human.ok) {
        if (errEl) { errEl.textContent = human.error || 'Verificación requerida.'; errEl.hidden = false; }
        return;
      }
      var refresh = global.PlatformWebUsers && global.PlatformWebUsers.refresh
        ? global.PlatformWebUsers.refresh()
        : Promise.resolve();
      return refresh.then(function () {
        var user = Auth.authenticate(username, PC.sha256Sync(password));
        if (!user) {
          if (errEl) {
            var wmsUser = global.PlatformAdmin && global.PlatformAdmin.authenticate
              ? global.PlatformAdmin.authenticate(username, PC.sha256Sync(password))
              : null;
            errEl.textContent = wmsUser
              ? 'Su usuario no tiene permiso para Gestión de Recepción y Ubicación. Contacte al administrador.'
              : 'Usuario o contraseña incorrectos.';
            errEl.hidden = false;
          }
          return;
        }
        PC.persistRememberedLoginUsername('recepcion', username, !!($('recAuthRememberUser') && $('recAuthRememberUser').checked));
        saveSession(user);
        enterApp(user);
        toast('Bienvenido, ' + Auth.getDisplayName(user), 'ok');
      });
    }).catch(function (err) {
      if (errEl) {
        errEl.textContent = (err && err.message) || 'No se pudo iniciar sesión. Recargue la página.';
        errEl.hidden = false;
      }
    });
  }

  function tryRestoreSession() {
    var raw = getSessionRaw();
    if (!raw || !raw.user) return;
    if (Date.now() - (raw.at || 0) > 12 * 60 * 60 * 1000) {
      clearSession();
      return;
    }
    var user = Auth.getUserById(raw.user.id) ||
      Auth.normalizeStoredUser(raw.user);
    if (!user) {
      clearSession();
      return;
    }
    enterApp(user);
  }

  function bindAuthUi() {
    var form = $('recAuthForm');
    if (form) form.addEventListener('submit', function (ev) { ev.preventDefault(); doLogin(); });
    var toggle = $('recBtnTogglePassword');
    var pwd = $('recAuthPassword');
    if (toggle && pwd) {
      toggle.addEventListener('click', function () {
        var show = pwd.type === 'password';
        pwd.type = show ? 'text' : 'password';
        toggle.textContent = show ? 'Ocultar' : 'Ver';
      });
    }
    if (PC && PC.restoreRememberedLoginUsername) {
      PC.restoreRememberedLoginUsername('recepcion', $('recAuthUsername'));
    }
    if (global.PlatformSecurity && global.PlatformSecurity.mountLoginForm) {
      global.PlatformSecurity.mountLoginForm(form, 'recepcion');
    }
  }

  function init() {
    if (!PC || !Auth) return;
    bindAuthUi();
    var ready = global.PlatformWebUsers && global.PlatformWebUsers.ready
      ? global.PlatformWebUsers.ready()
      : Promise.resolve();
    ready.then(function () {
      tryRestoreSession();
      if (!state.user) setAuthVisible(true);
    }).catch(function () {
      setAuthVisible(true);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(typeof window !== 'undefined' ? window : this);
