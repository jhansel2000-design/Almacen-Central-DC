/**
 * Presentación en vivo — vista compartida tipo PowerPoint (IDC + barcode + jaula)
 */
(function (global) {
  'use strict';

  var esc = global.PanelCore ? global.PanelCore.esc : function (s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  };

  var bound = false;
  var mountEl = null;
  var lastSig = '';
  var displayMode = false;

  function DS() {
    return global.PlatformDespachoStore;
  }

  function resolveDisplayMode(opts) {
    if (opts && opts.displayMode != null) return !!opts.displayMode;
    if (global.PlatformDespachoDisplay && global.PlatformDespachoDisplay.isDisplayMode) {
      return global.PlatformDespachoDisplay.isDisplayMode();
    }
    return !!(global.document && global.document.body &&
      global.document.body.classList.contains('desp-display-mode'));
  }

  function shouldShowOnThisPage() {
    return displayMode;
  }

  function estadoHtml(estadoId) {
    var store = DS();
    if (!store) return esc(estadoId || '—');
    var e = store.ESTADOS[estadoId] || { label: estadoId, icon: '●', short: estadoId, color: 'neutral' };
    return '<span class="desp-present-estado desp-present-estado--' + esc(e.color) + '">' +
      esc(e.icon) + ' ' + esc(e.short || e.label) + '</span>';
  }

  function shareSignature(share) {
    if (!share || !share.active) return '';
    return [share.idc, share.jaula, share.estado, share.updatedAt].join('|');
  }

  function renderBarcode(imgEl, idc) {
    if (!imgEl || !global.PlatformDespachoBarcode || !DS()) return;
    var code = DS().formatIdc(idc);
    if (!code) {
      imgEl.removeAttribute('src');
      imgEl.alt = '';
      return;
    }
    var tv = shouldShowOnThisPage();
    global.PlatformDespachoBarcode.render(imgEl, code, tv ? {
      tv: true,
      height: 140,
      fontSize: 32,
      width: 3.2,
      margin: 20,
      showText: true
    } : {
      height: 100,
      fontSize: 24,
      width: 2.4,
      showText: true
    });
  }

  function renderMount(share) {
    if (!mountEl) return;
    if (!shouldShowOnThisPage() || !share || !share.active) {
      mountEl.hidden = true;
      mountEl.setAttribute('aria-hidden', 'true');
      mountEl.innerHTML = '';
      if (global.document && global.document.body) {
        global.document.body.classList.remove('desp-live-present-on');
      }
      lastSig = '';
      return;
    }

    var idc = DS().formatIdc(share.idc);
    mountEl.hidden = false;
    mountEl.setAttribute('aria-hidden', 'false');
    document.body.classList.add('desp-live-present-on');

    mountEl.innerHTML =
      '<div class="desp-present-shell' + (shouldShowOnThisPage() ? ' desp-present-shell--tv' : '') + '">' +
      '<div class="desp-present-inner">' +
      '<div class="desp-present-badge"><span class="desp-present-dot"></span> EN VIVO · Código de barras IDC</div>' +
      '<div class="desp-present-grid desp-present-grid--tv">' +
      '<div class="desp-present-barcode-wrap desp-present-barcode-wrap--tv">' +
      '<img class="desp-present-barcode desp-barcode-img" id="despPresentBarcode" alt="Código de barras IDC">' +
      '</div>' +
      '<div class="desp-present-meta desp-present-meta--tv">' +
      '<p class="desp-present-label">IDC activo</p>' +
      '<p class="desp-present-idc">' + esc(idc) + '</p>' +
      '<p class="desp-present-jaula">Pasillo <strong>' + esc(share.jaula || '—') + '</strong></p>' +
      '<div class="desp-present-estado-wrap">' + estadoHtml(share.estado) + '</div>' +
      '<p class="desp-present-by">Preparador: ' + esc(share.sharedBy || '—') + '</p>' +
      '</div></div></div></div>';

    renderBarcode(mountEl.querySelector('#despPresentBarcode'), idc);
    lastSig = shareSignature(share);
  }

  function refreshFromStore() {
    var store = DS();
    if (!store) return;
    if (!shouldShowOnThisPage()) {
      renderMount(null);
      return;
    }
    var share = store.getLiveShare ? store.getLiveShare() : null;
    var sig = shareSignature(share);
    if (sig === lastSig) return;
    renderMount(share);
  }

  function ensureMount() {
    if (mountEl && mountEl.isConnected) return mountEl;
    mountEl = document.getElementById('despGlobalLivePresent');
    if (!mountEl) {
      mountEl = document.createElement('div');
      mountEl.id = 'despGlobalLivePresent';
      mountEl.className = 'desp-live-present';
      mountEl.hidden = true;
      mountEl.setAttribute('aria-live', 'polite');
      document.body.appendChild(mountEl);
    }
    return mountEl;
  }

  function bind(opts) {
    if (bound) return;
    bound = true;
    displayMode = resolveDisplayMode(opts || {});
    ensureMount();

    function onUpdate() {
      refreshFromStore();
    }

    global.addEventListener('despacho-updated', onUpdate);
    global.addEventListener('despacho-live-share', onUpdate);
    global.addEventListener('storage', function (ev) {
      if (ev.key === (DS() && DS().STORAGE_KEY)) onUpdate();
    });

    if (typeof global.BroadcastChannel !== 'undefined') {
      var bc = new global.BroadcastChannel('despacho-live-share');
      bc.onmessage = function () { onUpdate(); };
    }

    refreshFromStore();
  }

  function unbind() {
    bound = false;
    if (mountEl) renderMount(null);
  }

  global.PlatformDespachoPresent = {
    bind: bind,
    unbind: unbind,
    refresh: refreshFromStore,
    render: renderMount
  };
})(typeof window !== 'undefined' ? window : this);
