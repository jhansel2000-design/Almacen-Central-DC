/**
 * UI — Control Patio · Recepción de contenedores
 */
(function (global) {
  'use strict';

  var esc = global.PanelCore ? global.PanelCore.esc : function (s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  };

  function S() { return global.PlatformRecepcionStore; }
  function A() { return global.PlatformRecepcionAuth; }

  function badgeValidado(val) {
    if (val === 'ok') {
      return '<span class="rec-badge rec-badge--ok">OK</span>';
    }
    return '<span class="rec-badge rec-badge--pendiente">PENDIENTE</span>';
  }

  function badgeEntrada(val) {
    return badgeValidado(val);
  }

  function badgeTipo(tipo) {
    var cls = tipo === 'local' ? 'local' : 'importado';
    var lbl = tipo === 'local' ? 'LOCAL' : 'IMPORTADO';
    return '<span class="rec-tipo rec-tipo--' + cls + '">' + lbl + '</span>';
  }

  function todayInputValue() {
    try {
      var parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Santo_Domingo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      }).format(new Date());
      return parts;
    } catch (e) {
      return new Date().toISOString().slice(0, 10);
    }
  }

  function renderKpis(counts) {
    counts = counts || {};
    return '<div class="rec-kpis" role="group" aria-label="Resumen recepción">' +
      '<div class="rec-kpi rec-kpi--total"><span class="rec-kpi-num">' + esc(String(counts.total || 0)) + '</span>' +
      '<span class="rec-kpi-lbl">En seguimiento</span></div>' +
      '<div class="rec-kpi rec-kpi--pend"><span class="rec-kpi-num">' + esc(String(counts.pendienteValidar || 0)) + '</span>' +
      '<span class="rec-kpi-lbl">Pend. validar</span></div>' +
      '<div class="rec-kpi rec-kpi--val"><span class="rec-kpi-num">' + esc(String(counts.validado || 0)) + '</span>' +
      '<span class="rec-kpi-lbl">Validados</span></div>' +
      '<div class="rec-kpi rec-kpi--ent"><span class="rec-kpi-num">' + esc(String(counts.conEntrada || 0)) + '</span>' +
      '<span class="rec-kpi-lbl">Con entrada</span></div>' +
      '<div class="rec-kpi rec-kpi--imp"><span class="rec-kpi-num">' + esc(String(counts.importado || 0)) + '</span>' +
      '<span class="rec-kpi-lbl">Importados</span></div>' +
      '<div class="rec-kpi rec-kpi--loc"><span class="rec-kpi-num">' + esc(String(counts.local || 0)) + '</span>' +
      '<span class="rec-kpi-lbl">Locales</span></div>' +
      '</div>';
  }

  function accionLabel(accion) {
    var map = {
      registro: 'Registro',
      validado: 'Validación',
      entrada: 'Entrada',
      muelle: 'Muelle'
    };
    return map[accion] || String(accion || '—');
  }

  function renderRegistroForm(user) {
    if (!A().canRegister(user)) return '';
    var store = S();
    var nextReg = store.peekNextRegistro ? store.peekNextRegistro() : '';
    var divOpts = (store.DIVISIONES || []).map(function (d) {
      return '<option value="' + esc(d) + '">' + esc(d) + '</option>';
    }).join('');
    return '<section class="rec-panel rec-panel--form" aria-labelledby="recFormTitle">' +
      '<h2 id="recFormTitle" class="rec-panel-title">Registrar contenedor</h2>' +
      (nextReg ? '<p class="rec-next-registro">Próximo registro: <strong>' + esc(nextReg) + '</strong></p>' : '') +
      '<form id="recRegistroForm" class="rec-form" novalidate>' +
      '<div class="rec-form-grid">' +
      '<label class="rec-field"><span>Fecha</span><input type="date" id="recFecha" class="rec-input" value="' + esc(todayInputValue()) + '" required></label>' +
      '<label class="rec-field"><span>Contenedor</span><input type="text" id="recContenedor" class="rec-input" placeholder="COR-20003645" maxlength="32" required autocapitalize="characters"></label>' +
      '<label class="rec-field"><span>Tipo</span><select id="recTipo" class="rec-input" required>' +
      '<option value="importado">Importado</option><option value="local">Local</option></select></label>' +
      '<label class="rec-field"><span>División</span><select id="recDivision" class="rec-input" required>' +
      '<option value="">Seleccione…</option>' + divOpts + '</select></label>' +
      '<label class="rec-field rec-field--wide"><span>Descripción</span><input type="text" id="recDescripcion" class="rec-input" placeholder="PAMPERS / GATORADE…" maxlength="120" required></label>' +
      '<div class="rec-form-row-pair">' +
      '<label class="rec-field"><span>Paletas</span><input type="number" id="recPaletas" class="rec-input" min="0" max="999" value="0"></label>' +
      '<label class="rec-field"><span>Muelle (opcional)</span><input type="text" id="recMuelle" class="rec-input" placeholder="J9" maxlength="12" autocapitalize="characters"></label>' +
      '</div>' +
      '</div>' +
      '<button type="submit" class="rec-btn rec-btn--primary">Registrar contenedor</button>' +
      '</form></section>';
  }

  function renderToolbar(user, liveActive) {
    return '<div class="rec-toolbar">' +
      '<div class="rec-toolbar__left">' +
      '<p class="rec-toolbar-user">' + esc(A().getDisplayName(user)) + ' · ' + esc(A().getRoleLabel(user)) + '</p>' +
      '</div>' +
      '<div class="rec-toolbar__right">' +
      '<button type="button" class="rec-btn rec-btn--ghost" id="recBtnShare"' +
      (liveActive ? ' aria-pressed="true"' : '') + '>' +
      (liveActive ? '● Pantalla en vivo' : 'Compartir en pantalla TV') + '</button>' +
      '<a class="rec-btn rec-btn--ghost" id="recBtnOpenDisplay" href="recepcion-pantalla.html" target="_blank" rel="noopener">Abrir pantalla TV</a>' +
      '<button type="button" class="rec-btn rec-btn--ghost" id="recBtnLogout">Salir</button>' +
      '</div></div>';
  }

  function canEditMuelle(user, item) {
    if (!item || item.entrada === 'ok') return false;
    return A().canRegister(user) || A().canValidate(user);
  }

  function renderMuelleCell(item, user) {
    if (!canEditMuelle(user, item)) {
      return esc(item.muelle || '—');
    }
    return '<div class="rec-muelle-edit">' +
      '<input type="text" class="rec-input rec-muelle-input" data-rec-muelle-input="' + esc(item.id) + '" ' +
      'value="' + esc(item.muelle || '') + '" placeholder="J9" maxlength="12" autocapitalize="characters" ' +
      'aria-label="Muelle para ' + esc(item.contenedor) + '">' +
      '<button type="button" class="rec-btn rec-btn--sm rec-btn--muelle" data-rec-action="guardar-muelle" ' +
      'data-rec-id="' + esc(item.id) + '">Guardar</button></div>';
  }

  function renderMuelleModal() {
    return '<div class="rec-muelle-modal is-hidden" id="recMuelleModal" role="dialog" aria-modal="true" aria-labelledby="recMuelleModalTitle">' +
      '<div class="rec-muelle-modal__backdrop" data-rec-action="cerrar-muelle-modal"></div>' +
      '<div class="rec-muelle-modal__panel">' +
      '<h3 id="recMuelleModalTitle" class="rec-muelle-modal__title">Muelle de entrada</h3>' +
      '<p class="rec-muelle-modal__sub" id="recMuelleModalSub">Indique el muelle antes de confirmar la entrada.</p>' +
      '<label class="rec-field" for="recMuelleModalInput"><span>Muelle</span>' +
      '<input type="text" id="recMuelleModalInput" class="rec-input" placeholder="J9" maxlength="12" autocapitalize="characters"></label>' +
      '<div class="rec-muelle-modal__actions">' +
      '<button type="button" class="rec-btn rec-btn--ghost" data-rec-action="cerrar-muelle-modal">Cancelar</button>' +
      '<button type="button" class="rec-btn rec-btn--primary" id="recMuelleModalConfirm">Confirmar entrada</button>' +
      '</div></div></div>';
  }

  function renderRegistroLog(data) {
    var store = S();
    var rows = store.getRegistroActividad ? store.getRegistroActividad(data, 40) : [];
    var body = rows.length ? rows.map(function (r) {
      return '<tr>' +
        '<td class="rec-log-fecha">' + esc(store.formatFecha(r.at)) + '</td>' +
        '<td class="rec-log-reg"><strong>' + esc(r.registro || '—') + '</strong></td>' +
        '<td class="rec-log-cont">' + esc(r.contenedor || '—') + '</td>' +
        '<td>' + esc(r.usuario || '—') + '</td>' +
        '<td><span class="rec-log-acc rec-log-acc--' + esc(String(r.accion || 'otro')) + '">' +
        esc(accionLabel(r.accion)) + '</span></td>' +
        '<td class="rec-log-nota">' + esc(r.nota || '—') + '</td></tr>';
    }).join('') : '<tr><td colspan="6" class="rec-empty">Sin movimientos registrados.</td></tr>';

    return '<section class="rec-panel rec-panel--log" aria-labelledby="recLogTitle">' +
      '<h2 id="recLogTitle" class="rec-panel-title">Registro de actividad</h2>' +
      '<p class="rec-log-sub">Historial de registros, validaciones, muelles y entradas.</p>' +
      '<div class="rec-table-wrap">' +
      '<table class="rec-table rec-table--log" aria-label="Registro de actividad">' +
      '<thead><tr><th>Fecha</th><th>Registro</th><th>Contenedor</th><th>Usuario</th><th>Acción</th><th>Detalle</th></tr></thead>' +
      '<tbody>' + body + '</tbody></table></div></section>';
  }

  function renderTableRows(contenedores, user) {
    var store = S();
    if (!contenedores.length) {
      return '<tr><td colspan="11" class="rec-empty">Sin contenedores registrados.</td></tr>';
    }
    return contenedores.map(function (c) {
      var actions = '';
      if (A().canValidate(user) && c.validado !== 'ok') {
        actions += '<button type="button" class="rec-btn rec-btn--sm rec-btn--ok" data-rec-action="validar" data-rec-id="' + esc(c.id) + '">Validar</button>';
      }
      if (A().canValidate(user) && c.validado === 'ok' && c.entrada !== 'ok') {
        actions += '<button type="button" class="rec-btn rec-btn--sm rec-btn--ent" data-rec-action="entrada" data-rec-id="' + esc(c.id) + '">Dar entrada</button>';
      }
      if (A().canRegister(user)) {
        actions += '<button type="button" class="rec-btn rec-btn--sm rec-btn--danger" data-rec-action="eliminar" data-rec-id="' + esc(c.id) + '">Quitar</button>';
      }
      return '<tr data-rec-row="' + esc(c.id) + '">' +
        '<td class="rec-col-fecha">' + esc(store.formatFechaSolo(c.fecha)) + '</td>' +
        '<td class="rec-col-registro"><strong>' + esc(c.registro || '—') + '</strong></td>' +
        '<td class="rec-col-contenedor"><strong>' + esc(c.contenedor) + '</strong></td>' +
        '<td class="rec-col-tipo">' + badgeTipo(c.tipo) + '</td>' +
        '<td class="rec-col-division">' + esc(c.division || '—') + '</td>' +
        '<td class="rec-col-desc">' + esc(c.descripcion || '—') + '</td>' +
        '<td class="rec-col-num">' + esc(String(c.paletas || 0)) + '</td>' +
        '<td class="rec-col-muelle">' + renderMuelleCell(c, user) + '</td>' +
        '<td class="rec-col-status">' + badgeValidado(c.validado) + '</td>' +
        '<td class="rec-col-status">' + badgeEntrada(c.entrada) + '</td>' +
        '<td class="rec-col-actions">' + actions + '</td></tr>';
    }).join('');
  }

  function renderApp(user, data) {
    var store = S();
    data = data || store.load();
    var contenedores = store.getContenedoresActivos(data.contenedores);
    var counts = store.countResumen(data.contenedores);
    var liveActive = store.isLiveShareBoardActive(data);

    return '<div class="rec-app-shell">' +
      renderToolbar(user, liveActive) +
      renderKpis(counts) +
      renderRegistroForm(user) +
      '<section class="rec-panel rec-panel--table" aria-labelledby="recTableTitle">' +
      '<h2 id="recTableTitle" class="rec-panel-title">Seguimiento de contenedores</h2>' +
      '<div class="rec-table-wrap">' +
      '<table class="rec-table" aria-label="Contenedores en recepción">' +
      '<thead><tr>' +
      '<th>Fecha</th><th>Registro</th><th>Contenedor</th><th>Tipo</th><th>División</th><th>Descripción</th>' +
      '<th>Paletas</th><th>Muelle</th><th>Validado</th><th>Entrada</th><th></th>' +
      '</tr></thead>' +
      '<tbody id="recTableBody">' + renderTableRows(contenedores, user) + '</tbody>' +
      '</table></div></section>' +
      renderRegistroLog(data) +
      renderMuelleModal() +
      '</div>';
  }

  function readMuelleInput(root, id) {
    if (!root || !id) return '';
    var input = root.querySelector('[data-rec-muelle-input="' + id + '"]');
    return input ? String(input.value || '').trim() : '';
  }

  function bindApp(root, user, callbacks) {
    callbacks = callbacks || {};
    if (!root) return;

    var form = root.querySelector('#recRegistroForm');
    if (form) {
      form.addEventListener('submit', function (ev) {
        ev.preventDefault();
        var fechaEl = root.querySelector('#recFecha');
        var fecha = fechaEl && fechaEl.value ? new Date(fechaEl.value + 'T12:00:00').toISOString() : new Date().toISOString();
        var payload = {
          fecha: fecha,
          contenedor: root.querySelector('#recContenedor') && root.querySelector('#recContenedor').value,
          tipo: root.querySelector('#recTipo') && root.querySelector('#recTipo').value,
          division: root.querySelector('#recDivision') && root.querySelector('#recDivision').value,
          descripcion: root.querySelector('#recDescripcion') && root.querySelector('#recDescripcion').value,
          paletas: root.querySelector('#recPaletas') && root.querySelector('#recPaletas').value,
          muelle: root.querySelector('#recMuelle') && root.querySelector('#recMuelle').value
        };
        if (callbacks.onRegister) callbacks.onRegister(payload, form);
      });
    }

    root.addEventListener('click', function (ev) {
      var btn = ev.target.closest('[data-rec-action]');
      if (!btn) return;
      var action = btn.getAttribute('data-rec-action');
      var id = btn.getAttribute('data-rec-id');
      if (action === 'validar' && callbacks.onValidar) callbacks.onValidar(id);
      if (action === 'guardar-muelle' && callbacks.onGuardarMuelle) {
        callbacks.onGuardarMuelle(id, readMuelleInput(root, id));
      }
      if (action === 'entrada' && callbacks.onEntrada) {
        callbacks.onEntrada(id, readMuelleInput(root, id));
      }
      if (action === 'cerrar-muelle-modal' && callbacks.onCloseMuelleModal) {
        callbacks.onCloseMuelleModal();
      }
      if (action === 'eliminar' && callbacks.onEliminar) callbacks.onEliminar(id);
    });

    root.addEventListener('keydown', function (ev) {
      if (ev.key !== 'Enter') return;
      var input = ev.target.closest('[data-rec-muelle-input]');
      if (!input || !callbacks.onGuardarMuelle) return;
      ev.preventDefault();
      callbacks.onGuardarMuelle(input.getAttribute('data-rec-muelle-input'), input.value);
    });

    var shareBtn = root.querySelector('#recBtnShare');
    if (shareBtn && callbacks.onToggleShare) {
      shareBtn.addEventListener('click', callbacks.onToggleShare);
    }
    var logoutBtn = root.querySelector('#recBtnLogout');
    if (logoutBtn && callbacks.onLogout) logoutBtn.addEventListener('click', callbacks.onLogout);
  }

  global.PlatformRecepcionUI = {
    renderApp: renderApp,
    bindApp: bindApp,
    renderTableRows: renderTableRows,
    renderKpis: renderKpis
  };
})(typeof window !== 'undefined' ? window : this);
