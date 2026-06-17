/**
 * Control de Turnos — vista del chofer (sin login)
 */
(function (global) {
  'use strict';

  var C = function () { return global.PlatformTurnosCore; };
  var S = function () { return global.PlatformTurnosStore; };
  var screen = 'menu';
  var selectedTipo = null;

  function $(id) { return document.getElementById(id); }

  function esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function render() {
    var host = $('turnosChoferMain');
    if (!host) return;
    if (screen === 'menu') host.innerHTML = renderMenu();
    else if (screen === 'form') host.innerHTML = renderForm(selectedTipo);
    else if (screen === 'success') host.innerHTML = renderSuccess(lastEntry);
  }

  var lastEntry = null;

  function renderMenu() {
    return (
      '<section class="turnos-chofer-section">' +
      '<p class="turnos-chofer-lead">Seleccione el trámite que necesita hoy:</p>' +
      '<div class="turnos-service-grid">' +
      serviceCard(C().TIPOS.DESPACHO, '📦', 'Despacho de facturas', 'Entrega con ID de carga') +
      serviceCard(C().TIPOS.LIQUIDACION, '🚛', 'Liquidación de facturas', 'Cierre por cantidad de viajes') +
      serviceCard(C().TIPOS.NOTA_CREDITO, '📝', 'Nota de crédito', 'Solicitud para autorización') +
      '</div></section>'
    );
  }

  function serviceCard(tipo, icon, title, desc) {
    return (
      '<button type="button" class="turnos-service-card" data-chofer-tipo="' + esc(tipo) + '">' +
      '<span class="turnos-service-icon" aria-hidden="true">' + icon + '</span>' +
      '<span class="turnos-service-title">' + esc(title) + '</span>' +
      '<span class="turnos-service-desc">' + esc(desc) + '</span></button>'
    );
  }

  function renderForm(tipo) {
    var label = C().TIPO_LABELS[tipo] || 'Trámite';
    var remembered = esc(C().getRememberedChoferName());
    var extra = '';

    if (tipo === C().TIPOS.DESPACHO) {
      extra =
        '<label class="turnos-field"><span>ID(s) de carga</span>' +
        '<input class="turnos-input turnos-input--lg" id="turnosFieldCarga" type="text" required maxlength="120" placeholder="Ej: CARGA-88421 o varios separados por coma"></label>';
    } else if (tipo === C().TIPOS.LIQUIDACION) {
      extra =
        '<label class="turnos-field"><span>Cantidad de viajes</span>' +
        '<input class="turnos-input turnos-input--lg" id="turnosFieldViajes" type="number" min="1" max="99" required inputmode="numeric" placeholder="Ej: 3"></label>';
    } else if (tipo === C().TIPOS.NOTA_CREDITO) {
      extra = '<p class="turnos-hint turnos-hint--info">El turno quedará pendiente hasta que personal autorizado lo confirme y asiente.</p>';
    }

    return (
      '<section class="turnos-chofer-section turnos-form-panel">' +
      '<button type="button" class="turnos-back-btn" data-chofer-back>Volver</button>' +
      '<h2 class="turnos-form-title">' + esc(label) + '</h2>' +
      '<form id="turnosChoferForm" class="turnos-chofer-form" novalidate>' +
      '<label class="turnos-field"><span>Nombre del chofer</span>' +
      '<input class="turnos-input turnos-input--lg" id="turnosFieldChofer" type="text" required maxlength="80" autocomplete="name" value="' + remembered + '" placeholder="Su nombre completo"></label>' +
      extra +
      '<p id="turnosChoferFormError" class="turnos-form-error" hidden role="alert"></p>' +
      '<button type="submit" class="turnos-btn turnos-btn--primary turnos-btn--xl turnos-btn--hero">Generar mi turno</button>' +
      '</form></section>'
    );
  }

  function renderSuccess(entry) {
    if (!entry) return renderMenu();
    var notaHint = entry.tipo === C().TIPOS.NOTA_CREDITO
      ? '<p class="turnos-hint turnos-hint--info">Estado inicial: <strong>Pendiente</strong>. Un supervisor lo confirmará y asentará.</p>'
      : '<p class="turnos-hint">Estado inicial: <strong>Pendiente</strong>. Espere su llamado en pantalla.</p>';

    return (
      '<section class="turnos-chofer-section turnos-success-screen">' +
      '<div class="turnos-success-icon">✓</div>' +
      '<p class="turnos-success-title">¡Turno generado correctamente!</p>' +
      '<p class="turnos-success-turno turnos-mono">' + esc(entry.turno) + '</p>' +
      '<p class="turnos-success-meta">' + esc(C().TIPO_LABELS[entry.tipo]) + '</p>' +
      '<p class="turnos-success-detail">' + esc(entry.detalle) + '</p>' +
      '<p class="turnos-success-time">' + esc(entry.fecha) + ' · ' + esc(entry.hora) + '</p>' +
      notaHint +
      '<button type="button" class="turnos-btn turnos-btn--primary turnos-btn--xl" data-chofer-new>Nuevo turno</button>' +
      '</section>'
    );
  }

  function showError(msg) {
    var el = $('turnosChoferFormError');
    if (!el) return;
    el.textContent = msg || '';
    el.hidden = !msg;
  }

  function submitForm(ev) {
    ev.preventDefault();
    showError('');
    var chofer = ($('turnosFieldChofer') && $('turnosFieldChofer').value || '').trim();
    if (!chofer) {
      showError('Escriba su nombre.');
      return;
    }

    var payload = { tipo: selectedTipo, choferNombre: chofer };

    if (selectedTipo === C().TIPOS.DESPACHO) {
      payload.idsCarga = ($('turnosFieldCarga') && $('turnosFieldCarga').value || '').trim();
      if (!payload.idsCarga) {
        showError('Indique el ID de carga.');
        return;
      }
    } else if (selectedTipo === C().TIPOS.LIQUIDACION) {
      var viajes = parseInt(($('turnosFieldViajes') && $('turnosFieldViajes').value) || '', 10);
      if (!viajes || viajes < 1) {
        showError('Indique la cantidad de viajes.');
        return;
      }
      payload.cantidadViajes = viajes;
    }

    var result = S().addTurn(payload);
    if (!result.ok) {
      showError(result.msg);
      return;
    }
    lastEntry = result.entry;
    screen = 'success';
    render();
  }

  function bind() {
    var root = $('turnosChoferRoot');
    if (!root || root.dataset.bound) return;
    root.dataset.bound = '1';

    root.addEventListener('click', function (ev) {
      var tipoBtn = ev.target.closest('[data-chofer-tipo]');
      if (tipoBtn) {
        selectedTipo = tipoBtn.getAttribute('data-chofer-tipo');
        screen = 'form';
        render();
        return;
      }
      if (ev.target.closest('[data-chofer-back]')) {
        screen = 'menu';
        selectedTipo = null;
        render();
        return;
      }
      if (ev.target.closest('[data-chofer-new]')) {
        screen = 'menu';
        selectedTipo = null;
        lastEntry = null;
        render();
      }
    });

    root.addEventListener('submit', function (ev) {
      if (ev.target.id === 'turnosChoferForm') submitForm(ev);
    });
  }

  function start() {
    S().load();
    bind();
    screen = 'menu';
    render();
    setInterval(function () {
      var el = $('turnosChoferClockTime');
      if (!el) return;
      el.textContent = new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
    }, 1000);
  }

  function show() {
    var root = $('turnosChoferRoot');
    if (root) root.classList.remove('is-hidden');
  }

  function hide() {
    var root = $('turnosChoferRoot');
    if (root) root.classList.add('is-hidden');
  }

  global.PlatformTurnosChofer = { start: start, show: show, hide: hide };
})(typeof window !== 'undefined' ? window : this);
