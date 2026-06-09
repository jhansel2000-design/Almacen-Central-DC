/**
 * Aplicación standalone — Portal Despacho (login y sesión propios)
 */
(function (global) {
  'use strict';

  var PC = global.PanelCore;
  var Auth = global.PlatformDespachoAuth;

  function bootError(msg) {
    var box = document.createElement('p');
    box.className = 'noscript-msg';
    box.textContent = msg;
    document.body.appendChild(box);
  }

  if (!PC || !Auth) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () {
        bootError('Error al cargar el portal de despacho. Usa http://localhost:8080/despacho.html (no abras el archivo directo).');
      });
    } else {
      bootError('Error al cargar el portal de despacho. Usa http://localhost:8080/despacho.html (no abras el archivo directo).');
    }
    return;
  }

  var $ = PC.$;

  var state = {
    user: null,
    screen: 'registro',
    _sessionTouchBound: false
  };

  function toast(msg, type) {
    if (!global.PlatformToast || !msg) return;
    if (type === 'err') global.PlatformToast.error(msg);
    else if (type === 'ok') global.PlatformToast.success(msg);
    else if (type === 'warn') global.PlatformToast.warning(msg);
    else global.PlatformToast.info(msg);
  }

  function showAuthError(msg) {
    var el = $('despAuthError');
    if (!el) return;
    el.textContent = msg || '';
    el.hidden = !msg;
  }

  function setAuthVisible(visible) {
    var overlay = $('despAuthOverlay');
    var app = $('despApp');
    if (overlay) {
      overlay.classList.toggle('is-hidden', !visible);
      overlay.setAttribute('aria-hidden', visible ? 'false' : 'true');
    }
    if (app) {
      app.classList.toggle('is-hidden', visible);
      if (visible) {
        app.setAttribute('aria-hidden', 'true');
        app.setAttribute('inert', '');
      } else {
        app.removeAttribute('aria-hidden');
        app.removeAttribute('inert');
      }
    }
    document.body.classList.toggle('auth-locked', visible);
    document.body.classList.toggle('despacho-dash-view', !visible);
  }

  function showDespAuthRoleFeedback(card) {
    var picker = card && card.closest('.auth-role-picker');
    if (picker) {
      picker.classList.remove('role-area-pulse');
      void picker.offsetWidth;
      picker.classList.add('role-area-pulse');
    }
  }

  function getSelectedAuthArea() {
    var checked = document.querySelector('input[name="despAuthArea"]:checked');
    return checked ? String(checked.value || '').trim() : 'preparador';
  }

  function syncRolePickerFromInput() {
    var checked = document.querySelector('input[name="despAuthArea"]:checked');
    if (!checked) return;
    var label = document.querySelector('label.desp-auth-role-card[for="' + checked.id + '"]');
    if (label) applyRolePicker(label);
  }

  function applyRolePicker(card) {
    if (!card) return;
    var role = card.getAttribute('data-role') || '';
    var radio = card.getAttribute('for') ? document.getElementById(card.getAttribute('for')) : null;
    if (radio && !radio.checked) radio.checked = true;

    document.querySelectorAll('.desp-auth-role-card').forEach(function (btn) {
      var active = btn === card;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-pressed', active ? 'true' : 'false');
      btn.classList.toggle('role-select-in', active);
      if (!active) btn.classList.remove('role-select-in');
    });
    var form = $('despAuthForm');
    if (form) form.setAttribute('data-selected-area', role);
    showDespAuthRoleFeedback(card);
  }

  function setLoginLoading(loading) {
    var btn = $('despAuthSubmit');
    if (!btn) return;
    btn.classList.toggle('is-loading', loading);
    btn.disabled = loading;
  }

  function initPasswordToggle() {
    var btn = $('despBtnTogglePassword');
    var input = $('despAuthPassword');
    if (!btn || !input || btn.dataset.bound) return;
    btn.dataset.bound = '1';
    btn.addEventListener('click', function () {
      var show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      btn.textContent = show ? 'Ocultar' : 'Ver';
      btn.setAttribute('aria-label', show ? 'Ocultar contraseña' : 'Mostrar contraseña');
    });
  }

  function doLogin() {
    var username = PC.sanitizeUsername($('despAuthUsername') && $('despAuthUsername').value);
    var password = String(($('despAuthPassword') && $('despAuthPassword').value) || '').trim();

    showAuthError('');
    var allowed = PC.checkDespachoLoginAllowed();
    if (!allowed.ok) {
      showAuthError(allowed.message);
      return;
    }
    if (!username) {
      showAuthError('Escribe el usuario.');
      $('despAuthUsername') && $('despAuthUsername').focus();
      return;
    }
    if (!password) {
      showAuthError('Escribe la contraseña.');
      $('despAuthPassword') && $('despAuthPassword').focus();
      return;
    }
    if (password.length > PC.PASSWORD_MAX) {
      showAuthError('Contraseña demasiado larga.');
      return;
    }

    setLoginLoading(true);
    try {
      var hash = PC.sha256Sync(password);
      var user = Auth.authenticate(username, hash);
      setLoginLoading(false);
      if (!user) {
        PC.recordDespachoLoginFailure();
        showAuthError('Usuario o contraseña incorrectos.');
        return;
      }
      var area = getSelectedAuthArea();
      if (area === 'validador' && !Auth.canValidate(user.role)) {
        showAuthError('Tu usuario no tiene acceso como Validador. Elige Preparador.');
        return;
      }
      PC.clearDespachoLoginAttempts();
      PC.persistRememberedLoginUsername(
        'despacho',
        username,
        !!($('despAuthRememberUser') && $('despAuthRememberUser').checked)
      );
      PC.saveDespachoSession(user);
      enterApp(user);
      toast('Bienvenido al portal de despacho, ' + (user.name || user.username) + '.', 'ok');
    } catch (err) {
      setLoginLoading(false);
      showAuthError('No se pudo validar la sesión. Intenta de nuevo.');
    }
  }

  function initAuth() {
    var form = $('despAuthForm');
    if (!form) return;

    document.querySelectorAll('input[name="despAuthArea"]').forEach(function (radio) {
      radio.addEventListener('change', syncRolePickerFromInput);
    });

    document.querySelectorAll('.desp-auth-role-card').forEach(function (label) {
      label.addEventListener('click', function () {
        var id = label.getAttribute('for');
        var radio = id ? document.getElementById(id) : null;
        if (radio && !radio.checked) {
          radio.checked = true;
          applyRolePicker(label);
        }
      });
    });

    PC.bindOnce(form, 'submit', function (ev) {
      ev.preventDefault();
      doLogin();
    });

    syncRolePickerFromInput();
    initPasswordToggle();
    PC.applyRememberedLoginUsername('despacho', $('despAuthUsername'), $('despAuthRememberUser'));
  }

  function tryRestoreSession() {
    var session = PC.getDespachoSession();
    if (!session) return false;
    var user = Auth.getUserById(session.userId);
    if (!user) {
      PC.clearDespachoSession();
      return false;
    }
    enterApp(user);
    return true;
  }

  function bindSessionTouch() {
    if (state._sessionTouchBound || !state.user) return;
    state._sessionTouchBound = true;
    ['click', 'keydown', 'touchstart'].forEach(function (ev) {
      document.addEventListener(ev, function () {
        if (state.user) PC.touchDespachoSession(state.user);
      }, { passive: true });
    });
  }

  function updateRoleBadge() {
    if (!state.user) return;
    var userEl = $('despUserName');
    if (userEl) {
      userEl.textContent = Auth.getDisplayName
        ? Auth.getDisplayName(state.user)
        : (state.user.name || state.user.username);
    }
    var badge = $('despRoleBadge');
    if (!badge) return;
    badge.textContent = Auth.getRoleLabel
      ? Auth.getRoleLabel(state.user)
      : (Auth.ROLE_LABELS[state.user.role] || state.user.role);
    badge.className = 'role-badge desp-role-' + state.user.role;
  }

  function renderDespacho() {
    var host = $('despModule');
    if (!host || !global.PlatformDespachoUI) return;
    var canValidate = Auth.canValidate(state.user.role);

    global.PlatformDespachoUI.render(host, global.PlatformDespachoStore.load(), {
      user: state.user,
      canValidate: canValidate,
      screen: state.screen,
      onScreenChange: function (s) {
        state.screen = s;
      }
    });

    var data = global.PlatformDespachoStore.load();
    if ($('despSyncLabel')) {
      $('despSyncLabel').textContent = data && data.updatedAt
        ? PC.formatDateTime(new Date(data.updatedAt))
        : '—';
    }
  }

  function enterApp(user) {
    state.user = user;
    setAuthVisible(false);
    updateRoleBadge();
    renderDespacho();
    bindSessionTouch();
    if (PC.initGestures) PC.initGestures($('despApp'));
  }

  function logout() {
    if (global.PlatformDespachoUI) global.PlatformDespachoUI.destroy();
    PC.clearDespachoSession();
    state.user = null;
    state._sessionTouchBound = false;
    setAuthVisible(true);
    var pwd = $('despAuthPassword');
    if (pwd) pwd.value = '';
    showAuthError('');
  }

  function initTheme() {
    var stored = null;
    try {
      stored = localStorage.getItem('almacen_platform_config');
      if (stored) {
        var cfg = JSON.parse(stored);
        if (cfg.theme) document.documentElement.setAttribute('data-theme', cfg.theme);
      }
    } catch (e) { /* ignore */ }

    var btn = $('despBtnTheme');
    if (!btn || btn.dataset.bound) return;
    btn.dataset.bound = '1';
    btn.addEventListener('click', function () {
      var cur = document.documentElement.getAttribute('data-theme') || 'dark';
      var next = cur === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      try {
        var raw = localStorage.getItem('almacen_platform_config');
        var config = raw ? JSON.parse(raw) : {};
        config.theme = next;
        localStorage.setItem('almacen_platform_config', JSON.stringify(config));
      } catch (e) { /* ignore */ }
    });
  }

  function init() {
    var start = function () {
      initTheme();
      initAuth();
      PC.bindOnce($('despBtnLogout'), 'click', logout);
      PC.bindOnce($('despBtnRefresh'), 'click', renderDespacho);

      document.addEventListener('despacho-updated', function () {
        if (state.user) {
          if (global.PlatformDespachoPresent) global.PlatformDespachoPresent.refresh();
          if (global.PlatformDespachoPresentLista) global.PlatformDespachoPresentLista.refresh();
          renderDespacho();
        }
      });

      document.addEventListener('despacho-live-share', function () {
        if (state.user && global.PlatformDespachoPresent) {
          global.PlatformDespachoPresent.refresh();
        }
      });

      document.addEventListener('despacho-live-lista', function () {
        if (state.user && global.PlatformDespachoPresentLista) {
          global.PlatformDespachoPresentLista.refresh();
        }
      });

      if (global.PlatformDespachoPresent) global.PlatformDespachoPresent.bind();
      if (global.PlatformDespachoPresentLista) global.PlatformDespachoPresentLista.bind();

      document.addEventListener('lan-sync', function (ev) {
        if (!state.user) return;
        if (!ev.detail || ev.detail.store === 'despacho') renderDespacho();
      });

      if (!tryRestoreSession()) {
        setAuthVisible(true);
      }
    };

    if (global.PlatformWebUsers && global.PlatformWebUsers.ready) {
      global.PlatformWebUsers.ready().then(start).catch(start);
    } else {
      start();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(typeof window !== 'undefined' ? window : this);
