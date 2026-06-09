/**
 * Alertas de voz — nuevo IDC en seguimiento validador
 */
(function (global) {
  'use strict';

  var DIGIT_WORDS = [
    'cero', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve'
  ];

  function formatPasilloForSpeech(jaula) {
    jaula = String(jaula || '').trim();
    if (!jaula) return 'sin pasillo asignado';
    var spoken = jaula.replace(/[-_/]+/g, ' ').replace(/\s+/g, ' ').trim();
    spoken = spoken.replace(/\d/g, function (d) {
      var n = parseInt(d, 10);
      return DIGIT_WORDS[n] != null ? DIGIT_WORDS[n] : d;
    });
    return 'pasillo ' + spoken;
  }

  function formatClienteForSpeech(cliente) {
    cliente = String(cliente || '').trim();
    if (!cliente) return '';
    return ' Cliente ' + cliente.replace(/\s+/g, ' ') + '.';
  }

  function buildNuevoIdcMessage(pedido) {
    if (!pedido) return '';
    var jaula = formatPasilloForSpeech(pedido.jaula);
    var msg = 'Atención validador. Hay un nuevo IDC pendiente en el ' + jaula + '.';
    msg += formatClienteForSpeech(pedido.cliente);
    return msg;
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
      utter.rate = 0.92;
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
