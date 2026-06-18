/**
 * Control de Turnos — instalación PWA y enlace directo (PC / móvil)
 */
(function (global) {
  'use strict';

  var DISMISS_KEY = 'dc_turnos_pwa_dismiss_until';
  var DISMISS_MS = 7 * 24 * 60 * 60 * 1000;
  var deferredPrompt = null;
  var copyTimer = null;
  var listenersBound = false;

  function $(id) { return document.getElementById(id); }

  function esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function isStandalone() {
    try {
      if (global.matchMedia && global.matchMedia('(display-mode: standalone)').matches) return true;
      if (global.matchMedia && global.matchMedia('(display-mode: fullscreen)').matches) return true;
    } catch (e) { /* noop */ }
    return !!global.navigator.standalone;
  }

  function isIOS() {
    if (/iPad|iPhone|iPod/i.test(navigator.userAgent)) return true;
    return navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
  }

  function isAndroid() {
    return /Android/i.test(navigator.userAgent);
  }

  function isMobileLayout() {
    try {
      return global.matchMedia('(max-width: 960px)').matches;
    } catch (e) {
      return false;
    }
  }

  function wasDismissedRecently() {
    try {
      var until = Number(localStorage.getItem(DISMISS_KEY)) || 0;
      return until > Date.now();
    } catch (e) {
      return false;
    }
  }

  function dismissBanner() {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now() + DISMISS_MS));
    } catch (e) { /* noop */ }
    hideBanner();
  }

  function getDirectLink() {
    try {
      return new URL('turnos.html', global.location.href).href.split('#')[0];
    } catch (e) {
      return global.location.href.split('#')[0];
    }
  }

  function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('sw-turnos.js', { scope: './' }).catch(function () { /* noop */ });
  }

  function canOfferInstall() {
    return !isStandalone() && !wasDismissedRecently();
  }

  function primaryActionLabel() {
    if (deferredPrompt) return 'Instalar app';
    if (isIOS()) return 'Agregar a inicio';
    if (isAndroid()) return 'Instalar acceso directo';
    return 'Cómo instalar';
  }

  function ensureBanner() {
    var chofer = $('turnosChoferRoot');
    if (chofer && !$('turnosPwaBanner')) {
      var banner = document.createElement('div');
      banner.id = 'turnosPwaBanner';
      banner.className = 'turnos-pwa-banner is-hidden';
      banner.setAttribute('role', 'region');
      banner.setAttribute('aria-label', 'Instalar aplicación');
      banner.innerHTML =
        '<div class="turnos-pwa-banner__inner">' +
        '<img class="turnos-pwa-banner__icon" src="assets/img/icon-turnos-portal.svg?v=12" alt="" width="40" height="40">' +
        '<div class="turnos-pwa-banner__text">' +
        '<strong id="turnosPwaBannerTitle">Acceso directo en su teléfono</strong>' +
        '<span id="turnosPwaBannerSub">Instálelo como app para abrir con un toque y recibir alertas.</span>' +
        '</div>' +
        '<div class="turnos-pwa-banner__actions">' +
        '<button type="button" class="turnos-btn turnos-btn--primary turnos-btn--sm" id="turnosPwaInstallBtn">Instalar app</button>' +
        '<button type="button" class="turnos-btn turnos-btn--secondary turnos-btn--sm" id="turnosPwaCopyBtn">Copiar enlace</button>' +
        '</div>' +
        '<button type="button" class="turnos-pwa-banner__close" id="turnosPwaDismissBtn" aria-label="Cerrar">&times;</button>' +
        '</div>';
      var main = $('turnosChoferMain');
      if (main && main.parentNode === chofer) {
        chofer.insertBefore(banner, main);
      } else {
        chofer.appendChild(banner);
      }
      banner.querySelector('#turnosPwaInstallBtn').addEventListener('click', promptInstall);
      banner.querySelector('#turnosPwaCopyBtn').addEventListener('click', copyDirectLink);
      banner.querySelector('#turnosPwaDismissBtn').addEventListener('click', dismissBanner);
    }

    var adminTop = document.querySelector('.turnos-topbar');
    if (adminTop && !$('turnosPwaAdminBtn')) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.id = 'turnosPwaAdminBtn';
      btn.className = 'turnos-pwa-admin-btn';
      btn.title = 'Instalar app / copiar enlace';
      btn.innerHTML =
        '<img src="assets/img/icon-turnos-portal.svg?v=12" alt="" width="22" height="22">' +
        '<span>App</span>';
      btn.addEventListener('click', openInstallModal);
      adminTop.appendChild(btn);
    }

    var foot = document.querySelector('.turnos-chofer-foot');
    if (foot && !$('turnosPwaFootBtn')) {
      var footBtn = document.createElement('button');
      footBtn.type = 'button';
      footBtn.id = 'turnosPwaFootBtn';
      footBtn.className = 'turnos-pwa-foot-btn';
      footBtn.textContent = 'Descargar acceso directo (app en el teléfono)';
      footBtn.addEventListener('click', openInstallModal);
      var adminLink = $('turnosAdminLink');
      if (adminLink && adminLink.parentNode === foot) {
        foot.insertBefore(footBtn, adminLink);
      } else {
        foot.insertBefore(footBtn, foot.firstChild);
      }
    }
  }

  function updateBanner() {
    var banner = $('turnosPwaBanner');
    var footBtn = $('turnosPwaFootBtn');
    var adminBtn = $('turnosPwaAdminBtn');
    var standalone = isStandalone();
    var show = canOfferInstall();

    if (banner) {
      if (!show || standalone) {
        banner.classList.add('is-hidden');
      } else {
        banner.classList.remove('is-hidden');
        var title = $('turnosPwaBannerTitle');
        var sub = $('turnosPwaBannerSub');
        var installBtn = $('turnosPwaInstallBtn');
        if (title) {
          title.textContent = isMobileLayout()
            ? 'Acceso directo en su teléfono'
            : 'Acceso directo — PC o celular';
        }
        if (sub) {
          sub.textContent = isIOS()
            ? 'En iPhone: Compartir → Agregar a pantalla de inicio. En Android: Instalar app.'
            : 'Instálelo como app para abrir con un toque y recibir alertas de turno.';
        }
        if (installBtn) installBtn.textContent = primaryActionLabel();
      }
    }

    if (footBtn) {
      footBtn.hidden = standalone;
      footBtn.textContent = standalone
        ? 'App instalada'
        : (isMobileLayout() ? 'Descargar app en el teléfono' : 'Instalar acceso directo / copiar enlace');
    }

    if (adminBtn) adminBtn.hidden = standalone;
  }

  function hideBanner() {
    var banner = $('turnosPwaBanner');
    if (banner) banner.classList.add('is-hidden');
  }

  function closeInstallModal() {
    var el = $('turnosPwaModal');
    if (el) el.remove();
    document.body.classList.remove('turnos-pwa-modal-open');
  }

  function iosStepsHtml() {
    return (
      '<ol class="turnos-pwa-steps">' +
      '<li>Abra este portal en <strong>Safari</strong> (no en Chrome ni en Facebook).</li>' +
      '<li>Toque el botón <strong>Compartir</strong> <span class="turnos-pwa-share-icon" aria-hidden="true">⎋</span> abajo en el centro.</li>' +
      '<li>Desplácese y elija <strong>Agregar a pantalla de inicio</strong>.</li>' +
      '<li>Confirme con <strong>Agregar</strong>. Verá el icono «Turnos DC» en su inicio.</li>' +
      '</ol>'
    );
  }

  function androidStepsHtml() {
    return (
      '<ol class="turnos-pwa-steps">' +
      '<li>Toque <strong>Instalar app</strong> arriba (Chrome mostrará el diálogo).</li>' +
      '<li>Si no aparece: menú <strong>⋮</strong> → <strong>Instalar aplicación</strong> o <strong>Agregar a pantalla de inicio</strong>.</li>' +
      '<li>Abra siempre desde el icono instalado para recibir alertas.</li>' +
      '</ol>'
    );
  }

  function desktopStepsHtml() {
    return (
      '<ol class="turnos-pwa-steps">' +
      '<li>En <strong>Chrome</strong> o <strong>Edge</strong>: busque el icono de instalación en la barra de direcciones (⊕ o monitor).</li>' +
      '<li>O use el botón <strong>Instalar app</strong> si está disponible abajo.</li>' +
      '<li>Guarde también el <strong>enlace directo</strong> para compartir con choferes.</li>' +
      '</ol>'
    );
  }

  function openInstallModal() {
    closeInstallModal();
    var link = getDirectLink();
    var steps = isIOS() ? iosStepsHtml() : (isAndroid() ? androidStepsHtml() : desktopStepsHtml());
    var overlay = document.createElement('div');
    overlay.id = 'turnosPwaModal';
    overlay.className = 'turnos-pwa-modal';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-labelledby', 'turnosPwaModalTitle');
    overlay.innerHTML =
      '<div class="turnos-pwa-modal__card">' +
      '<button type="button" class="turnos-pwa-modal__close" data-pwa-close aria-label="Cerrar">&times;</button>' +
      '<div class="turnos-pwa-modal__head">' +
      '<img src="assets/img/icon-turnos-portal.svg?v=12" alt="" width="56" height="56">' +
      '<div><p class="turnos-pwa-modal__eyebrow">Acceso directo</p>' +
      '<h2 id="turnosPwaModalTitle">Instalar Control de Turnos</h2></div></div>' +
      '<p class="turnos-pwa-modal__lead">Cree un icono en la pantalla de inicio, como una app. ' +
      'Funciona en <strong>iPhone</strong>, <strong>Android</strong> y <strong>PC</strong>.</p>' +
      steps +
      '<div class="turnos-pwa-link-box">' +
      '<label class="turnos-pwa-link-label">Enlace directo para choferes</label>' +
      '<div class="turnos-pwa-link-row">' +
      '<input class="turnos-input turnos-pwa-link-input" id="turnosPwaLinkField" type="text" readonly value="' + esc(link) + '">' +
      '<button type="button" class="turnos-btn turnos-btn--secondary turnos-btn--sm" id="turnosPwaModalCopyBtn">Copiar</button>' +
      '</div></div>' +
      '<div class="turnos-pwa-modal__actions">' +
      (deferredPrompt && !isIOS()
        ? '<button type="button" class="turnos-btn turnos-btn--primary turnos-btn--xl" id="turnosPwaModalInstallBtn">Instalar ahora</button>'
        : '') +
      '<button type="button" class="turnos-btn turnos-btn--secondary turnos-btn--xl" data-pwa-close>Cerrar</button>' +
      '</div></div>';
    document.body.appendChild(overlay);
    document.body.classList.add('turnos-pwa-modal-open');
    overlay.addEventListener('click', function (ev) {
      if (ev.target === overlay || ev.target.closest('[data-pwa-close]')) closeInstallModal();
    });
    var copyBtn = $('turnosPwaModalCopyBtn');
    if (copyBtn) copyBtn.addEventListener('click', copyDirectLink);
    var modalInstall = $('turnosPwaModalInstallBtn');
    if (modalInstall) modalInstall.addEventListener('click', promptInstall);
    var field = $('turnosPwaLinkField');
    if (field) {
      field.addEventListener('focus', function () {
        try { field.select(); } catch (e) { /* noop */ }
      });
    }
  }

  function flashCopyFeedback(btn) {
    if (!btn) return;
    var prev = btn.textContent;
    btn.textContent = '¡Copiado!';
    btn.disabled = true;
    if (copyTimer) clearTimeout(copyTimer);
    copyTimer = setTimeout(function () {
      btn.textContent = prev;
      btn.disabled = false;
    }, 2000);
  }

  function copyDirectLink(ev) {
    var link = getDirectLink();
    var btn = ev && ev.target ? ev.target.closest('button') : null;
    function ok() { flashCopyFeedback(btn); }
    function fail() {
      openInstallModal();
      var field = $('turnosPwaLinkField');
      if (field) {
        field.focus();
        try { field.select(); } catch (e) { /* noop */ }
      }
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(link).then(ok).catch(fail);
      return;
    }
    fail();
  }

  function promptInstall() {
    if (deferredPrompt && !isIOS()) {
      deferredPrompt.prompt();
      deferredPrompt.userChoice.then(function (choice) {
        if (choice.outcome === 'accepted') hideBanner();
        deferredPrompt = null;
        updateBanner();
        closeInstallModal();
      }).catch(function () {
        deferredPrompt = null;
        openInstallModal();
      });
      return;
    }
    openInstallModal();
  }

  function init() {
    if (!listenersBound) {
      listenersBound = true;
      global.addEventListener('beforeinstallprompt', function (e) {
        e.preventDefault();
        deferredPrompt = e;
        updateBanner();
      });
      global.addEventListener('appinstalled', function () {
        deferredPrompt = null;
        hideBanner();
        updateBanner();
      });
      try {
        global.matchMedia('(display-mode: standalone)').addEventListener('change', updateBanner);
      } catch (e) { /* noop */ }
      document.addEventListener('visibilitychange', updateBanner);
    }
    registerServiceWorker();
    ensureBanner();
    updateBanner();
  }

  global.PlatformTurnosPwa = {
    init: init,
    updateUi: updateBanner,
    promptInstall: promptInstall,
    copyDirectLink: copyDirectLink,
    getDirectLink: getDirectLink,
    isStandalone: isStandalone,
    openInstallModal: openInstallModal
  };
})(typeof window !== 'undefined' ? window : this);
