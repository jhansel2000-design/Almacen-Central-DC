/**
 * Seguridad de acceso — verificación humana, honeypot, anti-bots en login
 */
(function (global) {
  'use strict';

  var turnstileSiteKey = '';
  var turnstileToken = null;
  var turnstileWidgetId = null;
  var configPromise = null;
  var minFormMs = 1200;
  /** Respaldo si falla la carga de site-config.json (GitHub Pages / caché). */
  var DEFAULT_TURNSTILE_SITE_KEY = '0x4AAAAAADhftTLJSQ0WxVnuiLp9UNRpOMc';

  function configUrl() {
    try {
      var p = global.location.pathname || '/';
      if (p.indexOf('/Almacen-Central-DC') === 0) {
        return '/Almacen-Central-DC/data/site-config.json';
      }
    } catch (e) { /* noop */ }
    return 'data/site-config.json';
  }

  function applySecurityConfig(cfg) {
    cfg = cfg || {};
    var sec = cfg.security || {};
    turnstileSiteKey = String(sec.turnstileSiteKey || DEFAULT_TURNSTILE_SITE_KEY || '').trim();
    if (sec.humanVerifyMinMs != null) {
      minFormMs = Math.max(800, parseInt(sec.humanVerifyMinMs, 10) || minFormMs);
    }
    return cfg;
  }

  function isLanOrigin() {
    try {
      var h = (global.location && global.location.hostname) || '';
      if (h === 'localhost' || h === '127.0.0.1') return true;
      return /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(h);
    } catch (e) {
      return false;
    }
  }

  function shouldVerifyOnServer() {
    return isLanOrigin() && !isPublicWeb();
  }

  function sha256(text) {
    if (global.PanelCore && global.PanelCore.sha256Sync) {
      return global.PanelCore.sha256Sync(text);
    }
    return String(text);
  }

  function isPublicWeb() {
    try {
      var h = (global.location && global.location.hostname) || '';
      return h.indexOf('github.io') >= 0 || h.indexOf('pages.dev') >= 0;
    } catch (e) {
      return false;
    }
  }

  function loadConfig() {
    if (configPromise) return configPromise;
    configPromise = fetch(configUrl() + '?v=' + Date.now(), { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : {}; })
      .catch(function () { return {}; })
      .then(function (cfg) {
        return applySecurityConfig(cfg);
      });
    return configPromise;
  }

  function ensureHoneypot(form) {
    if (!form || form.querySelector('.dc-auth-hp')) return;
    var hp = document.createElement('input');
    hp.type = 'text';
    hp.name = 'dc_hp_field';
    hp.className = 'dc-auth-hp';
    hp.tabIndex = -1;
    hp.autocomplete = 'off';
    hp.setAttribute('aria-hidden', 'true');
    hp.setAttribute('data-lpignore', 'true');
    form.appendChild(hp);
  }

  function ensureVerifyBox(form) {
    if (!form) return null;
    var box = form.querySelector('.auth-human-verify');
    if (!box) {
      box = document.createElement('div');
      box.className = 'auth-human-verify';
      box.setAttribute('aria-live', 'polite');
      var submit = form.querySelector('button[type="submit"]');
      if (submit && submit.parentNode) {
        submit.parentNode.insertBefore(box, submit);
      } else {
        form.appendChild(box);
      }
    }
    return box;
  }

  function checkHoneypot(form) {
    var hp = form && form.querySelector('.dc-auth-hp');
    if (hp && String(hp.value || '').trim()) {
      return { ok: false, error: 'No se pudo verificar el acceso.' };
    }
    return { ok: true };
  }

  function checkTiming(form) {
    if (!form) return { ok: true };
    var ts = parseInt(form.getAttribute('data-dc-form-ts') || '0', 10);
    if (!ts) return { ok: true };
    if (Date.now() - ts < minFormMs) {
      return { ok: false, error: 'Espera un momento antes de entrar.' };
    }
    return { ok: true };
  }

  function mathChallengeKey(portal) {
    return 'dc_human_math_' + (portal || 'default');
  }

  function setupMathChallenge(box, portal) {
    var a = 2 + Math.floor(Math.random() * 8);
    var b = 2 + Math.floor(Math.random() * 8);
    var answer = a + b;
    try {
      if (global.sessionStorage) {
        global.sessionStorage.setItem(mathChallengeKey(portal), sha256(String(answer)));
      }
    } catch (e) { /* noop */ }
    box.innerHTML =
      '<div class="auth-human-math">' +
      '<label class="auth-human-math-label" for="authHumanAnswer_' + portal + '">' +
      'Verificación humana: ¿cuánto es <strong>' + a + ' + ' + b + '</strong>?</label>' +
      '<input type="number" class="auth-human-answer auth-field-input" id="authHumanAnswer_' + portal + '" ' +
      'inputmode="numeric" autocomplete="off" required aria-required="true" placeholder="Resultado">' +
      '</div>';
  }

  function verifyMathChallenge(form, portal) {
    if (turnstileSiteKey) return { ok: true };
    var input = form && form.querySelector('.auth-human-answer');
    if (!input) return { ok: false, error: 'Completa la verificación humana.' };
    var raw = String(input.value || '').trim();
    if (!raw) return { ok: false, error: 'Responde la verificación humana.' };
    var expected = null;
    try {
      expected = global.sessionStorage && global.sessionStorage.getItem(mathChallengeKey(portal));
    } catch (e) { /* noop */ }
    if (!expected) return { ok: false, error: 'Recarga la página e intenta de nuevo.' };
    if (sha256(raw) !== expected) {
      return { ok: false, error: 'Respuesta incorrecta en la verificación humana.' };
    }
    return { ok: true };
  }

  function loadTurnstileScript() {
    return new Promise(function (resolve, reject) {
      if (global.turnstile) {
        resolve();
        return;
      }
      var existing = document.querySelector('script[data-dc-turnstile]');
      if (existing) {
        existing.addEventListener('load', function () { resolve(); });
        existing.addEventListener('error', reject);
        return;
      }
      var s = document.createElement('script');
      s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      s.async = true;
      s.defer = true;
      s.setAttribute('data-dc-turnstile', '1');
      s.onload = function () { resolve(); };
      s.onerror = function () { reject(new Error('Turnstile no disponible')); };
      document.head.appendChild(s);
    });
  }

  function setupTurnstile(box) {
    turnstileToken = null;
    box.innerHTML = '<div class="auth-turnstile-mount" id="dcTurnstileMount"></div>' +
      '<p class="auth-human-hint">Verificación anti-bots · Cloudflare Turnstile</p>';
    return loadTurnstileScript().then(function () {
      var mount = box.querySelector('#dcTurnstileMount');
      if (!mount || !global.turnstile) throw new Error('Turnstile no cargó');
      if (turnstileWidgetId != null) {
        try { global.turnstile.remove(turnstileWidgetId); } catch (e) { /* noop */ }
        turnstileWidgetId = null;
      }
      turnstileWidgetId = global.turnstile.render(mount, {
        sitekey: turnstileSiteKey,
        theme: document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark',
        callback: function (token) { turnstileToken = token; },
        'expired-callback': function () { turnstileToken = null; },
        'error-callback': function () { turnstileToken = null; }
      });
    }).catch(function () {
      setupMathChallenge(box, 'fallback');
    });
  }

  function verifyTurnstileClient() {
    if (!turnstileSiteKey) return { ok: true };
    if (turnstileToken) return { ok: true };
    return { ok: false, error: 'Completa la verificación anti-bots.' };
  }

  function verifyOnServer(token) {
    if (!token || !shouldVerifyOnServer()) return Promise.resolve({ ok: true });
    var url = '/api/verify-human';
    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: token })
    }).then(function (r) { return r.json(); })
      .then(function (data) {
        if (data && data.ok) return { ok: true };
        return { ok: false, error: (data && data.error) || 'Verificación humana rechazada.' };
      })
      .catch(function () {
        return { ok: true };
      });
  }

  function mountLoginForm(form, portal) {
    if (!form) return loadConfig();
    ensureHoneypot(form);
    form.setAttribute('data-dc-form-ts', String(Date.now()));
    form.setAttribute('data-dc-portal', portal || 'default');
    var box = ensureVerifyBox(form);
    return loadConfig().then(function () {
      if (!box) return;
      if (turnstileSiteKey) return setupTurnstile(box);
      setupMathChallenge(box, portal || 'default');
    });
  }

  function resetHumanVerify(form) {
    turnstileToken = null;
    var portal = (form && form.getAttribute('data-dc-portal')) || 'default';
    var box = form && form.querySelector('.auth-human-verify');
    if (!box) return;
    if (turnstileSiteKey && global.turnstile && turnstileWidgetId != null) {
      try { global.turnstile.reset(turnstileWidgetId); } catch (e) { /* noop */ }
      return;
    }
    setupMathChallenge(box, portal);
  }

  function verifyBeforeLogin(opts) {
    opts = opts || {};
    var form = opts.form;
    var portal = opts.portal || 'default';

    var hp = checkHoneypot(form);
    if (!hp.ok) return Promise.resolve(hp);
    var tm = checkTiming(form);
    if (!tm.ok) return Promise.resolve(tm);

    return loadConfig().then(function () {
      var math = verifyMathChallenge(form, portal);
      if (!math.ok) return math;
      var ts = verifyTurnstileClient();
      if (!ts.ok) return ts;
      return verifyOnServer(turnstileToken).then(function (server) {
        if (!server.ok) return server;
        return { ok: true };
      });
    });
  }

  global.PlatformSecurity = {
    mountLoginForm: mountLoginForm,
    verifyBeforeLogin: verifyBeforeLogin,
    resetHumanVerify: resetHumanVerify,
    isPublicWeb: isPublicWeb,
    loadConfig: loadConfig
  };
})(typeof window !== 'undefined' ? window : this);
