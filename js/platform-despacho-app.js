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
    view: 'preparador',
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

  function applyRolePicker(card) {
    document.querySelectorAll('.desp-auth-role-card').forEach(function (btn) {
      var active = btn === card;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
    if (card) {
      var form = $('despAuthForm');
      if (form) form.setAttribute('data-selected-area', card.getAttribute('data-role') || '');
    }
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
    var password = ($('despAuthPassword') && $('despAuthPassword').value) || '';

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
    PC.sha256(password).then(function (hash) {
      var user = Auth.authenticate(username, hash);
      setLoginLoading(false);
      if (!user) {
        PC.recordDespachoLoginFailure();
        showAuthError('Usuario o contraseña incorrectos.');
        return;
      }
      PC.clearDespachoLoginAttempts();
      PC.saveDespachoSession(user);
      enterApp(user);
      toast('Bienvenido al portal de despacho, ' + (user.name || user.username) + '.', 'ok');
    }).catch(function () {
      setLoginLoading(false);
      showAuthError('No se pudo validar la sesión. Intenta de nuevo.');
    });
  }

  function initAuth() {
    var form = $('despAuthForm');
    if (!form) return;

    PC.bindOnce(form, 'click', function (ev) {
      var card = ev.target.closest('.desp-auth-role-card');
      if (!card) return;
      ev.preventDefault();
      applyRolePicker(card);
    });

    PC.bindOnce(form, 'submit', function (ev) {
      ev.preventDefault();
      doLogin();
    });

    var activeCard = document.querySelector('.desp-auth-role-card.active');
    if (activeCard) applyRolePicker(activeCard);
    initPasswordToggle();
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
    var view = state.view;
    if (!canValidate) view = 'preparador';
    if (view === 'validador' && !canValidate) view = 'preparador';
    if (view === 'combinado' && !canValidate) view = 'preparador';

    global.PlatformDespachoUI.render(host, global.PlatformDespachoStore.load(), {
      view: view,
      user: state.user,
      canValidate: canValidate,
      internalNav: true,
      onViewChange: function (v) {
        state.view = v;
        renderDespacho();
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
    state.view = Auth.canValidate(user.role) ? 'combinado' : 'preparador';
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
    initTheme();
    initAuth();
    PC.bindOnce($('despBtnLogout'), 'click', logout);
    PC.bindOnce($('despBtnRefresh'), 'click', renderDespacho);

    document.addEventListener('despacho-updated', function () {
      if (state.user) renderDespacho();
    });

    document.addEventListener('lan-sync', function (ev) {
      if (!state.user) return;
      if (!ev.detail || ev.detail.store === 'despacho') renderDespacho();
    });

    if (!tryRestoreSession()) {
      setAuthVisible(true);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(typeof window !== 'undefined' ? window : this);
