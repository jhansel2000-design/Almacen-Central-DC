/**
 * UI — Módulo Despacho (Preparador + Validador)
 */
(function (global) {
  'use strict';

  var esc = global.PanelCore ? global.PanelCore.esc : function (s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  };

  var DS = null;
  var unbindSync = null;
  var lastOpts = null;
  var displayWindows = { barcode: null, lista: null };
  var pasilloTouched = { prep: false, share: false };
  var knownValidatorIds = Object.create(null);
  var voiceAlertsReady = false;

  function fmtCliente(p) {
    var c = p && p.cliente ? String(p.cliente).trim() : '';
    return c || '—';
  }

  function handleVoiceAlerts(data, despachoArea) {
    var Voice = global.PlatformDespachoVoice;
    if (!Voice || !DS || !data) return;
    var list = DS.getPedidosVisiblesValidador(data.pedidos);
    if (!voiceAlertsReady) {
      list.forEach(function (p) { knownValidatorIds[p.id] = true; });
      voiceAlertsReady = true;
      return;
    }
    if (despachoArea !== 'validador') return;
    list.forEach(function (p) {
      if (!knownValidatorIds[p.id]) {
        knownValidatorIds[p.id] = true;
        Voice.announceNuevoIdc(p);
      }
    });
  }

  function announceNuevoIdcPedido(pedido) {
    if (!pedido || !global.PlatformDespachoVoice) return;
    global.PlatformDespachoVoice.announceNuevoIdc(pedido);
    knownValidatorIds[pedido.id] = true;
  }

  function resetPasilloTouched() {
    pasilloTouched.prep = false;
    pasilloTouched.share = false;
  }

  function pasilloValueFromField(input, key) {
    if (!pasilloTouched[key]) return '';
    return input ? String(input.value || '').trim() : '';
  }

  function liveStatusText(live) {
    if (!live || !live.active) return '';
    var txt = 'Transmitiendo en pantalla externa · ' + formatIdc(live.idc);
    if (live.jaula) txt += ' · Pasillo ' + live.jaula;
    return txt;
  }

  function getDisplayUrl(view) {
    if (global.PlatformDespachoDisplay && global.PlatformDespachoDisplay.getDisplayUrl) {
      return global.PlatformDespachoDisplay.getDisplayUrl(view);
    }
    var path = global.location.pathname.replace(/[^/]*$/, 'despacho-pantalla.html');
    return global.location.origin + path + '?v=' + encodeURIComponent(view || 'barcode');
  }

  function openDisplayWindow(view) {
    view = view || 'barcode';
    var win = displayWindows[view];
    if (win && !win.closed) {
      try { win.focus(); } catch (e) { /* noop */ }
      return win;
    }
    var url = getDisplayUrl(view);
    win = global.open(url, 'despacho_pantalla_' + view, 'noopener,noreferrer');
    if (win) displayWindows[view] = win;
    return win;
  }

  function ensureDisplayWindow(view) {
    return openDisplayWindow(view || 'barcode');
  }

  function fmtDt(iso) {
    if (!iso) return '—';
    try {
      return new Intl.DateTimeFormat('es-DO', {
        dateStyle: 'short',
        timeStyle: 'short',
        timeZone: 'America/Santo_Domingo'
      }).format(new Date(iso));
    } catch (e) {
      return String(iso).slice(0, 16).replace('T', ' ');
    }
  }

  function estadoBadge(estadoId) {
    var e = DS.ESTADOS[estadoId] || { label: estadoId, icon: '●', color: 'neutral' };
    return '<span class="desp-estado desp-estado--' + esc(e.color) + '">' +
      '<span class="desp-estado-icon" aria-hidden="true">' + esc(e.icon) + '</span>' +
      '<span class="desp-estado-text">' + esc(e.short || e.label) + '</span></span>';
  }

  function flujoHtml() {
    return '<div class="desp-flujo" aria-label="Flujo de despacho">' +
      DS.FLUJO.map(function (id, i) {
        var e = DS.ESTADOS[id];
        return (i > 0 ? '<span class="desp-flujo-arrow" aria-hidden="true">→</span>' : '') +
          '<span class="desp-flujo-step desp-flujo-step--' + esc(e.color) + '">' +
          esc(e.icon) + ' ' + esc(e.short) + '</span>';
      }).join('') +
      '</div>';
  }

  function kpiStrip(counts, despachoArea) {
    counts = counts || {};
    despachoArea = despachoArea === 'validador' ? 'validador' : 'preparador';
    var ids = despachoArea === 'validador'
      ? DS.VALIDADOR_ESTADOS.slice()
      : DS.PREPARADOR_ESTADOS.slice();
    return '<div class="desp-kpi-strip">' +
      ids.map(function (id) {
        var e = DS.ESTADOS[id];
        return '<article class="desp-kpi desp-kpi--' + esc(e.color) + '">' +
          '<span class="desp-kpi-val">' + esc(String(counts[id] || 0)) + '</span>' +
          '<span class="desp-kpi-lbl">' + esc(e.short) + '</span></article>';
      }).join('') +
      '</div>';
  }

  function formatIdc(raw) {
    return DS && DS.formatIdc ? DS.formatIdc(raw) : String(raw || '').trim();
  }

  function renderBarcodeImg(imgEl, idc, opts) {
    if (!imgEl || !global.PlatformDespachoBarcode) return;
    var code = formatIdc(idc);
    if (!code) {
      imgEl.removeAttribute('src');
      imgEl.alt = '';
      return;
    }
    global.PlatformDespachoBarcode.render(imgEl, code, opts || {});
  }

  function guardPasilloField(input, key, onCleared) {
    if (!input) return;
    input.setAttribute('autocomplete', 'off');
    input.setAttribute('autocorrect', 'off');
    input.setAttribute('spellcheck', 'false');
    input.setAttribute('data-lpignore', 'true');
    input.setAttribute('data-form-type', 'other');
    input.setAttribute('data-1p-ignore', 'true');
    input.readOnly = true;
    input.addEventListener('focus', function unlock() {
      input.readOnly = false;
    }, { once: true });
    input.addEventListener('input', function () {
      pasilloTouched[key] = true;
    });
    function purgeAutofill() {
      if (pasilloTouched[key] || !input.value) return;
      input.value = '';
      if (onCleared) onCleared();
    }
    setTimeout(purgeAutofill, 0);
    setTimeout(purgeAutofill, 120);
    setTimeout(purgeAutofill, 450);
  }

  function updateBarcodePanel(host, idc, jaula, estado) {
    var img = host.querySelector('#despBarcodeImg');
    var label = host.querySelector('#despBarcodeLabel');
    var jaulaEl = host.querySelector('#despBarcodePasillo');
    var estadoEl = host.querySelector('#despBarcodeEstado');
    var code = formatIdc(idc);
    if (label) label.textContent = code || '—';
    if (jaulaEl) jaulaEl.textContent = jaula ? ('Pasillo ' + jaula) : '';
    if (estadoEl && DS && DS.ESTADOS) {
      estadoEl.innerHTML = estadoBadge(estado || 'en_proceso');
    }
    renderBarcodeImg(img, code, { height: 96, fontSize: 22, width: 2.3 });
  }

  function normalizeScreen(screen) {
    if (screen === 'pantalla' || screen === 'barcode') return 'barcode';
    if (screen === 'lista' || screen === 'validador') return 'validador';
    return 'registro';
  }

  function resolveScreenForRole(screen, despachoArea) {
    screen = normalizeScreen(screen);
    despachoArea = despachoArea === 'validador' ? 'validador' : 'preparador';
    if (despachoArea === 'validador') return 'validador';
    if (screen === 'validador') return 'registro';
    return screen;
  }

  function renderListaPreviewTable(pedidos, emptyMsg) {
    pedidos = pedidos || [];
    if (!pedidos.length) {
      return '<p class="desp-muted">' + esc(emptyMsg || 'Sin IDC registrados.') + '</p>';
    }
    return '<div class="desp-table-wrap desp-lista-preview-wrap">' +
      '<table class="desp-table desp-lista-preview-table">' +
      '<thead><tr><th>IDC</th><th>Pasillo</th><th>Estado</th></tr></thead><tbody>' +
      pedidos.map(function (p) {
        return '<tr><td><strong class="desp-idc">' + esc(formatIdc(p.idc)) + '</strong></td>' +
          '<td>' + esc(p.jaula) + '</td><td>' + estadoBadge(p.estado) + '</td></tr>';
      }).join('') +
      '</tbody></table></div>';
  }

  function renderEntradaBtn(opts) {
    opts = opts || {};
    var cls = 'desp-entrada-btn desp-entrada-btn--' + esc(opts.id);
    if (opts.active) cls += ' active';
    if (opts.live) cls += ' has-live';
    return '<button type="button" class="' + cls + '" data-desp-screen="' + esc(opts.screen) + '" role="tab"' +
      (opts.active ? ' aria-selected="true"' : '') + '>' +
      '<span class="desp-entrada-btn-glow" aria-hidden="true"></span>' +
      '<span class="desp-entrada-btn-icon" aria-hidden="true">' + esc(opts.icon) + '</span>' +
      '<span class="desp-entrada-btn-body">' +
      '<span class="desp-entrada-btn-title">' + esc(opts.title) + '</span>' +
      '<span class="desp-entrada-btn-sub">' + esc(opts.sub) + '</span></span>' +
      (opts.live ? '<span class="desp-entrada-live"><span class="desp-entrada-live-dot"></span>EN VIVO</span>' : '') +
      '</button>';
  }

  function renderNavEntrada(screen, data, opts) {
    screen = normalizeScreen(screen);
    opts = opts || {};
    var despachoArea = opts.despachoArea === 'validador' ? 'validador' : 'preparador';
    var canValidate = !!opts.canValidate;
    var sharingBarcode = DS.getLiveShare(data);
    var liveBarcode = !!(sharingBarcode && sharingBarcode.active);
    var sharingLista = DS.getLiveShareLista(data);
    var liveLista = !!(sharingLista && sharingLista.active);

    if (despachoArea === 'validador') {
      return '<nav class="desp-entrada-nav desp-entrada-nav--1" role="tablist" aria-label="Panel validador">' +
        renderEntradaBtn({
          id: 'validador',
          screen: 'validador',
          icon: '✅',
          title: 'Panel validador',
          sub: 'Seguimiento · quitar IDC · pantalla TV',
          active: screen === 'validador',
          live: liveLista
        }) +
        '</nav>';
    }

    return '<nav class="desp-entrada-nav desp-entrada-nav--2" role="tablist" aria-label="Panel operador">' +
      renderEntradaBtn({
        id: 'registro',
        screen: 'registro',
        icon: '📋',
        title: 'Seguimiento IDC y pasillo',
        sub: 'En proceso · Facturado',
        active: screen === 'registro',
        live: false
      }) +
      renderEntradaBtn({
        id: 'barcode',
        screen: 'barcode',
        icon: '📊',
        title: 'Código de barras IDC',
        sub: 'Un IDC · escaneo en pantalla',
        active: screen === 'barcode',
        live: liveBarcode
      }) +
      '</nav>';
  }

  function renderPanelRegistroComun(data) {
    return '<section class="desp-panel desp-panel--registro" aria-labelledby="despRegistroTitle">' +
      '<header class="desp-panel-head">' +
      '<div><span class="desp-eyebrow">Operador · Preparador</span>' +
      '<h3 id="despRegistroTitle">Seguimiento IDC y pasillo</h3>' +
      '<p class="desp-panel-sub">Registre IDC y pasillo como <strong>En proceso</strong> o <strong>Facturado</strong> — ingresa <strong>automáticamente</strong> al seguimiento validador.</p></div>' +
      '</header>' +
      '<div class="desp-prep-main">' +
      '<form class="desp-form" id="despPrepForm" autocomplete="off" onsubmit="return false">' +
      '<div class="desp-form-grid">' +
      '<label class="desp-field"><span>ID pedido (IDC)</span>' +
      '<input type="text" id="despIdc" name="idc" inputmode="text" placeholder="Escriba el IDC" autocapitalize="off" autocomplete="off"></label>' +
      '<label class="desp-field"><span>Pasillo</span>' +
      '<input type="text" id="despPasillo" name="x_dc_prep_pasillo" placeholder="Escriba el pasillo" autocomplete="off" autocorrect="off" spellcheck="false" inputmode="text" aria-label="Pasillo"></label>' +
      '<label class="desp-field"><span>Nombre del cliente</span>' +
      '<input type="text" id="despCliente" name="cliente" placeholder="Nombre del cliente" autocomplete="off" autocorrect="off" spellcheck="false"></label>' +
      '<fieldset class="desp-field desp-field--estado"><legend>Estado · preparador</legend>' +
      '<div class="desp-estado-pick">' +
      DS.PREPARADOR_ESTADOS.map(function (id, i) {
        var e = DS.ESTADOS[id];
        return '<label class="desp-radio desp-radio--' + esc(e.color) + '">' +
          '<input type="radio" name="prepEstado" value="' + esc(id) + '"' + (i === 0 ? ' checked' : '') + '>' +
          '<span>' + esc(e.icon) + ' ' + esc(e.label) + '</span></label>';
      }).join('') +
      '</div></fieldset>' +
      '</div>' +
      '<div class="desp-prep-actions desp-prep-actions--single">' +
      '<button type="button" class="btn btn-primary desp-action-btn desp-btn-update" id="despBtnUpdateIdc">' +
      '<span class="desp-action-btn-icon" aria-hidden="true">📋</span>' +
      '<span class="desp-action-btn-text">Registrar IDC y pasillo</span></button>' +
      '</div>' +
      '</form>' +
      '<div class="desp-recent">' +
      '<h4>Últimos en validador <span class="desp-muted">(solo copia el IDC)</span></h4>' +
      renderPedidosMini(DS.getPedidosVisiblesValidador(data.pedidos).slice(0, 6)) +
      '</div>' +
      '<section class="desp-jaula-map" aria-labelledby="despJaulaMapTitle">' +
      '<h4 id="despJaulaMapTitle">IDC por pasillo · en validador</h4>' +
      '<p class="desp-muted desp-jaula-map-sub">Los registros del operador aparecen aquí hasta que el validador los finaliza</p>' +
      renderJaulaMap(DS.getPedidosVisiblesValidador(data.pedidos)) +
      '</section></div></section>';
  }

  function renderPanelBarcodeShare(data) {
    var sharing = DS.getLiveShare(data);
    return '<section class="desp-panel desp-panel--barcode" aria-labelledby="despBarcodeTitle">' +
      '<header class="desp-panel-head">' +
      '<div><span class="desp-eyebrow">Opción 1 · Lectores / escaneo</span>' +
      '<h3 id="despBarcodeTitle">Compartir IDC como código de barras</h3>' +
      '<p class="desp-panel-sub">Escriba IDC y pasillo · se refleja en vivo en la pantalla externa al compartir</p></div>' +
      (sharing ? '<span class="desp-share-live-tag"><span class="desp-live-dot"></span> EN VIVO</span>' : '') +
      '</header>' +
      '<p class="desp-share-status" id="despShareStatus"' + (sharing ? '' : ' hidden') + '>' +
      (sharing ? liveStatusText(sharing) : '') +
      '</p>' +
      '<div class="desp-prep-layout desp-prep-layout--v2">' +
      '<div class="desp-prep-main">' +
      '<form class="desp-form" id="despShareForm" autocomplete="off" onsubmit="return false">' +
      '<div class="desp-form-grid">' +
      '<label class="desp-field"><span>IDC a mostrar</span>' +
      '<input type="text" id="despShareIdc" name="idc" inputmode="text" placeholder="Escriba el IDC" autocapitalize="off" autocomplete="off"></label>' +
      '<label class="desp-field"><span>Pasillo</span>' +
      '<input type="text" id="despSharePasillo" name="x_dc_share_pasillo" placeholder="Escriba el pasillo" autocomplete="off" autocorrect="off" spellcheck="false" inputmode="text" aria-label="Pasillo"></label>' +
      '<fieldset class="desp-field desp-field--estado"><legend>Estado · preparador</legend>' +
      '<div class="desp-estado-pick">' +
      DS.PREPARADOR_ESTADOS.map(function (id, i) {
        var e = DS.ESTADOS[id];
        return '<label class="desp-radio desp-radio--' + esc(e.color) + '">' +
          '<input type="radio" name="shareEstado" value="' + esc(id) + '"' + (i === 0 ? ' checked' : '') + '>' +
          '<span>' + esc(e.icon) + ' ' + esc(e.label) + '</span></label>';
      }).join('') +
      '</div></fieldset>' +
      '</div>' +
      '<div class="desp-prep-actions desp-prep-actions--single">' +
      '<button type="button" class="btn desp-action-btn desp-btn-share desp-btn-share--barcode' + (sharing ? ' is-live' : '') + '" id="despBtnShareScreen">' +
      '<span class="desp-action-btn-icon" aria-hidden="true">' + (sharing ? '⏹' : '📊') + '</span>' +
      '<span class="desp-action-btn-text">' + (sharing ? 'Dejar de compartir código de barras' : 'Compartir IDC como código de barras') + '</span></button>' +
      '</div>' +
      '</form>' +
      '<div class="desp-recent">' +
      '<h4>Cargar IDC desde registro <span class="desp-muted">(solo copia el IDC, no el pasillo)</span></h4>' +
      renderPedidosMiniShare(DS.getPedidosSeguimientoPreparador(data.pedidos).slice(0, 8)) +
      '</div></div>' +
      '<aside class="desp-barcode-panel" id="despBarcodePanel" aria-label="Vista previa local">' +
      '<h4 class="desp-barcode-title">Vista previa (solo aquí)</h4>' +
      '<p class="desp-muted desp-barcode-hint">Referencia local. La pantalla externa muestra el mismo IDC en grande.</p>' +
      '<div class="desp-barcode-stage">' +
      '<img id="despBarcodeImg" class="desp-barcode-img" alt="Código de barras IDC" width="300" height="100">' +
      '</div>' +
      '<p class="desp-barcode-idc" id="despBarcodeLabel">—</p>' +
      '<p class="desp-barcode-jaula" id="despBarcodePasillo"></p>' +
      '<div id="despBarcodeEstado"></div>' +
      '</aside></div></section>';
  }

  function renderValidadorEstadoBtns(p, canValidate, compact) {
    if (!canValidate) {
      return '<span class="desp-muted">Sin permiso</span>';
    }
    var html = '<div class="desp-val-estado-btns' + (compact ? ' desp-val-estado-btns--compact' : '') + '">';
    DS.VALIDADOR_ESTADOS.forEach(function (id) {
      var e = DS.ESTADOS[id];
      var isCurrent = p.estado === id;
      var cls = 'desp-btn-set-estado btn btn-ghost';
      if (id === 'listo_despacho') cls += ' desp-btn-listo';
      if (isCurrent) cls += ' is-current';
      html += '<button type="button" class="' + cls + '" data-pedido-id="' + esc(p.id) + '" data-estado="' + esc(id) + '"' +
        (isCurrent ? ' disabled aria-current="true"' : '') + ' title="' + esc(e.label) + '">' +
        esc(e.icon) + ' ' + esc(compact && id === 'listo_despacho' ? 'Listo' : (e.short || e.label)) +
        '</button>';
    });
    html += '</div>';
    return html;
  }

  function renderListaEnVivoSeguimiento(pedidos, canRemove) {
    pedidos = pedidos || [];
    if (!pedidos.length) {
      return '<p class="desp-muted desp-lista-vivo-empty">Sin IDC en seguimiento validador en vivo.</p>';
    }
    return '<div class="desp-table-wrap desp-lista-vivo-wrap">' +
      '<table class="desp-table desp-table--lista-vivo" aria-label="Seguimiento validador en vivo">' +
      '<thead><tr><th>IDC</th><th>Cliente</th><th>Pasillo</th><th>Estado</th><th>Fecha y hora</th>' +
      (canRemove ? '<th>Validador</th>' : '') +
      '</tr></thead><tbody>' +
      pedidos.map(function (p) {
        return '<tr data-pedido-id="' + esc(p.id) + '">' +
          '<td><strong class="desp-idc">' + esc(formatIdc(p.idc)) + '</strong></td>' +
          '<td class="desp-cliente">' + esc(fmtCliente(p)) + '</td>' +
          '<td>' + esc(p.jaula || '—') + '</td>' +
          '<td>' + estadoBadge(p.estado) + '</td>' +
          '<td class="desp-dt">' + esc(fmtDt(p.createdAt || p.updatedAt)) + '</td>' +
          (canRemove
            ? '<td class="desp-val-actions desp-val-actions--live">' +
              renderValidadorEstadoBtns(p, true, true) +
              ' <button type="button" class="btn btn-ghost desp-btn-archive desp-btn-archive--live" data-pedido-id="' +
              esc(p.id) + '" data-idc="' + esc(formatIdc(p.idc)) + '" data-pasillo="' + esc(p.jaula || '') +
              '" title="Quitar del seguimiento en vivo">Quitar</button></td>'
            : '') +
          '</tr>';
      }).join('') +
      '</tbody></table></div>';
  }

  function renderPanelValidador(data, opts) {
    var sharing = DS.getLiveShareLista(data);
    var pedidos = DS.getPedidosVisiblesValidador(data.pedidos);
    opts = opts || {};
    var canRemove = !!opts.canValidate;
    return '<div class="desp-validador-stack">' +
      '<section class="desp-panel desp-panel--val-share" aria-labelledby="despValShareTitle">' +
      '<header class="desp-panel-head">' +
      '<div><span class="desp-eyebrow">Pantalla externa · Validador</span>' +
      '<h3 id="despValShareTitle">Seguimiento validador en vivo</h3>' +
      '<p class="desp-panel-sub">Lo que comparte en TV · el validador marca <strong>Listo</strong> o cambia estado · <strong>Quitar</strong> saca el IDC</p></div>' +
      (sharing ? '<span class="desp-share-live-tag desp-share-live-tag--lista"><span class="desp-live-dot"></span> EN VIVO</span>' : '') +
      '</header>' +
      '<p class="desp-share-status desp-share-status--lista" id="despListaShareStatus"' + (sharing ? '' : ' hidden') + '>' +
      (sharing ? 'En pantalla TV · ' + esc(String(pedidos.length)) + ' IDC en seguimiento validador' : '') +
      '</p>' +
      renderListaEnVivoSeguimiento(pedidos, canRemove) +
      '<div class="desp-lista-share-actions">' +
      '<button type="button" class="btn desp-action-btn desp-btn-share-lista' + (sharing ? ' is-live' : '') + '" id="despBtnShareLista">' +
      '<span class="desp-action-btn-icon" aria-hidden="true">' + (sharing ? '⏹' : '📺') + '</span>' +
      '<span class="desp-action-btn-text">' + (sharing ? 'Dejar de compartir en pantalla TV' : 'Compartir seguimiento en pantalla TV') + '</span></button>' +
      '</div></section>' +
      renderTablaValidacion(data, opts) +
      '</div>';
  }

  function capturePrepForm(host) {
    var idc = host.querySelector('#despIdc');
    var jaula = host.querySelector('#despPasillo');
    var cliente = host.querySelector('#despCliente');
    var estadoEl = host.querySelector('input[name="prepEstado"]:checked');
    if (!idc && !jaula) return null;
    return {
      idc: idc ? idc.value : '',
      jaula: pasilloValueFromField(jaula, 'prep'),
      cliente: cliente ? cliente.value : '',
      estado: estadoEl ? estadoEl.value : 'en_proceso'
    };
  }

  function restorePrepForm(host, snap) {
    if (!snap || !host) return;
    var idc = host.querySelector('#despIdc');
    var jaula = host.querySelector('#despPasillo');
    var cliente = host.querySelector('#despCliente');
    if (idc) idc.value = snap.idc || '';
    if (cliente) cliente.value = snap.cliente || '';
    if (jaula) {
      jaula.value = snap.jaula || '';
      pasilloTouched.prep = !!snap.jaula;
    }
    if (snap.estado) {
      var radio = host.querySelector('input[name="prepEstado"][value="' + snap.estado + '"]');
      if (radio) radio.checked = true;
    }
  }

  function captureShareForm(host) {
    var idc = host.querySelector('#despShareIdc');
    var jaula = host.querySelector('#despSharePasillo');
    var estadoEl = host.querySelector('input[name="shareEstado"]:checked');
    if (!idc && !jaula) return null;
    return {
      idc: idc ? idc.value : '',
      jaula: pasilloValueFromField(jaula, 'share'),
      estado: estadoEl ? estadoEl.value : 'en_proceso'
    };
  }

  function restoreShareForm(host, snap) {
    if (!snap || !host) return;
    var idc = host.querySelector('#despShareIdc');
    var jaula = host.querySelector('#despSharePasillo');
    if (idc) idc.value = snap.idc || '';
    if (jaula) {
      jaula.value = snap.jaula || '';
      pasilloTouched.share = !!snap.jaula;
    }
    if (snap.estado) {
      var radio = host.querySelector('input[name="shareEstado"][value="' + snap.estado + '"]');
      if (radio) radio.checked = true;
    }
    updateBarcodePanel(host, snap.idc, pasilloTouched.share ? snap.jaula : '', snap.estado);
  }

  function updateShareScreenUi(host, data) {
    var btn = host.querySelector('#despBtnShareScreen');
    var status = host.querySelector('#despShareStatus');
    if (!btn) return;
    data = data || DS.load();
    var live = DS.getLiveShare(data);
    var active = !!(live && live.active);
    btn.classList.toggle('is-live', active);
    btn.innerHTML = active
      ? '<span class="desp-action-btn-icon" aria-hidden="true">⏹</span><span class="desp-action-btn-text">Dejar de compartir código de barras</span>'
      : '<span class="desp-action-btn-icon" aria-hidden="true">📊</span><span class="desp-action-btn-text">Compartir IDC como código de barras</span>';
    if (status) {
      status.hidden = !active;
      status.textContent = active ? liveStatusText(live) : '';
    }
  }

  function updateShareListaUi(host, data) {
    var btn = host.querySelector('#despBtnShareLista');
    var status = host.querySelector('#despListaShareStatus');
    if (!btn) return;
    data = data || DS.load();
    var live = DS.getLiveShareLista(data);
    var active = !!(live && live.active);
    var count = DS.getPedidosVisiblesValidador(data.pedidos).length;
    btn.classList.toggle('is-live', active);
    btn.innerHTML = active
      ? '<span class="desp-action-btn-icon" aria-hidden="true">⏹</span><span class="desp-action-btn-text">Dejar de compartir en pantalla TV</span>'
      : '<span class="desp-action-btn-icon" aria-hidden="true">📺</span><span class="desp-action-btn-text">Compartir seguimiento en pantalla TV</span>';
    if (status) {
      status.hidden = !active;
      status.textContent = active
        ? 'Lista en pantalla · ' + count + ' IDC en validación'
        : '';
    }
  }

  function getPrepFormValues(host) {
    var idcEl = host.querySelector('#despIdc');
    var pasilloEl = host.querySelector('#despPasillo');
    var clienteEl = host.querySelector('#despCliente');
    var estadoEl = host.querySelector('input[name="prepEstado"]:checked');
    return {
      idc: idcEl ? idcEl.value : '',
      jaula: pasilloValueFromField(pasilloEl, 'prep'),
      cliente: clienteEl ? clienteEl.value : '',
      estado: estadoEl ? estadoEl.value : 'en_proceso'
    };
  }

  function getShareFormValues(host) {
    var idcEl = host.querySelector('#despShareIdc');
    var pasilloEl = host.querySelector('#despSharePasillo');
    var estadoEl = host.querySelector('input[name="shareEstado"]:checked');
    return {
      idc: idcEl ? idcEl.value : '',
      jaula: pasilloValueFromField(pasilloEl, 'share'),
      estado: estadoEl ? estadoEl.value : 'en_proceso'
    };
  }

  function renderPedidosMiniShare(list) {
    if (!list.length) {
      return '<p class="desp-muted">Sin pedidos registrados todavía.</p>';
    }
    return '<ul class="desp-mini-list">' + list.map(function (p) {
      return '<li><button type="button" class="desp-mini-idc desp-mini-idc--share" data-idc="' + esc(p.idc) + '" data-estado="' + esc(p.estado) + '">' +
        '<strong>' + esc(formatIdc(p.idc)) + '</strong></button> · Pasillo ' + esc(p.jaula) + ' · ' +
        estadoBadge(p.estado) + '</li>';
    }).join('') + '</ul>';
  }

  function renderPedidosMini(list) {
    if (!list.length) {
      return '<p class="desp-muted">Sin pedidos recientes del preparador.</p>';
    }
    return '<ul class="desp-mini-list">' + list.map(function (p) {
      return '<li><button type="button" class="desp-mini-idc" data-idc="' + esc(p.idc) + '" data-estado="' + esc(p.estado) + '">' +
        '<strong>' + esc(formatIdc(p.idc)) + '</strong></button> · ' +
        esc(fmtCliente(p)) + ' · Pasillo ' + esc(p.jaula) + ' · ' +
        esc(fmtDt(p.createdAt || p.updatedAt)) + ' · ' +
        estadoBadge(p.estado) + '</li>';
    }).join('') + '</ul>';
  }

  function renderJaulaMap(pedidos) {
    pedidos = pedidos || [];
    if (!pedidos.length) {
      return '<p class="desp-muted">Sin IDC en seguimiento del operador.</p>';
    }
    var byJaula = {};
    pedidos.forEach(function (p) {
      var j = String(p.jaula || '—').trim() || '—';
      if (!byJaula[j]) byJaula[j] = [];
      byJaula[j].push(p);
    });
    var keys = Object.keys(byJaula).sort(function (a, b) {
      return a.localeCompare(b, 'es', { numeric: true });
    });
    return '<div class="desp-jaula-grid">' + keys.map(function (jaula) {
      var items = byJaula[jaula];
      return '<article class="desp-jaula-card">' +
        '<header class="desp-jaula-card-head"><span class="desp-jaula-num">Pasillo ' + esc(jaula) + '</span>' +
        '<span class="desp-jaula-count">' + items.length + ' IDC</span></header>' +
        '<ul class="desp-jaula-idc-list">' + items.map(function (p) {
          return '<li><strong class="desp-idc">' + esc(formatIdc(p.idc)) + '</strong> ' +
            '<span class="desp-cliente-inline">' + esc(fmtCliente(p)) + '</span> ' +
            estadoBadge(p.estado) + '<br><small class="desp-muted">' +
            esc(fmtDt(p.createdAt || p.updatedAt)) + '</small></li>';
        }).join('') + '</ul></article>';
    }).join('') + '</div>';
  }

  function renderTablaValidacion(data, opts) {
    var filterEstado = (opts && opts.filterEstado) || '';
    var filterQ = (opts && opts.filterQ) || '';
    var list = DS.filterPedidos(data.pedidos, {
      estado: filterEstado,
      q: filterQ,
      soloValidador: true
    });
    var archivados = DS.getPedidosArchivadosValidador(data.pedidos);
    var canValidate = opts && opts.canValidate;

    return '<section class="desp-panel desp-panel--val" aria-labelledby="despValTitle">' +
      '<header class="desp-panel-head">' +
      '<div><span class="desp-eyebrow">Validador</span>' +
      '<h3 id="despValTitle">Seguimiento en validación</h3>' +
      '<p class="desp-panel-sub">IDC del operador entran como <strong>Pend. carga</strong>. Usted marca <strong>Listo</strong> o quita del seguimiento — nunca quedan En proceso.</p></div>' +
      '<span class="desp-live-badge" title="Sincronización activa"><span class="desp-live-dot"></span> En vivo</span>' +
      '</header>' +
      '<div class="desp-filters">' +
      '<label class="desp-filter"><span>Buscar</span>' +
      '<input type="search" id="despSearch" placeholder="IDC, cliente o pasillo…" value="' + esc(filterQ) + '"></label>' +
      '<label class="desp-filter"><span>Estado</span>' +
      '<select id="despFilterEstado">' +
      '<option value="">Todos (validación)</option>' +
      DS.VALIDADOR_ESTADOS.map(function (id) {
        var e = DS.ESTADOS[id];
        return '<option value="' + esc(id) + '"' + (filterEstado === id ? ' selected' : '') + '>' +
          esc(e.icon) + ' ' + esc(e.label) + '</option>';
      }).join('') +
      '</select></label>' +
      '</div>' +
      '<div class="desp-table-wrap">' +
      '<table class="desp-table" id="despValTable">' +
      '<thead><tr>' +
      '<th>IDC</th><th>Cliente</th><th>Pasillo</th><th>Estado</th><th>Fecha y hora</th>' +
      (canValidate ? '<th>Acción</th>' : '') +
      '<th></th>' +
      '</tr></thead><tbody>' +
      (list.length ? list.map(function (p) { return renderValidadorRow(p, opts); }).join('') :
        '<tr><td colspan="' + (canValidate ? 7 : 6) + '" class="desp-empty-row">No hay IDC en seguimiento validador' +
        (filterEstado || filterQ ? ' con este filtro' : ' — el operador debe enviarlos desde su panel') + '.</td></tr>') +
      '</tbody></table></div>' +
      renderRegistroArchivados(archivados, canValidate) +
      '</section>';
  }

  function renderRegistroArchivados(archivados, canValidate) {
    archivados = archivados || [];
    return '<section class="desp-archivo-section" aria-labelledby="despArchivoTitle">' +
      '<header class="desp-archivo-head">' +
      '<h4 id="despArchivoTitle">Registro de IDC retirados de vista</h4>' +
      '<p class="desp-muted desp-archivo-sub">IDC que el validador quitó · no se muestran al operador · consulta futura</p></header>' +
      '<div class="desp-table-wrap">' +
      '<table class="desp-table desp-table--archivo">' +
      '<thead><tr>' +
      '<th>IDC</th><th>Cliente</th><th>Pasillo (al retirar)</th><th>Estado</th><th>Retirado</th><th>Por</th>' +
      (canValidate ? '<th></th>' : '') +
      '</tr></thead><tbody>' +
      (archivados.length ? archivados.map(function (p) {
        var pasillo = p.archivadoPasillo != null ? p.archivadoPasillo : p.jaula;
        return '<tr data-pedido-id="' + esc(p.id) + '">' +
          '<td><strong class="desp-idc">' + esc(formatIdc(p.idc)) + '</strong></td>' +
          '<td class="desp-cliente">' + esc(fmtCliente(p)) + '</td>' +
          '<td>' + esc(pasillo || '—') + '</td>' +
          '<td>' + estadoBadge(p.estado) + '</td>' +
          '<td class="desp-dt">' + esc(fmtDt(p.archivadoValidadorAt || p.updatedAt)) + '</td>' +
          '<td>' + esc(p.archivadoValidadorBy || '—') + '</td>' +
          (canValidate ? '<td><button type="button" class="btn btn-ghost desp-btn-hist" data-pedido-id="' + esc(p.id) + '">Ver historial</button></td>' : '<td></td>') +
          '</tr>';
      }).join('') :
        '<tr><td colspan="' + (canValidate ? 7 : 6) + '" class="desp-empty-row">Sin IDC retirados todavía.</td></tr>') +
      '</tbody></table></div></section>';
  }

  function renderValidadorRow(p, opts) {
    var canValidate = opts && opts.canValidate;
    return '<tr data-pedido-id="' + esc(p.id) + '">' +
      '<td><strong class="desp-idc">' + esc(formatIdc(p.idc)) + '</strong></td>' +
      '<td class="desp-cliente">' + esc(fmtCliente(p)) + '</td>' +
      '<td>' + esc(p.jaula) + '</td>' +
      '<td>' + estadoBadge(p.estado) + '</td>' +
      '<td class="desp-dt">' + esc(fmtDt(p.createdAt || p.updatedAt)) + '<br><small>' + esc(p.updatedBy) + '</small></td>' +
      '<td class="desp-val-actions">' + renderValidadorEstadoBtns(p, canValidate, false) +
      (canValidate ? ' <button type="button" class="btn btn-ghost desp-btn-archive" data-pedido-id="' + esc(p.id) + '" data-idc="' + esc(formatIdc(p.idc)) + '" data-pasillo="' + esc(p.jaula || '') + '" title="Quitar del seguimiento validador">Quitar</button>' : '') +
      '</td>' +
      '<td><button type="button" class="btn btn-ghost desp-btn-hist" data-pedido-id="' + esc(p.id) + '">Historial</button></td>' +
      '</tr>';
  }

  function renderHistorial(pedido) {
    if (!pedido) return '';
    var rows = (pedido.historial || []).map(function (h) {
      return '<tr><td class="desp-dt">' + esc(fmtDt(h.at)) + '</td>' +
        '<td>' + esc(h.usuario) + '</td>' +
        '<td>' + esc(h.panel) + '</td>' +
        '<td>' + esc(DS.formatHistorialEntry(h)) + '</td>' +
        '<td>' + esc(h.nota || '—') + '</td></tr>';
    }).join('');
    return '<div class="desp-hist-modal-inner">' +
      '<header class="desp-hist-head">' +
      '<h4>Pedido ' + esc(formatIdc(pedido.idc)) + ' · Cliente ' + esc(fmtCliente(pedido)) +
      ' · Pasillo ' + esc(pedido.archivadoPasillo != null ? pedido.archivadoPasillo : pedido.jaula) + '</h4>' +
      '<p>Estado actual: ' + estadoBadge(pedido.estado) + '</p></header>' +
      '<div class="desp-table-wrap"><table class="desp-table desp-table--hist">' +
      '<thead><tr><th>Fecha</th><th>Usuario</th><th>Panel</th><th>Cambio</th><th>Nota</th></tr></thead>' +
      '<tbody>' + (rows || '<tr><td colspan="5" class="desp-empty-row">Sin historial.</td></tr>') + '</tbody></table></div></div>';
  }

  function render(host, data, opts) {
    if (!host) return;
    DS = global.PlatformDespachoStore;
    if (!DS) {
      host.innerHTML = '<div class="module-empty"><p class="module-empty-title">Módulo Despacho no disponible</p></div>';
      return;
    }

    opts = opts || {};
    lastOpts = opts;
    data = data || DS.load();
    var despachoArea = opts.despachoArea === 'validador' ? 'validador' : 'preparador';
    var canValidate = despachoArea === 'validador' || !!opts.canValidate;
    opts = Object.assign({}, opts, { canValidate: canValidate, despachoArea: despachoArea });
    var screen = resolveScreenForRole(opts.screen, despachoArea);
    if (opts.onScreenChange && screen !== normalizeScreen(opts.screen)) {
      opts.onScreenChange(screen);
    }
    var userName = (opts.user && (opts.user.name || opts.user.username)) || 'Usuario';

    if (unbindSync) {
      unbindSync();
      unbindSync = null;
    }

    resetPasilloTouched();

    var counts = DS.countByEstado(data.pedidos, {
      soloPreparador: despachoArea === 'preparador',
      soloValidador: despachoArea === 'validador'
    });

    host.innerHTML =
      '<div class="desp-dashboard" id="despDashboard">' +
      '<header class="desp-dash-header">' +
      '<div><span class="desp-dash-eyebrow">Almacén Central DC · Despacho</span>' +
      '<h2 class="desp-dash-title">Seguimiento IDC · Pasillo</h2>' +
      '<p class="desp-dash-sub">Operador registra (En proceso/Facturado) → validador automático · ' +
      esc(String(DS.getPedidosVisiblesValidador(data.pedidos).length)) + ' en validador</p></div>' +
      flujoHtml() +
      '</header>' +
      kpiStrip(counts, despachoArea) +
      renderNavEntrada(screen, data, opts) +
      '<div class="desp-panels">' +
      (screen === 'barcode'
        ? renderPanelBarcodeShare(data)
        : screen === 'validador'
          ? renderPanelValidador(data, opts)
          : renderPanelRegistroComun(data)) +
      '</div>' +
      '<div class="desp-hist-overlay" id="despHistOverlay" hidden aria-hidden="true">' +
      '<div class="desp-hist-dialog" role="dialog" aria-labelledby="despHistTitle">' +
      '<button type="button" class="desp-hist-close" id="despHistClose" aria-label="Cerrar">×</button>' +
      '<div id="despHistBody"></div></div></div>' +
      '</div>';

    bindEvents(host, data, opts, userName);
    handleVoiceAlerts(data, despachoArea);

    if (screen === 'barcode' && host.querySelector('#despBarcodePanel')) {
      var shareIdc = host.querySelector('#despShareIdc');
      var sharePasillo = host.querySelector('#despSharePasillo');
      var shareEstadoEl = host.querySelector('input[name="shareEstado"]:checked');
      updateBarcodePanel(host,
        shareIdc ? shareIdc.value : '',
        pasilloValueFromField(sharePasillo, 'share'),
        shareEstadoEl ? shareEstadoEl.value : 'en_proceso');
      updateShareScreenUi(host, data);
    }

    if (screen === 'validador') {
      updateShareListaUi(host, data);
    }

    unbindSync = DS.bindSync(function (fresh) {
      if (!host.isConnected) return;
      handleVoiceAlerts(fresh, lastOpts && lastOpts.despachoArea);
      var formSnap = screen === 'barcode' ? captureShareForm(host) : (screen === 'registro' ? capturePrepForm(host) : null);
      var searchEl = host.querySelector('#despSearch');
      var filtEl = host.querySelector('#despFilterEstado');
      render(host, fresh, Object.assign({}, lastOpts, {
        screen: screen,
        filterQ: searchEl ? searchEl.value : (opts.filterQ || ''),
        filterEstado: filtEl ? filtEl.value : (opts.filterEstado || '')
      }));
      if (screen === 'barcode') restoreShareForm(host, formSnap);
      else if (screen === 'registro') restorePrepForm(host, formSnap);
      if (screen === 'barcode') updateShareScreenUi(host, fresh);
      if (screen === 'validador') updateShareListaUi(host, fresh);
    });
  }

  function bindEvents(host, data, opts, userName) {
    function onSharePasilloCleared() {
      var estadoEl = host.querySelector('input[name="shareEstado"]:checked');
      var idcEl = host.querySelector('#despShareIdc');
      updateBarcodePanel(host,
        idcEl ? idcEl.value : '',
        '',
        estadoEl ? estadoEl.value : 'en_proceso');
      if (DS.isLiveShareActive()) {
        var vals = getShareFormValues(host);
        DS.syncLiveShare(vals.idc, '', vals.estado, userName);
      }
    }

    guardPasilloField(host.querySelector('#despPasillo'), 'prep');
    guardPasilloField(host.querySelector('#despSharePasillo'), 'share', onSharePasilloCleared);

    host.querySelectorAll('[data-desp-screen]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var next = btn.getAttribute('data-desp-screen');
        if (!next || next === normalizeScreen(opts.screen || 'registro')) return;
        if (opts.onScreenChange) opts.onScreenChange(next);
        render(host, DS.load(), Object.assign({}, opts, { screen: next }));
      });
    });

    var form = host.querySelector('#despPrepForm');
    if (form) {
      var btnUpdate = host.querySelector('#despBtnUpdateIdc');
      if (btnUpdate) {
        btnUpdate.addEventListener('click', function () {
          var vals = getPrepFormValues(host);
          var res = DS.registrarPedido(vals.idc, vals.jaula, vals.estado, userName, vals.cliente);
          if (!res.ok) {
            toast(res.error, 'warn');
            return;
          }
          if (!res.updated) announceNuevoIdcPedido(res.pedido);
          toast(res.updated ? 'IDC actualizado — en seguimiento validador' : 'IDC registrado — en seguimiento validador', 'success');
          var snap = capturePrepForm(host);
          render(host, res.data, opts);
          restorePrepForm(host, snap);
        });
      }
    }

    var shareForm = host.querySelector('#despShareForm');
    if (shareForm) {
      var shareIdcInput = host.querySelector('#despShareIdc');
      var sharePasilloInput = host.querySelector('#despSharePasillo');
      var livePushTimer = null;

      function pushLiveToExternal() {
        if (!DS.isLiveShareActive()) return;
        var vals = getShareFormValues(host);
        DS.syncLiveShare(vals.idc, vals.jaula, vals.estado, userName);
      }

      function syncSharePreview() {
        var estadoEl = host.querySelector('input[name="shareEstado"]:checked');
        updateBarcodePanel(host,
          shareIdcInput ? shareIdcInput.value : '',
          pasilloValueFromField(sharePasilloInput, 'share'),
          estadoEl ? estadoEl.value : 'en_proceso');
        clearTimeout(livePushTimer);
        livePushTimer = setTimeout(pushLiveToExternal, 120);
      }

      if (shareIdcInput) shareIdcInput.addEventListener('input', syncSharePreview);
      if (sharePasilloInput) sharePasilloInput.addEventListener('input', syncSharePreview);
      host.querySelectorAll('input[name="shareEstado"]').forEach(function (r) {
        r.addEventListener('change', syncSharePreview);
      });

      var btnShare = host.querySelector('#despBtnShareScreen');
      if (btnShare) {
        btnShare.addEventListener('click', function () {
          var vals = getShareFormValues(host);
          if (DS.isLiveShareActive()) {
            DS.stopLiveShare(userName);
            updateShareScreenUi(host, DS.load());
            toast('Pantalla externa desactivada', 'info');
            return;
          }
          var res = DS.startLiveShare(vals.idc, vals.jaula, vals.estado, userName);
          if (!res.ok) {
            toast(res.error, 'warn');
            return;
          }
          ensureDisplayWindow('barcode');
          DS.syncLiveShare(vals.idc, vals.jaula, vals.estado, userName);
          updateShareScreenUi(host, res.data);
          toast('Pantalla externa activa — lo que escriba se ve en vivo', 'success');
        });
      }
    }

    var btnShareLista = host.querySelector('#despBtnShareLista');
    if (btnShareLista) {
      btnShareLista.addEventListener('click', function () {
        var res = DS.toggleLiveShareLista(userName);
        if (!res.ok) {
          toast(res.error, 'warn');
          return;
        }
        if (DS.isLiveShareListaActive(res.data)) {
          ensureDisplayWindow('lista');
          toast('Seguimiento en pantalla TV', 'success');
        } else {
          toast('Pantalla TV desactivada', 'info');
        }
        updateShareListaUi(host, res.data);
      });
    }

    host.querySelectorAll('.desp-mini-idc').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var idc = btn.getAttribute('data-idc');
        var estado = btn.getAttribute('data-estado') || 'en_proceso';
        var isShare = btn.classList.contains('desp-mini-idc--share');
        if (isShare) {
          var shareIdcEl = host.querySelector('#despShareIdc');
          var sharePasilloEl = host.querySelector('#despSharePasillo');
          if (shareIdcEl) shareIdcEl.value = idc || '';
          var shareRadio = host.querySelector('input[name="shareEstado"][value="' + estado + '"]');
          if (shareRadio) shareRadio.checked = true;
          updateBarcodePanel(host, idc, pasilloValueFromField(sharePasilloEl, 'share'), estado);
          if (DS.isLiveShareActive()) {
            var vals = getShareFormValues(host);
            DS.syncLiveShare(vals.idc, vals.jaula, vals.estado, userName);
          }
          return;
        }
        var idcEl = host.querySelector('#despIdc');
        if (idcEl) idcEl.value = idc || '';
        var radio = host.querySelector('input[name="prepEstado"][value="' + estado + '"]');
        if (radio) radio.checked = true;
      });
    });

    host.querySelectorAll('.desp-btn-set-estado').forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (btn.disabled) return;
        var nuevo = btn.getAttribute('data-estado');
        var pedidoId = btn.getAttribute('data-pedido-id');
        if (!nuevo || !pedidoId) return;
        var res = DS.cambiarEstado(pedidoId, nuevo, userName);
        if (!res.ok) {
          toast(res.error, 'warn');
          return;
        }
        var label = DS.ESTADOS[nuevo] ? DS.ESTADOS[nuevo].short : nuevo;
        toast('Estado: ' + label, 'success');
        render(host, res.data, opts);
      });
    });

    host.querySelectorAll('.desp-estado-select').forEach(function (sel) {
      sel.addEventListener('change', function () {
        var nuevo = sel.value;
        if (!nuevo) return;
        var pedidoId = sel.getAttribute('data-pedido-id');
        var res = DS.cambiarEstado(pedidoId, nuevo, userName);
        if (!res.ok) {
          toast(res.error, 'warn');
          sel.value = '';
          return;
        }
        toast('Estado actualizado: ' + DS.ESTADOS[nuevo].short, 'success');
        render(host, res.data, opts);
      });
    });

    var searchEl = host.querySelector('#despSearch');
    var filtEl = host.querySelector('#despFilterEstado');
    function applyFilters() {
      render(host, DS.load(), Object.assign({}, opts, {
        filterQ: searchEl ? searchEl.value : '',
        filterEstado: filtEl ? filtEl.value : ''
      }));
    }
    if (searchEl) {
      var debounce;
      searchEl.addEventListener('input', function () {
        clearTimeout(debounce);
        debounce = setTimeout(applyFilters, 220);
      });
    }
    if (filtEl) filtEl.addEventListener('change', applyFilters);

    host.querySelectorAll('.desp-btn-archive').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var pedidoId = btn.getAttribute('data-pedido-id');
        var idc = btn.getAttribute('data-idc') || '';
        var pasillo = btn.getAttribute('data-pasillo') || '';
        var msg = '¿Quitar ' + idc + ' del seguimiento validador?';
        if (pasillo) msg += ' Pasillo: ' + pasillo + '.';
        msg += ' Quedará en el registro histórico.';
        if (!global.confirm(msg)) return;
        var res = DS.archivarDeVistaValidador(pedidoId, userName);
        if (!res.ok) {
          toast(res.error, 'warn');
          return;
        }
        toast('IDC retirado de vista — guardado en registro histórico', 'success');
        render(host, res.data, opts);
      });
    });

    host.querySelectorAll('.desp-btn-hist').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-pedido-id');
        var pedido = (data.pedidos || []).find(function (p) { return p.id === id; });
        if (!pedido) pedido = DS.load().pedidos.find(function (p) { return p.id === id; });
        var overlay = host.querySelector('#despHistOverlay');
        var body = host.querySelector('#despHistBody');
        if (overlay && body) {
          body.innerHTML = renderHistorial(pedido);
          overlay.hidden = false;
          overlay.setAttribute('aria-hidden', 'false');
        }
      });
    });

    var closeHist = host.querySelector('#despHistClose');
    var overlay = host.querySelector('#despHistOverlay');
    if (closeHist && overlay) {
      closeHist.addEventListener('click', function () {
        overlay.hidden = true;
        overlay.setAttribute('aria-hidden', 'true');
      });
      overlay.addEventListener('click', function (ev) {
        if (ev.target === overlay) {
          overlay.hidden = true;
          overlay.setAttribute('aria-hidden', 'true');
        }
      });
    }
  }

  function toast(msg, type) {
    if (global.PlatformToast) {
      if (type === 'success') global.PlatformToast.success(msg, 2800);
      else if (type === 'warn') global.PlatformToast.warning(msg, 4000);
      else global.PlatformToast.info(msg, 3000);
    }
  }

  function destroy() {
    if (unbindSync) {
      unbindSync();
      unbindSync = null;
    }
  }

  global.PlatformDespachoUI = {
    render: render,
    destroy: destroy
  };
})(typeof window !== 'undefined' ? window : this);
