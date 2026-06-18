/**
 * Control de Turnos — vista administrativa
 */
(function (global) {
  'use strict';

  var C = function () { return global.PlatformTurnosCore; };
  var S = function () { return global.PlatformTurnosStore; };
  var state = { module: 'dashboard', adminUser: null };

  var MODULE_VIEW_IDS = {
    despacho: 'turnosViewDespacho',
    liquidacion: 'turnosViewLiquidacion',
    nota_credito: 'turnosViewNota_credito'
  };

  var ICON_V = '?v=11';

  var TRAMITE_MODULES = {
    despacho: {
      tipo: 'despacho_facturas',
      title: 'Despacho de facturas',
      hint: 'Cola de choferes con ID de carga. Convocar → ventana de despacho.',
      icon: 'assets/img/icon-turnos-despacho.svg' + ICON_V
    },
    liquidacion: {
      tipo: 'liquidacion_facturas',
      title: 'Liquidación de facturas',
      hint: 'Cierre por cantidad de viajes. Convocar cuando esté listo para atender.',
      icon: 'assets/img/icon-turnos-liquidacion.svg' + ICON_V
    },
    nota_credito: {
      tipo: 'nota_credito',
      title: 'Nota de crédito',
      hint: 'Flujo: Pendiente → Confirmado → Asentado.',
      icon: 'assets/img/icon-turnos-nota-credito.svg' + ICON_V
    }
  };

  function $(id) { return document.getElementById(id); }

  function esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function todayEntries() {
    return C().entriesToday(S().getState().entries);
  }

  function canConvocar(entry) {
    if (!entry || entry.estado === 'CANCELADO') return false;
    if (entry.tipo === C().TIPOS.NOTA_CREDITO) {
      return entry.estado === 'PENDIENTE' || entry.estado === 'CONFIRMADO';
    }
    return entry.estado === 'PENDIENTE';
  }

  function convocarBtn(entry) {
    if (!canConvocar(entry)) return '';
    return '<button type="button" class="turnos-btn turnos-btn--call" data-convocar-id="' + esc(entry.id) + '" title="Avisar al chofer con vibración">' +
      'Convocar → ventana</button>';
  }

  function statusBadge(estado) {
    var cls = C().statusClass(estado);
    return '<span class="turnos-badge turnos-badge--' + cls + '">' + esc(estado.replace(/_/g, ' ')) + '</span>';
  }

  function statusSelect(entry) {
    if (entry.estado === 'CANCELADO') return statusBadge(entry.estado);
    var options = C().allowedStates(entry.tipo).map(function (st) {
      var sel = st === entry.estado ? ' selected' : '';
      return '<option value="' + esc(st) + '"' + sel + '>' + esc(st.replace(/_/g, ' ')) + '</option>';
    }).join('');
    return '<select class="turnos-status-select" data-turno-id="' + esc(entry.id) + '" aria-label="Cambiar estado">' + options + '</select>';
  }

  function formatUpdated(entry) {
    if (!entry.updatedAt) return '—';
    var d = new Date(entry.updatedAt);
    return C().formatFechaDisplay(C().todayKey(d)) + ' ' + d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  }

  function closeSeguimientoModal() {
    var el = document.getElementById('turnosSeguimientoOverlay');
    if (el) el.remove();
    document.body.classList.remove('turnos-seg-open');
  }

  function showSeguimientoModal(entry) {
    if (!entry) return;
    closeSeguimientoModal();
    var steps = C().ensureSeguimiento(entry).map(function (h, i) {
      return (
        '<li class="turnos-seg-step">' +
        '<span class="turnos-seg-step-num">' + (i + 1) + '</span>' +
        '<div class="turnos-seg-step-body">' +
        '<strong>' + esc(C().pasoLabel(h.paso)) + '</strong>' +
        '<span class="turnos-seg-step-date turnos-mono">' + esc(C().formatFechaDisplay(h.fecha)) + ' · ' + esc(h.hora) + '</span>' +
        '<span class="turnos-seg-step-meta">Compañía: <strong>' + esc(h.compania || entry.choferCompania || '—') + '</strong></span>' +
        (h.por ? '<span class="turnos-seg-step-meta">Por: ' + esc(h.por) + '</span>' : '') +
        (h.nota ? '<span class="turnos-seg-step-note">' + esc(h.nota) + '</span>' : '') +
        '</div></li>'
      );
    }).join('');
    var overlay = document.createElement('div');
    overlay.id = 'turnosSeguimientoOverlay';
    overlay.className = 'turnos-seg-overlay';
    overlay.innerHTML =
      '<div class="turnos-seg-card" role="dialog" aria-labelledby="turnosSegTitle">' +
      '<h3 id="turnosSegTitle">Seguimiento ' + esc(entry.turno) + '</h3>' +
      '<p class="turnos-sub">' + esc(entry.choferNombre) + ' · ' + esc(entry.choferCompania || '—') + '</p>' +
      '<ol class="turnos-seg-timeline">' + steps + '</ol>' +
      '<button type="button" class="turnos-btn turnos-btn--secondary turnos-btn--xl" data-seg-close>Cerrar</button></div>';
    document.body.appendChild(overlay);
    document.body.classList.add('turnos-seg-open');
    overlay.addEventListener('click', function (ev) {
      if (ev.target === overlay || ev.target.closest('[data-seg-close]')) closeSeguimientoModal();
    });
  }

  function limiteCell(e, compact, readonly) {
    if (!e.prioridad) {
      return compact ? '' : '<td class="turnos-muted-inline">—</td>';
    }
    if (e.horaLimite) {
      return '<td class="turnos-mono turnos-limite-ok">' + esc(e.horaLimite) + '<br><span class="turnos-muted-inline">hora RD</span></td>';
    }
    if (!compact && !readonly) {
      return '<td class="turnos-limite-cell">' +
        '<label class="turnos-sr-only" for="limite-' + esc(e.id) + '">Hora límite</label>' +
        '<input type="time" class="turnos-limite-input" id="limite-' + esc(e.id) + '" data-limite-id="' + esc(e.id) + '" value="' + esc(C().formatTimeInput()) + '" required>' +
        '<button type="button" class="turnos-btn turnos-btn--secondary turnos-btn--sm" data-set-limite="' + esc(e.id) + '">Definir</button></td>';
    }
    return '<td><span class="turnos-badge turnos-badge--priority-warn">Sin límite</span></td>';
  }

  function companiaCell(e, compact, readonly) {
    return '<td>' + esc(e.choferCompania || '—') + '</td>';
  }

  function dayBannerHtml(stats) {
    var dayLabel = C().formatFechaLongRD();
    var data = S().getState();
    var auto = data.autoResetDashboard !== false;
    if (stats.totalHoy === 0) {
      return (
        '<div class="turnos-day-banner turnos-day-banner--fresh">' +
        '<p class="turnos-day-banner__eyebrow">Vista del dashboard · Hora República Dominicana</p>' +
        '<h2 class="turnos-day-banner__title">' + esc(dayLabel) + '</h2>' +
        '<p class="turnos-day-banner__sub">' +
        (auto
          ? 'El seguimiento del dashboard inició vacío para hoy. Los turnos anteriores se conservan en cada área de trámite.'
          : 'Sin turnos registrados hoy en el dashboard. Los turnos activos siguen en las áreas de trámite.') +
        '</p></div>'
      );
    }
    return (
      '<div class="turnos-day-banner">' +
      '<p class="turnos-day-banner__eyebrow">Operaciones de hoy (dashboard)</p>' +
      '<h2 class="turnos-day-banner__title">' + esc(dayLabel) + '</h2>' +
      '<p class="turnos-day-banner__sub">Los turnos de días anteriores permanecen en Despacho, Liquidación y Nota de crédito.</p>' +
      '</div>'
    );
  }

  function adminTableHtml(entries, compact, readonly, showOrder) {
    if (!entries.length) {
      return '<p class="turnos-empty">No hay registros en esta sección.</p>';
    }
    var rows = entries.map(function (e, idx) {
      var convocado = e.convocadoAt
        ? '<span class="turnos-badge turnos-badge--process turnos-badge--mini">Convocado</span> '
        : '';
      var tail = '';
      if (!compact && readonly) {
        tail = '<td class="turnos-muted-inline">' + esc(e.updatedBy || '—') + '<br>' + esc(formatUpdated(e)) + '</td>';
      } else if (!compact) {
        tail =
          '<td class="turnos-mono turnos-muted-inline">' + esc(formatUpdated(e)) + '</td>' +
          '<td class="turnos-actions-cell">' +
          '<button type="button" class="turnos-btn turnos-btn--secondary turnos-btn--sm" data-seguimiento-id="' + esc(e.id) + '">Seguimiento</button> ' +
          convocarBtn(e) + ' ' + statusSelect(e) + '</td>';
      }
      var orderCol = showOrder
        ? '<td class="turnos-order-num" title="Orden de llegada">' + (idx + 1) + '</td>'
        : '';
      return '<tr class="' + (e.prioridad ? 'turnos-row--priority' : '') + '">' +
        orderCol +
        '<td class="turnos-mono turnos-turno">' + esc(e.turno) +
        (e.prioridad ? '<br>' + C().priorityBadgeHtml(e) : '') + '</td>' +
        (compact ? '<td>' + esc(C().TIPO_LABELS[e.tipo] || e.tipo) + '</td>' : '') +
        '<td class="turnos-mono turnos-fecha-cell">' + esc(C().formatFechaDisplay(e.fecha)) + '<br><span class="turnos-muted-inline">' + esc(e.hora) + '</span></td>' +
        '<td>' + esc(e.choferNombre || '—') + '</td>' +
        companiaCell(e, compact, readonly) +
        '<td class="turnos-qr-cell" title="' + esc(e.detalle) + '">' + esc(e.detalle) + '</td>' +
        '<td>' + convocado + statusBadge(e.estado) + '</td>' +
        (!compact ? limiteCell(e, compact, readonly) : '') +
        tail +
        '</tr>';
    }).join('');

    var head =
      (showOrder ? '<th>#</th>' : '') +
      '<th>Turno</th>' +
      (compact ? '<th>Trámite</th>' : '') +
      '<th>Fecha</th><th>Chofer</th><th>Compañía</th><th>Detalle</th><th>Estado</th>' +
      (!compact ? '<th>Hora límite</th>' : '') +
      (!compact && readonly ? '<th>Cancelado por</th>' : '') +
      (!compact && !readonly ? '<th>Actualizado</th><th>Gestionar</th>' : '');

    return '<div class="turnos-table-wrap"><table class="turnos-table"><thead><tr>' + head + '</tr></thead><tbody>' + rows + '</tbody></table></div>';
  }

  function lastTurnSummary(entry) {
    if (!entry) return 'Sin turnos aún';
    return 'Último: <span class="turnos-mono">' + esc(entry.turno) + '</span> · ' +
      esc(entry.choferNombre || '—') + ' · ' + esc((entry.hora || '').slice(0, 5));
  }

  function lastTurnCard(title, iconSrc, entry, navKey) {
    var estado = entry ? statusBadge(entry.estado) : '';
    return (
      '<button type="button" class="turnos-last-turn-card" data-turnos-nav="' + esc(navKey) + '">' +
      '<img src="' + esc(iconSrc) + '" alt="" width="36" height="36">' +
      '<div class="turnos-last-turn-card-body">' +
      '<strong>' + esc(title) + '</strong>' +
      '<span class="turnos-last-turn-line">' + lastTurnSummary(entry) + '</span>' +
      (entry ? '<span class="turnos-last-turn-meta">' + estado + '</span>' : '') +
      '</div></button>'
    );
  }

  function arrivalOrderTableHtml(entries) {
    if (!entries.length) {
      return '<p class="turnos-empty">No hay choferes en cola hoy.</p>';
    }
    var rows = entries.map(function (e, idx) {
      return (
        '<tr class="' + (e.prioridad ? 'turnos-row--priority' : '') + '">' +
        '<td class="turnos-order-num">' + (idx + 1) + '</td>' +
        '<td class="turnos-mono turnos-turno">' + esc(e.turno) +
        (e.prioridad ? '<br>' + C().priorityBadgeHtml(e) : '') + '</td>' +
        '<td class="turnos-mono">' + esc((e.hora || '').slice(0, 8)) + '</td>' +
        '<td>' + esc(e.choferNombre || '—') + '</td>' +
        '<td>' + esc(e.choferCompania || '—') + '</td>' +
        '<td>' + esc(C().TIPO_LABELS[e.tipo] || e.tipo) + '</td>' +
        '<td>' + statusBadge(e.estado) + '</td>' +
        '</tr>'
      );
    }).join('');
    return (
      '<div class="turnos-table-wrap turnos-table-wrap--arrival">' +
      '<table class="turnos-table turnos-table--arrival">' +
      '<thead><tr><th>#</th><th>Turno</th><th>Hora llegada</th><th>Chofer</th><th>Compañía</th><th>Trámite</th><th>Estado</th></tr></thead>' +
      '<tbody>' + rows + '</tbody></table></div>'
    );
  }

  function tramiteStats(tipo) {
    var all = C().filterByTipo(S().getState().entries, tipo, false);
    var today = C().filterByTipo(todayEntries(), tipo, false);
    return {
      total: all.length,
      totalHoy: today.length,
      pendientes: all.filter(function (e) { return e.estado === 'PENDIENTE'; }).length,
      enCurso: all.filter(function (e) {
        return e.estado === 'EN_PROCESO' || e.estado === 'CONFIRMADO';
      }).length,
      cerrados: today.filter(function (e) {
        return e.estado === 'COMPLETADO' || e.estado === 'ASENTADO';
      }).length
    };
  }

  function setModule(mod) {
    state.module = mod;
    document.querySelectorAll('.turnos-view').forEach(function (el) {
      el.hidden = el.getAttribute('data-module') !== mod;
    });
    document.querySelectorAll('[data-turnos-nav]').forEach(function (btn) {
      btn.classList.toggle('active', btn.getAttribute('data-turnos-nav') === mod);
    });
    var titles = {
      dashboard: 'Resumen — ' + C().formatFechaDisplay(C().todayKey()),
      despacho: 'Despacho de facturas',
      liquidacion: 'Liquidación de facturas',
      nota_credito: 'Nota de crédito',
      cancelados: 'Turnos cancelados',
      export: 'Exportar registros',
      config: 'Configuración'
    };
    var titleEl = $('turnosTopTitle');
    if (titleEl) titleEl.textContent = titles[mod] || 'Gestión de turnos';

    if (mod === 'dashboard') renderDashboard();
    else if (TRAMITE_MODULES[mod]) renderTramite(mod);
    else if (mod === 'cancelados') renderCancelados();
    else if (mod === 'export') renderExport();
    else if (mod === 'config') renderConfig();
  }

  function renderDashboard() {
    var host = $('turnosViewDashboard');
    if (!host) return;
    var data = S().getState();
    var today = todayEntries();
    var stats = C().statsToday(data.entries);
    var last = today.length
      ? today.reduce(function (best, e) {
        var n = parseInt(String(e.turno || '').replace(/\D/g, ''), 10) || 0;
        var bn = parseInt(String(best.turno || '').replace(/\D/g, ''), 10) || 0;
        return n > bn ? e : best;
      }).turno
      : (data.counter > 0 ? C().formatTurno(data.counter) : '—');
    var allEntries = data.entries;
    var cards = Object.keys(TRAMITE_MODULES).map(function (key) {
      var cfg = TRAMITE_MODULES[key];
      var ts = tramiteStats(cfg.tipo);
      var lastEntry = C().latestEntry(allEntries, function (e) { return e.tipo === cfg.tipo; });
      return (
        '<button type="button" class="turnos-tramite-card" data-turnos-nav="' + key + '">' +
        '<img src="' + esc(cfg.icon) + '" alt="" width="40" height="40">' +
        '<span class="turnos-tramite-card-text">' +
        '<strong>' + esc(cfg.title) + '</strong>' +
        '<span>' + ts.pendientes + ' en cola · ' + ts.totalHoy + ' hoy</span>' +
        '<span class="turnos-tramite-last">' + lastTurnSummary(lastEntry) + '</span>' +
        '</span></button>'
      );
    }).join('');
    var lastCancel = C().latestEntry(allEntries, function (e) { return e.estado === 'CANCELADO'; });
    var arrivalToday = C().sortByArrivalOrder(today.filter(function (e) { return e.estado !== 'CANCELADO'; }));
    var lastByArea =
      lastTurnCard('Despacho de facturas', TRAMITE_MODULES.despacho.icon,
        C().latestEntry(allEntries, function (e) { return e.tipo === C().TIPOS.DESPACHO; }), 'despacho') +
      lastTurnCard('Liquidación de facturas', TRAMITE_MODULES.liquidacion.icon,
        C().latestEntry(allEntries, function (e) { return e.tipo === C().TIPOS.LIQUIDACION; }), 'liquidacion') +
      lastTurnCard('Nota de crédito', TRAMITE_MODULES.nota_credito.icon,
        C().latestEntry(allEntries, function (e) { return e.tipo === C().TIPOS.NOTA_CREDITO; }), 'nota_credito') +
      lastTurnCard('Cancelados', 'assets/img/icon-turnos-gestion.svg' + ICON_V, lastCancel, 'cancelados');

    host.innerHTML =
      (data.live ? '' : '<p class="turnos-offline-banner">Sin conexión con la nube. Los datos de turnos están en Supabase — verifique internet.</p>') +
      dayBannerHtml(stats) +
      '<div class="turnos-kpi-grid turnos-kpi-grid--admin">' +
      kpi('Total hoy', stats.totalHoy, 'blue') +
      kpi('Pendientes', stats.pendientes, 'red') +
      kpi('En proceso', stats.enProceso + stats.confirmados, 'process') +
      kpi('Completados', stats.completados + stats.asentados, 'green') +
      kpi('Cancelados', stats.cancelados, 'cancel') +
      kpi('Prioritarios', stats.prioridades, 'priority') +
      kpi('Último turno hoy', last, 'gray', true) +
      '</div>' +
      '<section class="turnos-panel"><h2>Últimos turnos por área</h2>' +
      '<p class="turnos-sub">El turno más reciente registrado en cada trámite (todos los días).</p>' +
      '<div class="turnos-last-turns-grid">' + lastByArea + '</div></section>' +
      '<section class="turnos-panel"><h2>Orden de llegada — choferes de hoy</h2>' +
      '<p class="turnos-sub">Posición 1 = llegó primero. Los <strong>prioritarios</strong> aparecen adelante aunque hayan llegado después.</p>' +
      arrivalOrderTableHtml(arrivalToday) +
      '</section>' +
      '<section class="turnos-panel"><h2>Áreas de seguimiento</h2>' +
      '<p class="turnos-sub">Seleccione un trámite para gestionar su cola por separado.</p>' +
      '<div class="turnos-tramite-grid">' + cards +
      '<button type="button" class="turnos-tramite-card turnos-tramite-card--muted" data-turnos-nav="cancelados">' +
      '<span class="turnos-tramite-card-icon"><img src="assets/img/icon-turnos-gestion.svg' + ICON_V + '" alt="" width="40" height="40"></span>' +
      '<span class="turnos-tramite-card-text"><strong>Cancelados</strong><span>' + stats.cancelados + ' hoy</span>' +
      (lastCancel ? '<span class="turnos-tramite-last">' + lastTurnSummary(lastCancel) + '</span>' : '') +
      '</span></button>' +
      '</div></section>' +
      '<section class="turnos-panel"><h2>Actividad reciente de hoy</h2>' +
      (today.filter(function (e) { return e.estado !== 'CANCELADO'; }).length
        ? adminTableHtml(today.filter(function (e) { return e.estado !== 'CANCELADO'; }).slice(0, 8), true)
        : '<p class="turnos-empty">Aún no hay turnos registrados hoy. El tablero está listo para recibir choferes.</p>') +
      '</section>';
  }

  function kpi(label, value, tone, mono) {
    return '<article class="turnos-kpi turnos-kpi--' + tone + '"><span class="turnos-kpi-label">' + esc(label) +
      '</span><strong' + (mono ? ' class="turnos-mono"' : '') + '>' + esc(String(value)) + '</strong></article>';
  }

  function renderTramite(modKey) {
    var host = $(MODULE_VIEW_IDS[modKey]);
    if (!host) return;
    var cfg = TRAMITE_MODULES[modKey];
    var entries = C().sortByArrivalOrder(C().filterByTipo(S().getState().entries, cfg.tipo, false));
    var ts = tramiteStats(cfg.tipo);
    host.innerHTML =
      '<section class="turnos-panel turnos-panel--tramite">' +
      '<div class="turnos-tramite-head">' +
      '<img src="' + esc(cfg.icon) + '" alt="" width="48" height="48">' +
      '<div><h2>' + esc(cfg.title) + '</h2><p class="turnos-sub">' + esc(cfg.hint) + ' · Columna <strong>#</strong> = orden de llegada.</p></div></div>' +
      '<div class="turnos-tramite-kpis">' +
      miniKpi('En cola', ts.pendientes) +
      miniKpi('En curso', ts.enCurso) +
      miniKpi('Cerrados hoy', ts.cerrados) +
      miniKpi('Registrados hoy', ts.totalHoy) +
      '</div>' +
      adminTableHtml(entries, false, false, true) +
      '</section>';
  }

  function miniKpi(label, value) {
    return '<div class="turnos-mini-kpi"><span>' + esc(label) + '</span><strong>' + esc(String(value)) + '</strong></div>';
  }

  function renderCancelados() {
    var host = $('turnosViewCancelados');
    if (!host) return;
    var entries = C().filterCancelados(S().getState().entries);
    host.innerHTML =
      '<section class="turnos-panel">' +
      '<h2>Turnos cancelados</h2>' +
      '<p class="turnos-sub">Historial de cancelaciones. Los turnos cancelados se conservan para auditoría.</p>' +
      adminTableHtml(entries, false, true) +
      '</section>';
  }

  function renderExport() {
    var host = $('turnosViewExport');
    if (!host) return;
    var all = S().getState().entries;
    var nToday = todayEntries().length;
    host.innerHTML =
      '<section class="turnos-panel turnos-export-cards">' +
      '<h2>Exportar</h2><p class="turnos-sub">' + all.length + ' registros en total · ' + nToday + ' de hoy (hora RD).</p>' +
      '<button type="button" class="turnos-export-card" data-admin-action="export-xlsx">' +
      '<span class="turnos-export-icon"><img src="assets/img/icon-turnos-export.svg' + ICON_V + '" alt="" width="44" height="44"></span><strong>Excel (.xlsx)</strong></button>' +
      '<button type="button" class="turnos-export-card" data-admin-action="export-csv">' +
      '<span class="turnos-export-icon"><img src="assets/img/icon-turnos-csv.svg' + ICON_V + '" alt="" width="44" height="44"></span><strong>CSV</strong></button>' +
      '</section>';
  }

  function renderConfig() {
    var host = $('turnosViewConfig');
    if (!host) return;
    var data = S().getState();
    var autoOn = data.autoResetDashboard !== false;
    host.innerHTML =
      '<section class="turnos-panel">' +
      '<h2>Configuración</h2>' +
      '<p class="turnos-sub">Usuario: <strong>' + esc(state.adminUser && (state.adminUser.name || state.adminUser.username)) + '</strong></p>' +
      '<p class="turnos-sub">Notificaciones: aviso en el navegador cuando está en otra pestaña (sin sonido en el panel).</p>' +
      '<button type="button" class="turnos-btn turnos-btn--primary turnos-btn--xl" data-admin-action="notif-perm">Activar notificaciones del navegador</button>' +
      '<div class="turnos-config-block">' +
      '<h3 class="turnos-config-title">Dashboard — seguimiento del día</h3>' +
      '<p class="turnos-hint">El dashboard muestra solo la actividad de <strong>hoy</strong>. Los turnos <strong>no se borran</strong>; siguen en Despacho, Liquidación y Nota de crédito.</p>' +
      '<label class="turnos-config-check">' +
      '<input type="checkbox" id="turnosAutoResetDashboard"' + (autoOn ? ' checked' : '') + '> ' +
      'Reiniciar vista del dashboard automáticamente cada día nuevo (hora RD)</label>' +
      '<button type="button" class="turnos-btn turnos-btn--secondary turnos-btn--xl" data-admin-action="reset-dashboard">Reiniciar vista del dashboard ahora</button>' +
      '<p class="turnos-hint">Use el botón si desea limpiar el seguimiento del dashboard sin borrar turnos.</p>' +
      '</div>' +
      '<p class="turnos-hint">Hora oficial: <strong>República Dominicana</strong>. Turnos prioritarios: PIN Duarte (<span class="turnos-mono">' + esc(C().priorityPinHint()) + '</span>) asigna hora límite automática. La compañía la escribe el chofer en un solo campo.</p>' +
      '<button type="button" class="turnos-btn turnos-btn--danger turnos-btn--xl" data-admin-action="reset">Reiniciar numeración de turnos</button>' +
      '<p class="turnos-hint">Solo cambia el contador T-0001, T-0002… <strong>No borra</strong> el historial de turnos.</p>' +
      '<button type="button" class="turnos-btn turnos-btn--secondary" data-admin-action="logout">Cerrar sesión admin</button>' +
      '</section>';
  }

  function rowsForExport() {
    return S().getState().entries.map(function (e) {
      return {
        Turno: e.turno,
        Fecha: C().formatFechaDisplay(e.fecha),
        Hora: e.hora,
        Trámite: C().TIPO_LABELS[e.tipo] || e.tipo,
        Compañía: e.choferCompania || '',
        Chofer: e.choferNombre,
        Detalle: e.detalle,
        Estado: e.estado,
        Prioridad: e.prioridad ? 'Sí' : 'No',
        'Hora límite': e.horaLimite || '',
        Seguimiento: C().seguimientoResumen(e),
        Convocado: e.convocadoAt ? C().formatDateTimeLocale(e.convocadoAt) : '',
        Actualizado: e.updatedAt ? C().formatDateTimeLocale(e.updatedAt) : '',
        Por: e.updatedBy || ''
      };
    });
  }

  function exportCsv() {
    var entries = S().getState().entries;
    if (!entries.length) { alert('No hay datos.'); return; }
    var XLSX = global.XLSX;
    if (!XLSX) return;
    var ws = XLSX.utils.json_to_sheet(rowsForExport());
    var csv = XLSX.utils.sheet_to_csv(ws);
    var blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
    downloadBlob(blob, 'turnos_' + C().todayKey() + '.csv');
  }

  function exportXlsx() {
    var entries = S().getState().entries;
    if (!entries.length) { alert('No hay datos.'); return; }
    var XLSX = global.XLSX;
    if (!XLSX) return;
    var ws = XLSX.utils.json_to_sheet(rowsForExport());
    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Turnos');
    XLSX.writeFile(wb, 'turnos_' + C().todayKey() + '.xlsx');
  }

  function downloadBlob(blob, name) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  }

  function bind() {
    var root = $('turnosAdminRoot');
    if (!root || root.dataset.bound) return;
    root.dataset.bound = '1';

    root.addEventListener('click', function (ev) {
      var nav = ev.target.closest('[data-turnos-nav]');
      if (nav) {
        ev.preventDefault();
        setModule(nav.getAttribute('data-turnos-nav'));
        return;
      }
      var limBtn = ev.target.closest('[data-set-limite]');
      if (limBtn) {
        var lid = limBtn.getAttribute('data-set-limite');
        var inp = root.querySelector('[data-limite-id="' + lid + '"]');
        var hora = inp && inp.value;
        if (!hora) {
          alert('Indique la hora límite de entrega.');
          return;
        }
        var userName = state.adminUser && (state.adminUser.name || state.adminUser.username);
        limBtn.disabled = true;
        S().setHoraLimite(lid, hora, userName).then(function (result) {
          limBtn.disabled = false;
          if (!result.ok) {
            alert(result.msg || 'No se pudo guardar.');
            refresh();
            return;
          }
          refresh();
        });
        return;
      }
      var segBtn = ev.target.closest('[data-seguimiento-id]');
      if (segBtn) {
        var sid = segBtn.getAttribute('data-seguimiento-id');
        var entry = S().findById(sid);
        if (entry) showSeguimientoModal(entry);
        return;
      }
      var convBtn = ev.target.closest('[data-convocar-id]');
      if (convBtn) {
        var cid = convBtn.getAttribute('data-convocar-id');
        var userName = state.adminUser && (state.adminUser.name || state.adminUser.username);
        convBtn.disabled = true;
        S().convocarChofer(cid, userName).then(function (result) {
          convBtn.disabled = false;
          if (!result.ok) {
            alert(result.msg || 'No se pudo convocar.');
            refresh();
            return;
          }
          refresh();
        });
        return;
      }
      var btn = ev.target.closest('[data-admin-action]');
      if (!btn) return;
      var action = btn.getAttribute('data-admin-action');
      if (action === 'export-xlsx') exportXlsx();
      else if (action === 'export-csv') exportCsv();
      else if (action === 'notif-perm' && global.PlatformTurnosAlerts) {
        global.PlatformTurnosAlerts.requestPermission().then(function (ok) {
          alert(ok ? 'Notificaciones activadas.' : 'No se pudieron activar. Revise permisos del navegador.');
        });
      }
      else if (action === 'reset-dashboard') {
        S().saveConfig({ resetDashboardView: true }).then(function (result) {
          if (!result.ok) {
            alert(result.msg || 'No se pudo reiniciar la vista.');
            return;
          }
          alert('Vista del dashboard reiniciada. Los turnos se conservaron.');
          setModule('dashboard');
        });
      }
      else if (action === 'reset') {
        if (confirm('¿Reiniciar numeración de turnos?')) {
          S().resetCounter().then(function (result) {
            if (!result.ok) alert(result.msg || 'No se pudo reiniciar.');
            refresh();
          });
        }
      } else if (action === 'logout' && global.PlatformTurnosApp) {
        global.PlatformTurnosApp.logoutAdmin();
      }
    });

    root.addEventListener('change', function (ev) {
      if (ev.target.id === 'turnosAutoResetDashboard') {
        S().saveConfig({ autoResetDashboard: !!ev.target.checked }).then(function (result) {
          if (!result.ok) alert(result.msg || 'No se pudo guardar.');
        });
        return;
      }
      var sel = ev.target.closest('[data-turno-id]');
      if (!sel) return;
      var id = sel.getAttribute('data-turno-id');
      var estado = sel.value;
      var userName = state.adminUser && (state.adminUser.name || state.adminUser.username);
      S().setEstado(id, estado, userName).then(function (result) {
        if (!result.ok) {
          alert(result.msg);
          refresh();
          return;
        }
        refresh();
      });
    });
  }

  function updateClock() {
    var timeEl = $('turnosClockTime');
    var dateEl = $('turnosClockDate');
    if (timeEl) timeEl.textContent = C().formatClockTime();
    if (dateEl) dateEl.textContent = C().formatClockDate();
  }

  function refresh() {
    setModule(state.module);
  }

  function start(user) {
    state.adminUser = user || null;
    bind();
    S().init().then(function () {
      refresh();
    });
    if (state._unsub) state._unsub();
    state._unsub = S().subscribe(function (shared) {
      refresh();
      if (global.PlatformTurnosAlerts) global.PlatformTurnosAlerts.onStoreUpdate(shared);
    });
    if (global.PlatformTurnosAlerts) {
      global.PlatformTurnosAlerts.start();
      global.PlatformTurnosAlerts.requestPermission();
    }
    updateClock();
    setInterval(updateClock, 1000);
    state._dashboardDay = C().todayKey();
    setInterval(function () {
      var d = C().todayKey();
      if (state._dashboardDay === d) return;
      state._dashboardDay = d;
      var data = S().getState();
      if (data.autoResetDashboard === false) {
        refresh();
        return;
      }
      var sync = global.PlatformTurnosSync;
      if (sync && sync.ensureDayCurrent) {
        sync.ensureDayCurrent().then(function () { refresh(); });
      } else {
        refresh();
      }
    }, 30000);
    var label = $('turnosAdminUserLabel');
    if (label && user) label.textContent = (user.name || user.username || 'Admin') + ' (' + (user.role || 'admin') + ')';
    if (global.PanelCore && global.PanelCore.touchAveriasSession) {
      global.PanelCore.touchAveriasSession(user);
      if (state._sessionTouch) clearInterval(state._sessionTouch);
      state._sessionTouch = setInterval(function () {
        global.PanelCore.touchAveriasSession(user);
      }, 5 * 60 * 1000);
    }
    setModule('dashboard');
  }

  function show() {
    var root = $('turnosAdminRoot');
    if (root) root.classList.remove('is-hidden');
  }

  function hide() {
    var root = $('turnosAdminRoot');
    if (root) root.classList.add('is-hidden');
    if (global.PlatformTurnosAlerts) global.PlatformTurnosAlerts.stop();
  }

  global.PlatformTurnosAdmin = { start: start, show: show, hide: hide, refresh: refresh };
})(typeof window !== 'undefined' ? window : this);
