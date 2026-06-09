/**
 * Código de barras Code 128 para IDC (preparador — compartir pantalla)
 */
(function (global) {
  'use strict';

  function render(svgEl, text, opts) {
    if (!svgEl || !text || typeof global.JsBarcode !== 'function') return false;
    opts = opts || {};
    try {
      global.JsBarcode(svgEl, String(text), {
        format: 'CODE128',
        displayValue: opts.showText !== false,
        fontSize: opts.fontSize || 20,
        height: opts.height || 72,
        width: opts.width || 2,
        margin: opts.margin || 8,
        background: '#ffffff',
        lineColor: '#000000',
        textAlign: 'center',
        textPosition: 'bottom'
      });
      return true;
    } catch (e) {
      return false;
    }
  }

  global.PlatformDespachoBarcode = {
    render: render
  };
})(typeof window !== 'undefined' ? window : this);
