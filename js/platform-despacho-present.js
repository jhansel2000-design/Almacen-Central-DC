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
  var LAYOUT_REV = '15';
  var BARCODE_REV = 'notext-hq-xxl';
  var fitBound = false;

  function ensureAmbientEl() {
    if (!mountEl || !shouldShowOnThisPage()) return null;
    var amb = mountEl.querySelector('#despPresentAmbient');
    if (!amb) {
      amb = document.createElement('div');
      amb.id = 'despPresentAmbient';
      amb.className = 'desp-present-ambient';
      amb.setAttribute('aria-hidden', 'true');
      amb.innerHTML =
        '<span class="desp-present-orb desp-present-orb--1"></span>' +
        '<span class="desp-present-orb desp-present-orb--2"></span>' +
        '<span class="desp-present-orb desp-present-orb--3"></span>' +
        '<span class="desp-present-frame-accent desp-present-frame-accent--tl"></span>' +
        '<span class="desp-present-frame-accent desp-present-frame-accent--br"></span>';
      mountEl.insertBefore(amb, mountEl.firstChild);
    }
    return amb;
  }

  function setAmbientVisible(show) {
    var amb = mountEl && mountEl.querySelector('#despPresentAmbient');
    if (!amb) return;
    amb.hidden = !show;
  }

  function brandMarkup() {
    return '<img class="jc-logo-img jc-logo-img--present desp-present-brand-logo" src="assets/img/jc-logo.png?v=5" alt="AC" width="56" height="56" decoding="async">' +
      '<div class="desp-present-brand-copy">' +
      '<span class="desp-present-brand-name">Almacén Central</span>' +
      '<span class="desp-present-brand-sub">Despacho · DC</span>' +
      '</div>';
  }

  function ensureBrandEl() {
    if (!mountEl || !shouldShowOnThisPage()) return null;
    var brand = mountEl.querySelector('#despPresentBrand');
    if (!brand) {
      brand = document.createElement('div');
      brand.id = 'despPresentBrand';
      brand.className = 'desp-present-brand';
      brand.setAttribute('aria-hidden', 'true');
      brand.innerHTML = brandMarkup();
      mountEl.appendChild(brand);
    } else if (!brand.querySelector('.desp-present-brand-copy')) {
      brand.innerHTML = brandMarkup();
    }
    return brand;
  }

  function setBrandVisible(show) {
    var brand = mountEl && mountEl.querySelector('#despPresentBrand');
    if (!brand) return;
    brand.hidden = !show;
  }

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

  function fitPresentToViewport() {
    if (!mountEl || mountEl.hidden || !shouldShowOnThisPage()) return;
    var inner = mountEl.querySelector('.desp-present-inner--tv');
    var block = mountEl.querySelector('.desp-present-content');
    if (!inner || !block) return;

    block.style.transform = 'none';
    block.style.marginBottom = '0';

    var availH = inner.clientHeight - 8;
    var availW = inner.clientWidth - 8;
    var natH = block.offsetHeight;
    var natW = block.offsetWidth;
    if (!natH || !availH || !natW || !availW) return;

    var scale = Math.min(1, availH / natH, availW / natW);
    if (scale < 0.995) {
      block.style.transform = 'scale(' + scale.toFixed(4) + ')';
      block.style.transformOrigin = 'center top';
      block.style.marginBottom = String(Math.round(natH * (scale - 1))) + 'px';
    }
  }

  function schedulePresentFit() {
    if (!global.requestAnimationFrame) {
      fitPresentToViewport();
      return;
    }
    global.requestAnimationFrame(function () {
      global.requestAnimationFrame(fitPresentToViewport);
    });
  }

  function ensureFitListeners() {
    if (fitBound) return;
    fitBound = true;
    global.addEventListener('resize', schedulePresentFit);
    if (global.visualViewport) {
      global.visualViewport.addEventListener('resize', schedulePresentFit);
    }
  }

  function wireBarcodeFit(imgEl) {
    if (!imgEl) return;
    if (imgEl.getAttribute('data-fit-wired') !== '1') {
      imgEl.setAttribute('data-fit-wired', '1');
      imgEl.addEventListener('load', function onBarcodeLoad() {
        schedulePresentFit();
        if (!shouldShowOnThisPage()) return;
        var targetH = barcodeRenderHeight(imgEl);
        var prevH = Number(imgEl.getAttribute('data-render-h') || 0);
        if (targetH - prevH > 24) {
          renderBarcode(imgEl, imgEl.alt);
        }
      });
    }
    schedulePresentFit();
  }

  function shareSignature(share) {
    if (!share || !share.active) return '';
    return [LAYOUT_REV, BARCODE_REV, share.idc, share.jaula, share.updatedAt].join('|');
  }

  function refreshBarcodeFromShare(share) {
    if (!mountEl || !share || !share.active) return;
    var img = mountEl.querySelector('#despPresentBarcode');
    if (img) {
      renderBarcode(img, share.idc);
      wireBarcodeFit(img);
    }
  }

  function barcodeRenderHeight(imgEl) {
    if (!imgEl) return 400;
    var inner = mountEl && mountEl.querySelector('.desp-present-inner--tv');
    var wrap = imgEl.closest('.desp-present-barcode-wrap');
    var meta = mountEl && mountEl.querySelector('.desp-present-meta--tv');
    var badge = mountEl && mountEl.querySelector('.desp-present-badge');
    var avail = 0;

    if (wrap && wrap.clientHeight > 80) {
      avail = wrap.clientHeight;
    } else if (inner && inner.clientHeight > 180) {
      var reserve = 0;
      if (meta && meta.offsetHeight) reserve += meta.offsetHeight + 10;
      else reserve += 120;
      if (badge && badge.offsetHeight) reserve += badge.offsetHeight + 12;
      else reserve += 32;
      reserve += 64;
      avail = Math.max(220, inner.clientHeight - reserve);
    }

    if (!avail) return 400;
    return Math.min(720, Math.max(300, Math.round(avail * 0.98)));
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
    var barH = tv ? barcodeRenderHeight(imgEl) : 100;
    global.PlatformDespachoBarcode.render(imgEl, code, tv ? {
      tv: true,
      height: barH,
      fontSize: 44,
      width: 6,
      margin: 12,
      showText: false,
      scale: 5
    } : {
      height: 100,
      fontSize: 24,
      width: 2.4,
      showText: true
    });
    if (tv) imgEl.setAttribute('data-render-h', String(barH));
  }

  function renderMount(share) {
    if (!mountEl) return;
    if (!shouldShowOnThisPage() || !share || !share.active) {
      mountEl.hidden = true;
      mountEl.setAttribute('aria-hidden', 'true');
      var oldShell = mountEl.querySelector('.desp-present-shell');
      if (oldShell) oldShell.remove();
      setBrandVisible(false);
      setAmbientVisible(false);
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
    ensureBrandEl();
    ensureAmbientEl();
    setBrandVisible(true);
    setAmbientVisible(true);

    var refText = String(share.jaula || '').trim();
    var hasJaula = !!refText;
    var shellCls = 'desp-present-shell' +
      (shouldShowOnThisPage() ? ' desp-present-shell--tv' : '') +
      (hasJaula ? ' desp-present-shell--has-pasillo' : ' desp-present-shell--no-pasillo');

    var shell = mountEl.querySelector('.desp-present-shell');
    if (!shell) {
      shell = document.createElement('div');
      mountEl.insertBefore(shell, mountEl.querySelector('#despPresentBrand'));
    }
    shell.className = shellCls;
    shell.innerHTML =
      '<div class="desp-present-inner desp-present-inner--tv">' +
      '<div class="desp-present-badge"><span class="desp-present-dot"></span> EN VIVO · Código de barras IDC</div>' +
      '<div class="desp-present-grid desp-present-grid--tv">' +
      '<div class="desp-present-content">' +
      '<div class="desp-present-stage">' +
      '<span class="desp-present-corner desp-present-corner--tl" aria-hidden="true"></span>' +
      '<span class="desp-present-corner desp-present-corner--tr" aria-hidden="true"></span>' +
      '<span class="desp-present-corner desp-present-corner--bl" aria-hidden="true"></span>' +
      '<span class="desp-present-corner desp-present-corner--br" aria-hidden="true"></span>' +
      '<div class="desp-present-barcode-wrap desp-present-barcode-wrap--tv">' +
      '<span class="desp-present-scan-tag" aria-hidden="true">ESCANEO IDC</span>' +
      '<img class="desp-present-barcode desp-barcode-img" id="despPresentBarcode" alt="Código de barras IDC">' +
      '</div></div>' +
      '<div class="desp-present-meta desp-present-meta--tv">' +
      '<div class="desp-present-meta-divider" aria-hidden="true"></div>' +
      '<p class="desp-present-label">IDC activo</p>' +
      '<p class="desp-present-idc"><span class="desp-present-idc-value">' + esc(idc) + '</span></p>' +
      '<div class="desp-present-ref-block">' +
      '<p class="desp-present-ref-label">Referencia</p>' +
      '<p class="desp-present-jaula">' +
      '<span class="desp-present-jaula-value' + (hasJaula ? '' : ' desp-present-jaula-value--empty') + '">' +
      esc(hasJaula ? refText : '—') + '</span></p></div>' +
      '<p class="desp-present-by"><span class="desp-present-by-label">Preparador</span> ' + esc(share.sharedBy || '—') + '</p>' +
      '</div></div></div></div>';

    renderBarcode(shell.querySelector('#despPresentBarcode'), idc);
    wireBarcodeFit(shell.querySelector('#despPresentBarcode'));
    schedulePresentFit();
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
    if (sig === lastSig) {
      refreshBarcodeFromShare(share);
      return;
    }
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
    if (bound) {
      lastSig = '';
      refreshFromStore();
      return;
    }
    bound = true;
    displayMode = resolveDisplayMode(opts || {});
    ensureMount();
    ensureFitListeners();

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
