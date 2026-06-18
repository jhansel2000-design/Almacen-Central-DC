/**
 * Control de Turnos — vista del chofer (sin login)
 */
(function (global) {
  'use strict';

  var C = function () { return global.PlatformTurnosCore; };
  var S = function () { return global.PlatformTurnosStore; };
  var screen = 'menu';
  var selectedTipo = null;
  var lastEntry = null;
  var unsub = null;
  var vibrateTimer = null;
  var Call = function () { return global.PlatformTurnosChoferCall; };

  function $(id) { return document.getElementById(id); }

  function esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  var ICON_V = '?v=11';

  var ICONS = {
    despacho_facturas: 'assets/img/icon-turnos-despacho.svg' + ICON_V,
    liquidacion_facturas: 'assets/img/icon-turnos-liquidacion.svg' + ICON_V,
    nota_credito: 'assets/img/icon-turnos-nota-credito.svg' + ICON_V
  };

  function estadoLabel(entry) {
    if (!entry) return '';
    if (entry.convocadoAt && C().isTurnActive(entry)) {
      return 'Convocado — pase a ' + C().ventanaLabel(entry.tipo);
    }
    return 'Estado: ' + entry.estado.replace(/_/g, ' ');
  }

  function render() {
    var host = $('turnosChoferMain');
    if (!host) return;
    if (screen === 'menu') host.innerHTML = renderMenu();
    else if (screen === 'form') host.innerHTML = renderForm(selectedTipo);
    else if (screen === 'success') host.innerHTML = renderSuccess(lastEntry);
    ensureCallOverlay();
  }

  function renderMenu() {
    var offline = !S().getState().live
      ? '<p class="turnos-offline-banner">Sin conexión con la nube. Los turnos requieren internet.</p>'
      : '';
    var ref = C().getMyTurnRef();
    var active = ref && ref.id ? S().findById(ref.id) : null;
    if (!active || !C().isTurnActive(active)) {
      active = S().findActiveByChofer(C().getRememberedChoferName());
    }
    var resume = '';
    if (active && active.turno) {
      resume =
        '<div class="turnos-my-turn-banner">' +
        '<p class="turnos-my-turn-label">Su turno activo</p>' +
        '<p class="turnos-my-turn-number turnos-mono">' + esc(active.turno) + '</p>' +
        '<button type="button" class="turnos-btn turnos-btn--secondary turnos-btn--xl" data-chofer-resume>Ver mi turno</button>' +
        '</div>';
    }
    return (
      offline +
      resume +
      '<section class="turnos-chofer-section">' +
      '<p class="turnos-chofer-lead">Seleccione el trámite que necesita hoy:</p>' +
      '<div class="turnos-service-grid">' +
      serviceCard(C().TIPOS.DESPACHO, ICONS.despacho_facturas, 'Despacho de facturas', 'Entrega con ID de carga') +
      serviceCard(C().TIPOS.LIQUIDACION, ICONS.liquidacion_facturas, 'Liquidación de facturas', 'Cierre por cantidad de viajes') +
      serviceCard(C().TIPOS.NOTA_CREDITO, ICONS.nota_credito, 'Nota de crédito', 'Solicitud para autorización') +
      '</div></section>'
    );
  }

  function serviceCard(tipo, iconSrc, title, desc) {
    return (
      '<button type="button" class="turnos-service-card" data-chofer-tipo="' + esc(tipo) + '">' +
      '<span class="turnos-service-icon"><img src="' + esc(iconSrc) + '" alt="" width="52" height="52" loading="lazy"></span>' +
      '<span class="turnos-service-text">' +
      '<span class="turnos-service-title">' + esc(title) + '</span>' +
      '<span class="turnos-service-desc">' + esc(desc) + '</span></span></button>'
    );
  }

  function renderForm(tipo) {
    var label = C().TIPO_LABELS[tipo] || 'Trámite';
    var remembered = esc(C().getRememberedChoferName());
    var rememberedCompania = C().getRememberedChoferCompania();
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

    var companiaOpts = C().COMPANIAS_CHOFER.map(function (c) {
      var sel = c === rememberedCompania ? ' selected' : '';
      return '<option value="' + esc(c) + '"' + sel + '>' + esc(c) + '</option>';
    }).join('');
    var companiaOtra = rememberedCompania && C().COMPANIAS_CHOFER.indexOf(rememberedCompania) < 0;

    return (
      '<section class="turnos-chofer-section turnos-form-panel">' +
      '<button type="button" class="turnos-back-btn" data-chofer-back>Volver</button>' +
      '<h2 class="turnos-form-title">' + esc(label) + '</h2>' +
      '<form id="turnosChoferForm" class="turnos-chofer-form" novalidate>' +
      '<label class="turnos-field"><span>Compañía de transporte</span>' +
      '<select class="turnos-input turnos-input--lg" id="turnosFieldCompania" required>' + companiaOpts + '</select></label>' +
      '<div id="turnosCompaniaOtraWrap" class="turnos-field"' + (companiaOtra ? '' : ' hidden') + '>' +
      '<span>Nombre de la compañía</span>' +
      '<input class="turnos-input turnos-input--lg" id="turnosFieldCompaniaOtra" type="text" maxlength="80" value="' + (companiaOtra ? esc(rememberedCompania) : '') + '" placeholder="Escriba el nombre de la compañía"></div>' +
      '<label class="turnos-field"><span>Nombre del chofer</span>' +
      '<input class="turnos-input turnos-input--lg" id="turnosFieldChofer" type="text" required maxlength="80" autocomplete="name" value="' + remembered + '" placeholder="Su nombre completo"></label>' +
      extra +
      '<div class="turnos-priority-block">' +
      '<label class="turnos-priority-toggle">' +
      '<input type="checkbox" id="turnosFieldPrioridad" class="turnos-priority-check"> ' +
      '<span>Turno <strong>prioritario</strong> (requiere PIN especial)</span></label>' +
      '<div id="turnosPriorityPinWrap" class="turnos-priority-pin" hidden>' +
      '<label class="turnos-field"><span>PIN prioritario</span>' +
      '<input class="turnos-input turnos-input--lg" id="turnosFieldAdminPin" type="password" inputmode="numeric" autocomplete="off" maxlength="10" placeholder="DDMMAAAA"></label>' +
      '<p class="turnos-hint turnos-hint--info">Fecha de nacimiento de <strong>Juan Pablo Duarte</strong> en formato DDMMAAAA (día, mes y año, sin barras).</p>' +
      '</div></div>' +
      '<p id="turnosChoferFormError" class="turnos-form-error" hidden role="alert"></p>' +
      '<button type="submit" class="turnos-btn turnos-btn--primary turnos-btn--xl turnos-btn--hero">Generar mi turno</button>' +
      '</form></section>'
    );
  }

  function renderSuccess(entry) {
    if (!entry) return renderMenu();
    var convocado = entry.convocadoAt
      ? '<div class="turnos-call-inline"><strong>¡Es su turno!</strong> Pase a <span>' + esc(C().ventanaLabel(entry.tipo)) + '</span></div>'
      : '';
    var notaHint = entry.tipo === C().TIPOS.NOTA_CREDITO
      ? '<p class="turnos-hint turnos-hint--info">Flujo: Pendiente → Confirmado → Asentado.</p>'
      : '<p class="turnos-hint">Cuando lo convoquen escuchará un mensaje de voz y una alarma. Mantenga esta página abierta en el celular o active las notificaciones.</p>';
    var prio = entry.prioridad
      ? '<div class="turnos-call-inline turnos-call-inline--priority"><strong>Turno prioritario</strong>' +
        (entry.horaLimite ? ' · Límite ' + esc(entry.horaLimite) : ' · El administrador definirá la hora límite') +
        '</div>'
      : '';
    var cancelBtn = C().canCancelByChofer(entry)
      ? '<button type="button" class="turnos-btn turnos-btn--danger turnos-btn--xl" data-chofer-cancel>Cancelar mi turno</button>' +
        '<p class="turnos-hint">Al cancelar podrá solicitar un turno nuevo. El registro quedará en administración.</p>'
      : '';

    return (
      '<section class="turnos-chofer-section turnos-success-screen">' +
      '<div class="turnos-success-icon">✓</div>' +
      '<p class="turnos-success-title">Su turno está registrado</p>' +
      '<p class="turnos-success-turno turnos-mono">' + esc(entry.turno) + '</p>' +
      '<p class="turnos-success-meta"><strong>' + esc(entry.choferCompania || '—') + '</strong> · ' + esc(C().TIPO_LABELS[entry.tipo]) + '</p>' +
      '<p class="turnos-success-detail">' + esc(entry.detalle) + '</p>' +
      '<p class="turnos-success-time">' + esc(C().formatFechaHora(entry)) + '</p>' +
      '<p class="turnos-success-status">' + esc(estadoLabel(entry)) + '</p>' +
      convocado +
      prio +
      notaHint +
      '<div class="turnos-chofer-notif-prompt" id="turnosChoferNotifPrompt">' +
      '<p class="turnos-hint turnos-hint--info">Para que suene fuerte aunque cambie de aplicación, active las notificaciones del navegador.</p>' +
      '<button type="button" class="turnos-btn turnos-btn--secondary turnos-btn--xl" id="turnosChoferNotifBtn">Activar alertas en el celular</button></div>' +
      '<p class="turnos-hint">Puede cerrar esta página; al volver verá el mismo turno.</p>' +
      cancelBtn +
      '</section>'
    );
  }

  function cancelMyTurn() {
    var ref = C().getMyTurnRef();
    if (!ref || !ref.id) return;
    var entry = S().findById(ref.id);
    if (!entry || !C().canCancelByChofer(entry)) return;
    if (!confirm('¿Cancelar el turno ' + entry.turno + '? Podrá generar uno nuevo después.')) return;
    var choferName = entry.choferNombre || C().getRememberedChoferName() || 'chofer';
    S().cancelTurn(ref.id, choferName).then(function (result) {
      if (!result.ok) {
        alert(result.msg || 'No se pudo cancelar.');
        return;
      }
      hideCallOverlay();
      C().clearMyTurn();
      lastEntry = null;
      screen = 'menu';
      render();
    });
  }

  function ensureCallOverlay() {
    var root = $('turnosChoferRoot');
    if (!root) return;
    var overlay = $('turnosCallOverlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'turnosCallOverlay';
      overlay.className = 'turnos-call-overlay is-hidden';
      overlay.setAttribute('role', 'alertdialog');
      overlay.setAttribute('aria-live', 'assertive');
      overlay.innerHTML =
        '<div class="turnos-call-card">' +
        '<p class="turnos-call-eyebrow">¡Ya es su turno!</p>' +
        '<p class="turnos-call-turno turnos-mono" id="turnosCallTurno">T-0000</p>' +
        '<p class="turnos-call-ventana" id="turnosCallVentana">Pase a la ventana</p>' +
        '<p class="turnos-call-detail" id="turnosCallDetail"></p>' +
        '<p class="turnos-call-voice-hint">Escuche el mensaje y la alarma. Pase de inmediato.</p>' +
        '<button type="button" class="turnos-btn turnos-btn--primary turnos-btn--xl" data-call-dismiss>Entendido — voy a la ventana</button>' +
        '</div>';
      root.appendChild(overlay);
    }
  }

  function showCallOverlay(entry) {
    if (!entry || !entry.convocadoAt) return;
    if (C().getConvocadoSeen(entry.id) >= entry.convocadoAt) return;
    ensureCallOverlay();
    var overlay = $('turnosCallOverlay');
    var turnoEl = $('turnosCallTurno');
    var ventanaEl = $('turnosCallVentana');
    var detailEl = $('turnosCallDetail');
    if (turnoEl) turnoEl.textContent = entry.turno;
    if (ventanaEl) ventanaEl.textContent = 'Pase a la ' + C().ventanaLabel(entry.tipo);
    if (detailEl) detailEl.textContent = entry.detalle || '';
    if (overlay) {
      overlay.classList.remove('is-hidden');
      overlay.classList.add('turnos-call-overlay--ringing');
    }
    if (Call() && Call().activate(entry)) {
      if (vibrateTimer) clearInterval(vibrateTimer);
      vibrateTimer = setInterval(function () {
        if (!overlay || overlay.classList.contains('is-hidden')) {
          clearInterval(vibrateTimer);
          vibrateTimer = null;
          return;
        }
        try {
          if (navigator.vibrate) navigator.vibrate([300, 100, 300]);
        } catch (e) { /* noop */ }
      }, 5000);
    }
  }

  function hideCallOverlay() {
    var overlay = $('turnosCallOverlay');
    if (overlay) {
      overlay.classList.add('is-hidden');
      overlay.classList.remove('turnos-call-overlay--ringing');
    }
    if (vibrateTimer) {
      clearInterval(vibrateTimer);
      vibrateTimer = null;
    }
    if (Call()) Call().dismiss((Call().getActiveEntry && Call().getActiveEntry()) || lastEntry);
  }

  function syncMyTurnFromStore() {
    var ref = C().getMyTurnRef();
    var entry = ref && ref.id ? S().findById(ref.id) : null;
    if (!entry || !C().isTurnActive(entry)) {
      entry = S().findActiveByChofer(C().getRememberedChoferName());
    }
    if (!entry) {
      if (ref && ref.id) C().clearMyTurn();
      if (screen === 'success') {
        screen = 'menu';
        lastEntry = null;
      }
      return;
    }
    if (!C().isTurnActive(entry)) {
      C().clearMyTurn();
      if (screen === 'success' && lastEntry && lastEntry.id === entry.id) {
        screen = 'menu';
        lastEntry = null;
      }
      return;
    }
    C().saveMyTurn(entry);
    lastEntry = entry;
    screen = 'success';
    showCallOverlay(entry);
    render();
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
    if (!S().getState().live) {
      showError('Sin conexión con la nube. Verifique internet e intente de nuevo.');
      return;
    }
    var ref = C().getMyTurnRef();
    if (ref && ref.id) {
      var active = S().findById(ref.id);
      if (active && C().isTurnActive(active)) {
        showError('Ya tiene un turno activo (' + active.turno + '). Use "Ver mi turno".');
        return;
      }
    }
    var chofer = ($('turnosFieldChofer') && $('turnosFieldChofer').value || '').trim();
    if (!chofer) {
      showError('Escriba su nombre.');
      return;
    }
    var companiaSel = $('turnosFieldCompania') && $('turnosFieldCompania').value;
    var compania = companiaSel === 'Otra'
      ? ($('turnosFieldCompaniaOtra') && $('turnosFieldCompaniaOtra').value || '').trim()
      : String(companiaSel || '').trim();
    if (!compania) {
      showError('Indique la compañía de transporte.');
      return;
    }

    var payload = { tipo: selectedTipo, choferNombre: chofer, choferCompania: compania };

    if (selectedTipo === C().TIPOS.DESPACHO) {
      payload.idsCarga = ($('turnosFieldCarga') && $('turnosFieldCarga').value || '').trim();
      if (!payload.idsCarga) {
        showError('Indique el ID de carga.');
        return;
      }
    } else     if (selectedTipo === C().TIPOS.LIQUIDACION) {
      var viajes = parseInt(($('turnosFieldViajes') && $('turnosFieldViajes').value) || '', 10);
      if (!viajes || viajes < 1) {
        showError('Indique la cantidad de viajes.');
        return;
      }
      payload.cantidadViajes = viajes;
    }

    var prioridad = !!( $('turnosFieldPrioridad') && $('turnosFieldPrioridad').checked);
    if (prioridad) {
      var pin = ($('turnosFieldAdminPin') && $('turnosFieldAdminPin').value || '').trim();
      if (!pin) {
        showError('Indique el PIN para turno prioritario.');
        return;
      }
      if (!C().verifyAdminPin(pin)) {
        showError('PIN incorrecto. Use la fecha de nacimiento de Juan Pablo Duarte (DDMMAAAA).');
        return;
      }
      payload.prioridad = true;
      payload.prioridadAutorizadaPor = 'admin-pin';
    }

    var btn = ev.target.querySelector('[type="submit"]');
    if (btn) btn.disabled = true;

    S().addTurn(payload).then(function (result) {
      if (btn) btn.disabled = false;
      if (!result.ok) {
        showError(result.msg);
        return;
      }
      lastEntry = result.entry;
      screen = 'success';
      render();
    });
  }

  function bind() {
    var root = $('turnosChoferRoot');
    if (!root || root.dataset.bound) return;
    root.dataset.bound = '1';

    root.addEventListener('change', function (ev) {
      if (ev.target.id === 'turnosFieldPrioridad') {
        var wrap = $('turnosPriorityPinWrap');
        if (wrap) wrap.hidden = !ev.target.checked;
      }
      if (ev.target.id === 'turnosFieldCompania') {
        var otraWrap = $('turnosCompaniaOtraWrap');
        if (otraWrap) otraWrap.hidden = ev.target.value !== 'Otra';
      }
    });

    root.addEventListener('click', function (ev) {
      if (ev.target.closest('#turnosChoferNotifBtn')) {
        if (Call()) {
          Call().requestPermission().then(function (ok) {
            var prompt = $('turnosChoferNotifPrompt');
            if (ok && prompt) prompt.innerHTML = '<p class="turnos-hint turnos-hint--info">Alertas activadas. Sonará cuando lo convoquen.</p>';
            else alert('No se pudieron activar. En el navegador permita notificaciones para este sitio.');
          });
        }
        return;
      }
      if (ev.target.closest('[data-call-dismiss]')) {
        hideCallOverlay();
        return;
      }
      var resumeBtn = ev.target.closest('[data-chofer-resume]');
      if (resumeBtn) {
        syncMyTurnFromStore();
        return;
      }
      var tipoBtn = ev.target.closest('[data-chofer-tipo]');
      if (tipoBtn) {
        var ref = C().getMyTurnRef();
        if (ref && ref.id) {
          var active = S().findById(ref.id);
          if (active && C().isTurnActive(active)) {
            lastEntry = active;
            screen = 'success';
            render();
            return;
          }
        }
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
      if (ev.target.closest('[data-chofer-cancel]')) {
        cancelMyTurn();
      }
    });

    root.addEventListener('submit', function (ev) {
      if (ev.target.id === 'turnosChoferForm') submitForm(ev);
    });
  }

  function start() {
    bind();
    if (Call()) Call().init();
    render();
    S().init().then(function () {
      syncMyTurnFromStore();
      if (screen === 'menu') render();
    });
    if (unsub) unsub();
    unsub = S().subscribe(function () {
      syncMyTurnFromStore();
    });
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
