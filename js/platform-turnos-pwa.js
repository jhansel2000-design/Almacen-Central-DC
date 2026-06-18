/**
 * Control de Turnos — PWA chofer + supervisor (PC / móvil)
 */
(function (global) {
  'use strict';

  var DISMISS_CHOFER = 'dc_turnos_pwa_chofer_dismiss_until';
  var DISMISS_SUPERVISOR = 'dc_turnos_pwa_supervisor_dismiss_until';
  var DISMISS_MS = 7 * 24 * 60 * 60 * 1000;
  var ICON_V = '?v=13';
  var deferredPrompt = null;
  var copyTimer = null;
  var listenersBound = false;
  var activeRole = 'chofer';

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

  function isAdminContext() {
    if (document.documentElement.getAttribute('data-turnos-portal') === 'supervisor') return true;
    if (document.body.classList.contains('turnos-admin-mode')) return true;
    if (document.body.classList.contains('turnos-auth-open')) return true;
    return false;
  }

  function getRole() {
    if (document.documentElement.getAttribute('data-turnos-portal') === 'supervisor') return 'supervisor';
    if (document.documentElement.getAttribute('data-turnos-portal') === 'chofer') return 'chofer';
    return activeRole === 'supervisor' ? 'supervisor' : 'chofer';
  }

  function setRole(role) {
    activeRole = role === 'supervisor' ? 'supervisor' : 'chofer';
    applyManifest();
    updateBanner();
  }

  function dismissKeyForRole(role) {
    return role === 'supervisor' ? DISMISS_SUPERVISOR : DISMISS_CHOFER;
  }

  function wasDismissedRecently(role) {
    role = role || getRole();
    try {
      var until = Number(localStorage.getItem(dismissKeyForRole(role))) || 0;
      return until > Date.now();
    } catch (e) {
      return false;
    }
  }

  function dismissBanner() {
    var role = getRole();
    try {
      localStorage.setItem(dismissKeyForRole(role), String(Date.now() + DISMISS_MS));
    } catch (e) { /* noop */ }
    hideBannerForRole(role);
  }

  function getDirectLink(role) {
    role = role || getRole();
    try {
      var file = role === 'supervisor' ? 'turnos-supervisor.html' : 'turnos.html';
      return new URL(file, global.location.href).href.split('#')[0];
    } catch (e) {
      return global.location.href.split('#')[0];
    }
  }

  function applyManifest() {
    var link = document.querySelector('link[rel="manifest"]');
    if (!link) return;
    link.href = getRole() === 'supervisor' ? 'turnos-supervisor.webmanifest' : 'turnos.webmanifest';
    var title = document.querySelector('meta[name="apple-mobile-web-app-title"]');
    if (title) {
      title.content = getRole() === 'supervisor' ? 'Turnos Supervisor' : 'Turnos DC';
    }
  }

  function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('sw-turnos.js', { scope: './' }).catch(function () { /* noop */ });
  }

  function canOfferInstall(role) {
    role = role || getRole();
    if (isStandalone() || wasDismissedRecently(role)) return false;
    if (role === 'supervisor') return true;
    if (isIOS() && !isStandalone()) return true;
    var Perms = global.PlatformTurnosChoferPerms;
    if (Perms && Perms.isReady && !Perms.isReady()) return false;
    return true;
  }

  function roleIcon(role) {
    return role === 'supervisor'
      ? 'assets/img/icon-turnos-validacion.svg' + ICON_V
      : 'assets/img/icon-turnos-portal.svg' + ICON_V;
  }

  function primaryActionLabel() {
    if (deferredPrompt) return 'Instalar app';
    if (isIOS()) return 'Agregar a inicio';
    if (isAndroid()) return 'Instalar acceso directo';
    return 'Cómo instalar';
  }

  function copyForRole(role) {
    if (role === 'supervisor') {
      return {
        bannerTitle: isMobileLayout() ? 'App supervisor en su teléfono' : 'App supervisor — PC o celular',
        bannerSub: isIOS()
          ? 'En iPhone: Compartir → Agregar a pantalla de inicio. Abre directo al panel de validación.'
          : 'Instálela para validar turnos al instante y recibir avisos de nuevas solicitudes.',
        footLabel: isMobileLayout() ? 'Instalar app supervisor' : 'Instalar app supervisor / copiar enlace',
        modalTitle: 'Instalar app — Supervisor',
        modalLead: 'Icono «Turnos Supervisor» en su pantalla de inicio. Al abrir entra al <strong>panel administrativo</strong> para validar turnos.',
        linkLabel: 'Enlace directo para supervisores',
        appShortName: 'Turnos Supervisor'
      };
    }
    return {
      bannerTitle: isMobileLayout() ? 'Acceso directo en su teléfono' : 'Acceso directo — PC o celular',
      bannerSub: isIOS()
        ? 'En iPhone: Compartir → Agregar a pantalla de inicio. En Android: Instalar app.'
        : 'Instálelo como app para abrir con un toque y recibir alertas de turno.',
      footLabel: isMobileLayout() ? 'Descargar app en el teléfono' : 'Instalar acceso directo / copiar enlace',
      modalTitle: 'Instalar Control de Turnos — Chofer',
      modalLead: 'Cree un icono «Turnos DC» en la pantalla de inicio. Funciona en <strong>iPhone</strong>, <strong>Android</strong> y <strong>PC</strong>.',
      linkLabel: 'Enlace directo para choferes',
      appShortName: 'Turnos DC'
    };
  }

  function bindBannerEvents(banner, role) {
    var installBtn = banner.querySelector('[data-pwa-install]');
    var copyBtn = banner.querySelector('[data-pwa-copy]');
    var dismissBtn = banner.querySelector('[data-pwa-dismiss]');
    if (installBtn) {
      installBtn.addEventListener('click', function () {
        activeRole = role;
        applyManifest();
        promptInstall();
      });
    }
    if (copyBtn) {
      copyBtn.addEventListener('click', function (ev) {
        activeRole = role;
        copyDirectLink(ev, role);
      });
    }
    if (dismissBtn) {
      dismissBtn.addEventListener('click', function () {
        activeRole = role;
        dismissBanner();
      });
    }
  }

  function ensureChoferBanner() {
    var chofer = $('turnosChoferRoot');
    if (!chofer || $('turnosPwaBannerChofer')) return;
    var banner = document.createElement('div');
    banner.id = 'turnosPwaBannerChofer';
    banner.className = 'turnos-pwa-banner turnos-pwa-banner--chofer is-hidden';
    banner.setAttribute('role', 'region');
    banner.setAttribute('aria-label', 'Instalar app chofer');
    banner.innerHTML =
      '<div class="turnos-pwa-banner__inner">' +
      '<img class="turnos-pwa-banner__icon" src="' + roleIcon('chofer') + '" alt="" width="40" height="40">' +
      '<div class="turnos-pwa-banner__text">' +
      '<strong data-pwa-title>Acceso directo en su teléfono</strong>' +
      '<span data-pwa-sub>Instálelo como app para recibir alertas.</span></div>' +
      '<div class="turnos-pwa-banner__actions">' +
      '<button type="button" class="turnos-btn turnos-btn--primary turnos-btn--sm" data-pwa-install>Instalar app</button>' +
      '<button type="button" class="turnos-btn turnos-btn--secondary turnos-btn--sm" data-pwa-copy>Copiar enlace</button>' +
      '</div>' +
      '<button type="button" class="turnos-pwa-banner__close" data-pwa-dismiss aria-label="Cerrar">&times;</button></div>';
    var main = $('turnosChoferMain');
    if (main && main.parentNode === chofer) chofer.insertBefore(banner, main);
    else chofer.appendChild(banner);
    bindBannerEvents(banner, 'chofer');

    var foot = document.querySelector('.turnos-chofer-foot');
    if (foot && !$('turnosPwaFootBtnChofer')) {
      var footBtn = document.createElement('button');
      footBtn.type = 'button';
      footBtn.id = 'turnosPwaFootBtnChofer';
      footBtn.className = 'turnos-pwa-foot-btn';
      footBtn.textContent = 'Descargar acceso directo (app en el teléfono)';
      footBtn.addEventListener('click', function () {
        setRole('chofer');
        openInstallModal('chofer');
      });
      foot.insertBefore(footBtn, foot.firstChild);
    }
  }

  function ensureSupervisorBanner() {
    if (document.documentElement.getAttribute('data-turnos-portal') !== 'supervisor') return;
    var main = document.querySelector('.turnos-main');
    if (!main || $('turnosPwaBannerSupervisor')) return;
    var banner = document.createElement('div');
    banner.id = 'turnosPwaBannerSupervisor';
    banner.className = 'turnos-pwa-banner turnos-pwa-banner--supervisor is-hidden';
    banner.setAttribute('role', 'region');
    banner.setAttribute('aria-label', 'Instalar app supervisor');
    banner.innerHTML =
      '<div class="turnos-pwa-banner__inner">' +
      '<img class="turnos-pwa-banner__icon" src="' + roleIcon('supervisor') + '" alt="" width="40" height="40">' +
      '<div class="turnos-pwa-banner__text">' +
      '<strong data-pwa-title>App supervisor en su teléfono</strong>' +
      '<span data-pwa-sub>Instálela para validar turnos y recibir avisos.</span></div>' +
      '<div class="turnos-pwa-banner__actions">' +
      '<button type="button" class="turnos-btn turnos-btn--primary turnos-btn--sm" data-pwa-install>Instalar app</button>' +
      '<button type="button" class="turnos-btn turnos-btn--secondary turnos-btn--sm" data-pwa-copy>Copiar enlace</button>' +
      '</div>' +
      '<button type="button" class="turnos-pwa-banner__close" data-pwa-dismiss aria-label="Cerrar">&times;</button></div>';
    main.insertBefore(banner, main.firstChild);
    bindBannerEvents(banner, 'supervisor');

    var sidebarFoot = document.querySelector('.turnos-sidebar-foot');
    if (sidebarFoot && !$('turnosPwaSidebarBtn')) {
      var sideBtn = document.createElement('button');
      sideBtn.type = 'button';
      sideBtn.id = 'turnosPwaSidebarBtn';
      sideBtn.className = 'turnos-pwa-sidebar-btn';
      sideBtn.innerHTML =
        '<img src="' + roleIcon('supervisor') + '" alt="" width="22" height="22">' +
        '<span>Instalar app supervisor</span>';
      sideBtn.addEventListener('click', function () {
        setRole('supervisor');
        openInstallModal('supervisor');
      });
      sidebarFoot.insertBefore(sideBtn, sidebarFoot.firstChild);
    }

    var authCard = document.querySelector('.turnos-auth-card');
    if (authCard && !$('turnosPwaAuthBtn')) {
      var authBtn = document.createElement('button');
      authBtn.type = 'button';
      authBtn.id = 'turnosPwaAuthBtn';
      authBtn.className = 'turnos-pwa-auth-btn';
      authBtn.textContent = 'Instalar app supervisor en el teléfono';
      authBtn.addEventListener('click', function () {
        setRole('supervisor');
        openInstallModal('supervisor');
      });
      var authForm = $('turnosAuthForm');
      if (authForm && authForm.parentNode === authCard) {
        authCard.insertBefore(authBtn, authForm.nextSibling);
      } else {
        authCard.appendChild(authBtn);
      }
    }

    var adminTop = document.querySelector('.turnos-topbar');
    if (adminTop && !$('turnosPwaAdminBtn')) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.id = 'turnosPwaAdminBtn';
      btn.className = 'turnos-pwa-admin-btn';
      btn.title = 'Instalar app supervisor';
      btn.innerHTML =
        '<img src="' + roleIcon('supervisor') + '" alt="" width="22" height="22">' +
        '<span>App supervisor</span>';
      btn.addEventListener('click', function () {
        setRole('supervisor');
        openInstallModal('supervisor');
      });
      adminTop.appendChild(btn);
    }
  }

  function ensureBanner() {
    ensureChoferBanner();
    ensureSupervisorBanner();
  }

  function updateRoleBanner(bannerId, footId, role) {
    var banner = $(bannerId);
    var copy = copyForRole(role);
    var show = canOfferInstall(role) && !isStandalone();
    if (banner) {
      banner.classList.toggle('is-hidden', !show);
      if (show) {
        var title = banner.querySelector('[data-pwa-title]');
        var sub = banner.querySelector('[data-pwa-sub]');
        var installBtn = banner.querySelector('[data-pwa-install]');
        if (title) title.textContent = copy.bannerTitle;
        if (sub) sub.textContent = copy.bannerSub;
        if (installBtn) installBtn.textContent = primaryActionLabel();
      }
    }
    var footBtn = footId ? $(footId) : null;
    if (footBtn) {
      footBtn.hidden = isStandalone();
      footBtn.textContent = isStandalone() ? 'App instalada' : copy.footLabel;
    }
  }

  function hideBannerForRole(role) {
    if (role === 'supervisor') {
      var b = $('turnosPwaBannerSupervisor');
      if (b) b.classList.add('is-hidden');
    } else {
      var c = $('turnosPwaBannerChofer');
      if (c) c.classList.add('is-hidden');
    }
  }

  function updateBanner() {
    applyManifest();
    var inAdmin = isAdminContext();
    updateRoleBanner('turnosPwaBannerChofer', 'turnosPwaFootBtnChofer', 'chofer');
    var choferBanner = $('turnosPwaBannerChofer');
    var choferFoot = $('turnosPwaFootBtnChofer');
    if (choferBanner && inAdmin) choferBanner.classList.add('is-hidden');
    if (choferFoot && inAdmin) choferFoot.hidden = true;

    if (inAdmin) {
      updateRoleBanner('turnosPwaBannerSupervisor', null, 'supervisor');
    } else {
      hideBannerForRole('supervisor');
    }

    var adminBtn = $('turnosPwaAdminBtn');
    var sideBtn = $('turnosPwaSidebarBtn');
    var authBtn = $('turnosPwaAuthBtn');
    var standalone = isStandalone();
    if (adminBtn) adminBtn.hidden = standalone || !inAdmin;
    if (sideBtn) sideBtn.hidden = standalone || !document.body.classList.contains('turnos-admin-mode');
    if (authBtn) authBtn.hidden = standalone || !document.body.classList.contains('turnos-auth-open');
  }

  function closeInstallModal() {
    var el = $('turnosPwaModal');
    if (el) el.remove();
    document.body.classList.remove('turnos-pwa-modal-open');
  }

  function iosStepsHtml(role) {
    var extra = role === 'supervisor'
      ? '<li>Al abrir el icono verá el <strong>login administrativo</strong> y podrá ir a <strong>Validar turnos</strong>.</li>'
      : '<li>Al abrir verá el portal para <strong>solicitar su turno</strong> como chofer.</li>';
    return (
      '<ol class="turnos-pwa-steps">' +
      '<li>Abra este enlace en <strong>Safari</strong> (iPhone) o <strong>Chrome</strong> (Android).</li>' +
      '<li>Toque <strong>Compartir</strong> <span class="turnos-pwa-share-icon" aria-hidden="true">⎋</span> → <strong>Agregar a pantalla de inicio</strong>.</li>' +
      '<li>Confirme con <strong>Agregar</strong>.</li>' +
      extra +
      '</ol>'
    );
  }

  function androidStepsHtml(role) {
    var extra = role === 'supervisor'
      ? '<li>Abra desde el icono instalado → inicie sesión → <strong>Validar turnos</strong>.</li>'
      : '<li>Abra desde el icono para solicitar turno y recibir alertas.</li>';
    return (
      '<ol class="turnos-pwa-steps">' +
      '<li>Toque <strong>Instalar app</strong> (Chrome mostrará el diálogo).</li>' +
      '<li>Si no aparece: menú <strong>⋮</strong> → <strong>Instalar aplicación</strong>.</li>' +
      extra +
      '</ol>'
    );
  }

  function desktopStepsHtml(role) {
    var extra = role === 'supervisor'
      ? '<li>Al abrir la app irá al <strong>acceso administrativo</strong> para validar solicitudes.</li>'
      : '<li>Comparta el enlace de choferes con quien solicite turno.</li>';
    return (
      '<ol class="turnos-pwa-steps">' +
      '<li>En <strong>Chrome</strong> o <strong>Edge</strong>: icono de instalación en la barra de direcciones.</li>' +
      '<li>O use <strong>Instalar app</strong> abajo.</li>' +
      extra +
      '</ol>'
    );
  }

  function openInstallModal(role) {
    role = role || getRole();
    activeRole = role;
    applyManifest();
    closeInstallModal();
    var link = getDirectLink(role);
    var copy = copyForRole(role);
    var steps = isIOS() ? iosStepsHtml(role) : (isAndroid() ? androidStepsHtml(role) : desktopStepsHtml(role));
    var overlay = document.createElement('div');
    overlay.id = 'turnosPwaModal';
    overlay.className = 'turnos-pwa-modal';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-labelledby', 'turnosPwaModalTitle');
    overlay.innerHTML =
      '<div class="turnos-pwa-modal__card">' +
      '<button type="button" class="turnos-pwa-modal__close" data-pwa-close aria-label="Cerrar">&times;</button>' +
      '<div class="turnos-pwa-modal__head">' +
      '<img src="' + roleIcon(role) + '" alt="" width="56" height="56">' +
      '<div><p class="turnos-pwa-modal__eyebrow">Acceso directo · ' + esc(copy.appShortName) + '</p>' +
      '<h2 id="turnosPwaModalTitle">' + esc(copy.modalTitle) + '</h2></div></div>' +
      '<p class="turnos-pwa-modal__lead">' + copy.modalLead + '</p>' +
      steps +
      '<div class="turnos-pwa-link-box">' +
      '<label class="turnos-pwa-link-label">' + esc(copy.linkLabel) + '</label>' +
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
    if (copyBtn) {
      copyBtn.addEventListener('click', function (ev) {
        copyDirectLink(ev, role);
      });
    }
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

  function copyDirectLink(ev, role) {
    role = role || getRole();
    var link = getDirectLink(role);
    var btn = ev && ev.target ? ev.target.closest('button') : null;
    function ok() { flashCopyFeedback(btn); }
    function fail() {
      openInstallModal(role);
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
    applyManifest();
    if (deferredPrompt && !isIOS()) {
      deferredPrompt.prompt();
      deferredPrompt.userChoice.then(function (choice) {
        if (choice.outcome === 'accepted') hideBannerForRole(getRole());
        deferredPrompt = null;
        updateBanner();
        closeInstallModal();
      }).catch(function () {
        deferredPrompt = null;
        openInstallModal(getRole());
      });
      return;
    }
    openInstallModal(getRole());
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
        hideBannerForRole('chofer');
        hideBannerForRole('supervisor');
        updateBanner();
      });
      try {
        global.matchMedia('(display-mode: standalone)').addEventListener('change', updateBanner);
      } catch (e) { /* noop */ }
      document.addEventListener('visibilitychange', updateBanner);
    }
    try {
      if (document.documentElement.getAttribute('data-turnos-portal') === 'supervisor') {
        activeRole = 'supervisor';
      } else if (document.documentElement.getAttribute('data-turnos-portal') === 'chofer') {
        activeRole = 'chofer';
      }
    } catch (e) { /* noop */ }
    registerServiceWorker();
    ensureBanner();
    applyManifest();
    updateBanner();
  }

  global.PlatformTurnosPwa = {
    init: init,
    updateUi: updateBanner,
    setRole: setRole,
    getRole: getRole,
    promptInstall: promptInstall,
    copyDirectLink: copyDirectLink,
    getDirectLink: getDirectLink,
    isStandalone: isStandalone,
    openInstallModal: openInstallModal
  };
})(typeof window !== 'undefined' ? window : this);
