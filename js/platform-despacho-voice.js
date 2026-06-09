/**
 * Alertas de voz — nuevo IDC en seguimiento validador
 * Lee solo lo escrito en IDC, jaula y cliente.
 */
(function (global) {
  'use strict';

  function buildNuevoIdcMessage(pedido) {
    if (!pedido) return '';
    var idc = String(pedido.idc || '').trim();
    var jaula = String(pedido.jaula || '').trim();
    var cliente = String(pedido.cliente || '').trim();
    var parts = [];
    if (idc) parts.push('IDC ' + idc);
    if (jaula) parts.push('Jaula ' + jaula);
    if (cliente) parts.push('Cliente ' + cliente);
    if (!parts.length) return '';
    return parts.join('. ') + '.';
  }

  function speak(message, opts) {
    if (!message) return false;
    opts = opts || {};
    if (global.PlatformSpeech && global.PlatformSpeech.speak) {
      return global.PlatformSpeech.speak(message, {
        cancel: opts.cancel !== false,
        onEnd: opts.onEnd,
        onError: opts.onError
      });
    }
    if (!global.speechSynthesis || !global.SpeechSynthesisUtterance) return false;
    try {
      if (opts.cancel !== false) global.speechSynthesis.cancel();
      var utter = new global.SpeechSynthesisUtterance(message);
      utter.lang = 'es-DO';
      utter.rate = 0.95;
      utter.pitch = 1;
      utter.volume = 0.88;
      var voices = global.speechSynthesis.getVoices ? global.speechSynthesis.getVoices() : [];
      var voice = voices.filter(function (v) {
        return /^es(-|_)/i.test(v.lang || '') &&
          /female|mujer|sofia|paulina|sabina|google/i.test(v.name || '');
      })[0] || voices.filter(function (v) { return /^es(-|_)/i.test(v.lang || ''); })[0];
      if (voice) utter.voice = voice;
      if (opts.onEnd) utter.onend = opts.onEnd;
      if (opts.onError) utter.onerror = opts.onError;
      global.speechSynthesis.speak(utter);
      return true;
    } catch (e) {
      return false;
    }
  }

  function announceNuevoIdc(pedido, opts) {
    var msg = buildNuevoIdcMessage(pedido);
    if (!msg) return false;
    return speak(msg, opts);
  }

  global.PlatformDespachoVoice = {
    buildNuevoIdcMessage: buildNuevoIdcMessage,
    announceNuevoIdc: announceNuevoIdc,
    speak: speak
  };
})(typeof window !== 'undefined' ? window : this);
