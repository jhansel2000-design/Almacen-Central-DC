/**
 * Alertas de voz — nuevo IDC en seguimiento validador
 * Frase natural, sin repetir etiquetas (IDC, jaula, cliente).
 */
(function (global) {
  'use strict';

  function stripLeadingLabel(value, labels) {
    var s = String(value || '').trim();
    if (!s) return '';
    for (var i = 0; i < labels.length; i++) {
      var label = labels[i];
      var re = new RegExp('^\\s*' + label.replace(/\s+/g, '\\s+') + '\\s*[:\\-\\.]?\\s*', 'i');
      if (re.test(s)) {
        s = s.replace(re, '').trim();
        break;
      }
    }
    return s;
  }

  function isEmptyCliente(val) {
    if (!val) return true;
    val = String(val).trim();
    return !val || val === '—' || val === '-' || /^sin\s+(cliente|nombre)/i.test(val);
  }

  /** Códigos alfanuméricos: separar para que no los lea como número grande. */
  function formatCodeForSpeech(code) {
    code = String(code || '').trim();
    if (!code) return '';
    if (/^[A-Za-z0-9][A-Za-z0-9\-\/\.\s]*$/.test(code)) {
      return code
        .replace(/[\-\/\.]/g, ' ')
        .replace(/\s+/g, ' ')
        .split('')
        .filter(function (c) { return /\S/.test(c); })
        .join(' ');
    }
    return code.replace(/\s+/g, ' ').trim();
  }

  function joinNatural(parts) {
    if (!parts.length) return '';
    if (parts.length === 1) return parts[0];
    if (parts.length === 2) return parts[0] + ' y ' + parts[1];
    return parts.slice(0, -1).join(', ') + ' y ' + parts[parts.length - 1];
  }

  function buildNuevoIdcMessage(pedido) {
    if (!pedido) return '';

    var idc = stripLeadingLabel(pedido.idc, [
      'idc', 'i d c', 'i.d.c', 'pedido', 'código', 'codigo', 'code', 'id pedido', 'id del pedido'
    ]);
    var jaula = stripLeadingLabel(pedido.jaula, [
      'jaula', 'pasillo', 'referencia', 'ref', 'rack', 'ubicación', 'ubicacion'
    ]);
    var cliente = stripLeadingLabel(pedido.cliente, [
      'cliente', 'clienta', 'nombre del cliente', 'nombre cliente', 'nombre'
    ]);

    idc = formatCodeForSpeech(idc);
    jaula = formatCodeForSpeech(jaula);

    var details = [];
    if (idc) details.push('código ' + idc);
    if (jaula) details.push('jaula ' + jaula);
    if (!isEmptyCliente(cliente)) details.push('cliente ' + cliente);

    if (!details.length) return '';

    var body = joinNatural(details);
    return 'Nuevo pedido en validador, ' + body + '.';
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
