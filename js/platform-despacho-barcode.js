/**
 * Código de barras Code 128 para IDC — render vía canvas → img (evita SVG negro en tema oscuro)
 */
(function (global) {
  'use strict';

  function renderToDataUrl(text, opts) {
    if (!text || typeof global.JsBarcode !== 'function') return '';
    opts = opts || {};
    var tv = !!opts.tv;
    var scale = opts.scale || (tv ? Math.max(2.5, global.devicePixelRatio || 2) : 1);
    try {
      var canvas = document.createElement('canvas');
      global.JsBarcode(canvas, String(text), {
        format: 'CODE128',
        displayValue: opts.showText !== false,
        fontSize: Math.round((opts.fontSize || (tv ? 32 : 20)) * scale),
        height: Math.round((opts.height || (tv ? 140 : 72)) * scale),
        width: (opts.width || (tv ? 3.2 : 2)) * scale,
        margin: Math.round((opts.margin || (tv ? 20 : 8)) * scale),
        background: '#ffffff',
        lineColor: '#000000',
        textAlign: 'center',
        textPosition: 'bottom',
        textMargin: Math.round(8 * scale)
      });
      return canvas.toDataURL('image/png');
    } catch (e) {
      return '';
    }
  }

  function applyToImg(imgEl, text, opts) {
    if (!imgEl) return false;
    var url = renderToDataUrl(text, opts);
    if (!url) {
      imgEl.removeAttribute('src');
      imgEl.alt = '';
      return false;
    }
    imgEl.src = url;
    imgEl.alt = String(text);
    if (opts && opts.tv) imgEl.classList.add('desp-barcode-img--tv');
    else imgEl.classList.remove('desp-barcode-img--tv');
    return true;
  }

  function render(targetEl, text, opts) {
    if (!targetEl || !text) return false;
    opts = opts || {};

    if (targetEl.tagName === 'IMG') {
      return applyToImg(targetEl, text, opts);
    }

    if (targetEl.tagName === 'SVG') {
      var img = document.createElement('img');
      img.className = (targetEl.className || '') + ' desp-barcode-img';
      img.id = targetEl.id || '';
      img.setAttribute('role', 'img');
      if (!applyToImg(img, text, opts)) return false;
      targetEl.replaceWith(img);
      return true;
    }

    var nested = targetEl.querySelector('img.desp-barcode-img');
    if (nested) return applyToImg(nested, text, opts);

    var created = document.createElement('img');
    created.className = 'desp-barcode-img';
    if (!applyToImg(created, text, opts)) return false;
    targetEl.innerHTML = '';
    targetEl.appendChild(created);
    return true;
  }

  global.PlatformDespachoBarcode = {
    render: render,
    renderToDataUrl: renderToDataUrl
  };
})(typeof window !== 'undefined' ? window : this);
