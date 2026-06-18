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

  var TRAMITE_MODULES = {
    despacho: {
      tipo: 'despacho_facturas',
      title: 'Despacho de facturas',
      hint: 'Cola de choferes con ID de carga. Convocar → ventana de despacho.',
      icon: 'assets/img/icon-turnos-despacho.svg'
    },
    liquidacion: {
      tipo: 'liquidacion_facturas',
      title: 'Liquidación de facturas',
      hint: 'Cierre por cantidad de viajes. Convocar cuando esté listo para atender.',
      icon: 'assets/img/icon-turnos-liquidacion.svg'
    },
    nota_credito: {
      tipo: 'nota_credito',
      title: 'Nota de crédito',
      hint: 'Flujo: Pendiente → Confirmado → Asentado.',
      icon: 'assets/img/icon-turnos-nota-credito.svg'
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
    return new Date(entry.updatedAt).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  }

  function limiteCell(e, compact, readonly) {
    if (!e.prioridad) {
      return compact ? '' : '<td class="turnos-muted-inline">—</td>';
    }
    if (e.horaLimite) {
      return '<td class="turnos-mono turnos-limite-ok">' + esc(e.horaLimite) + '</td>';
    }
    if (!compact && !readonly) {
      return '<td class="turnos-limite-cell">' +
        '<label class="turnos-sr-only" for="limite-' + esc(e.id) + '">Hora límite</label>' +
        '<input type="time" class="turnos-limite-input" id="limite-' + esc(e.id) + '" data-limite-id="' + esc(e.id) + '" required>' +
        '<button type="button" class="turnos-btn turnos-btn--secondary turnos-btn--sm" data-set-limite="' + esc(e.id) + '">Definir</button></td>';
    }
    return '<td><span class="turnos-badge turnos-badge--priority-warn">Sin límite</span></td>';
  }

  function adminTableHtml(entries, compact, readonly) {
    if (!entries.length) {
      return '<p class="turnos-empty">No hay registros en esta sección.</p>';
    }
    var rows = entries.map(function (e) {
      var convocado = e.convocadoAt
        ? '<span class="turnos-badge turnos-badge--process turnos-badge--mini">Convocado</span> '
        : '';
      var tail = '';
      if (!compact && readonly) {
        tail = '<td class="turnos-muted-inline">' + esc(e.updatedBy || '—') + '<br>' + esc(formatUpdated(e)) + '</td>';
      } else if (!compact) {
        tail =
          '<td class="turnos-mono turnos-muted-inline">' + esc(formatUpdated(e)) + '</td>' +
          '<td class="turnos-actions-cell">' + convocarBtn(e) + ' ' + statusSelect(e) + '</td>';
      }
      return '<tr class="' + (e.prioridad ? 'turnos-row--priority' : '') + '">' +
        '<td class="turnos-mono turnos-turno">' + esc(e.turno) +
        (e.prioridad ? '<br>' + C().priorityBadgeHtml(e) : '') + '</td>' +
        (compact ? '<td>' + esc(C().TIPO_LABELS[e.tipo] || e.tipo) + '</td>' : '') +
        '<td>' + esc(e.choferNombre || '—') + '</td>' +
        '<td class="turnos-qr-cell" title="' + esc(e.detalle) + '">' + esc(e.detalle) + '</td>' +
        '<td class="turnos-mono">' + esc(e.hora) + '</td>' +
        '<td>' + convocado + statusBadge(e.estado) + '</td>' +
        (!compact ? limiteCell(e, compact, readonly) : '') +
        tail +
        '</tr>';
    }).join('');

    var head =
      '<th>Turno</th>' +
      (compact ? '<th>Trámite</th>' : '') +
      '<th>Chofer</th><th>Detalle</th><th>Hora</th><th>Estado</th>' +
      (!compact ? '<th>Hora límite</th>' : '') +
      (!compact && readonly ? '<th>Cancelado por</th>' : '') +
      (!compact && !readonly ? '<th>Actualizado</th><th>Gestionar</th>' : '');

    return '<div class="turnos-table-wrap"><table class="turnos-table"><thead><tr>' + head + '</tr></thead><tbody>' + rows + '</tbody></table></div>';
  }

  function tramiteStats(tipo) {
    var list = C().filterByTipo(todayEntries(), tipo, false);
    return {
      total: list.length,
      pendientes: list.filter(function (e) { return e.estado === 'PENDIENTE'; }).length,
      enCurso: list.filter(function (e) {
        return e.estado === 'EN_PROCESO' || e.estado === 'CONFIRMADO';
      }).length,
      cerrados: list.filter(function (e) {
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
      dashboard: 'Resumen del día',
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
    var stats = C().statsToday(data.entries);
    var last = data.counter > 0 ? C().formatTurno(data.counter) : '—';
    var cards = Object.keys(TRAMITE_MODULES).map(function (key) {
      var cfg = TRAMITE_MODULES[key];
      var ts = tramiteStats(cfg.tipo);
      return (
        '<button type="button" class="turnos-tramite-card" data-turnos-nav="' + key + '">' +
        '<img src="' + esc(cfg.icon) + '" alt="" width="36" height="36">' +
        '<span class="turnos-tramite-card-text">' +
        '<strong>' + esc(cfg.title) + '</strong>' +
        '<span>' + ts.pendientes + ' pendientes · ' + ts.total + ' hoy</span>' +
        '</span></button>'
      );
    }).join('');

    host.innerHTML =
      (data.live ? '' : '<p class="turnos-offline-banner">Sin conexión con la nube. Los datos de turnos están en Supabase — verifique internet.</p>') +
      '<div class="turnos-kpi-grid turnos-kpi-grid--admin">' +
      kpi('Total hoy', stats.totalHoy, 'blue') +
      kpi('Pendientes', stats.pendientes, 'red') +
      kpi('En proceso', stats.enProceso + stats.confirmados, 'process') +
      kpi('Completados', stats.completados + stats.asentados, 'green') +
      kpi('Cancelados', stats.cancelados, 'cancel') +
      kpi('Prioritarios', stats.prioridades, 'priority') +
      kpi('Último turno', last, 'gray', true) +
      '</div>' +
      '<section class="turnos-panel"><h2>Áreas de seguimiento</h2>' +
      '<p class="turnos-sub">Seleccione un trámite para gestionar su cola por separado.</p>' +
      '<div class="turnos-tramite-grid">' + cards +
      '<button type="button" class="turnos-tramite-card turnos-tramite-card--muted" data-turnos-nav="cancelados">' +
      '<span class="turnos-tramite-card-icon">✕</span>' +
      '<span class="turnos-tramite-card-text"><strong>Cancelados</strong><span>' + stats.cancelados + ' hoy</span></span></button>' +
      '</div></section>' +
      '<section class="turnos-panel"><h2>Actividad reciente</h2>' +
      adminTableHtml(data.entries.filter(function (e) { return e.estado !== 'CANCELADO'; }).slice(0, 8), true) +
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
    var entries = C().filterByTipo(todayEntries(), cfg.tipo, false);
    var ts = tramiteStats(cfg.tipo);
    host.innerHTML =
      '<section class="turnos-panel turnos-panel--tramite">' +
      '<div class="turnos-tramite-head">' +
      '<img src="' + esc(cfg.icon) + '" alt="" width="44" height="44">' +
      '<div><h2>' + esc(cfg.title) + '</h2><p class="turnos-sub">' + esc(cfg.hint) + '</p></div></div>' +
      '<div class="turnos-tramite-kpis">' +
      miniKpi('En cola', ts.pendientes) +
      miniKpi('En curso', ts.enCurso) +
      miniKpi('Cerrados hoy', ts.cerrados) +
      miniKpi('Total', ts.total) +
      '</div>' +
      adminTableHtml(entries, false, false) +
      '</section>';
  }

  function miniKpi(label, value) {
    return '<div class="turnos-mini-kpi"><span>' + esc(label) + '</span><strong>' + esc(String(value)) + '</strong></div>';
  }

  function renderCancelados() {
    var host = $('turnosViewCancelados');
    if (!host) return;
    var entries = C().filterCancelados(todayEntries());
    host.innerHTML =
      '<section class="turnos-panel">' +
      '<h2>Turnos cancelados hoy</h2>' +
      '<p class="turnos-sub">Registro de turnos que el chofer o el administrador canceló. Se conservan para auditoría.</p>' +
      adminTableHtml(entries, false, true) +
      '</section>';
  }

  function renderExport() {
    var host = $('turnosViewExport');
    if (!host) return;
    var n = S().getState().entries.length;
    host.innerHTML =
      '<section class="turnos-panel turnos-export-cards">' +
      '<h2>Exportar</h2><p class="turnos-sub">' + n + ' registros en total.</p>' +
      '<button type="button" class="turnos-export-card" data-admin-action="export-xlsx">' +
      '<span class="turnos-export-icon"><img src="assets/img/icon-turnos-export.svg" alt="" width="40" height="40"></span><strong>Excel (.xlsx)</strong></button>' +
      '<button type="button" class="turnos-export-card" data-admin-action="export-csv">' +
      '<span class="turnos-export-icon"><img src="assets/img/icon-turnos-gestion.svg" alt="" width="40" height="40"></span><strong>CSV</strong></button>' +
      '</section>';
  }

  function renderConfig() {
    var host = $('turnosViewConfig');
    if (!host) return;
    host.innerHTML =
      '<section class="turnos-panel">' +
      '<h2>Configuración</h2>' +
      '<p class="turnos-sub">Usuario: <strong>' + esc(state.adminUser && (state.adminUser.name || state.adminUser.username)) + '</strong></p>' +
      '<p class="turnos-sub">Notificaciones: aviso con voz y alarma cuando esté en otra ventana del navegador.</p>' +
      '<button type="button" class="turnos-btn turnos-btn--primary turnos-btn--xl" data-admin-action="notif-perm">Activar notificaciones del navegador</button>' +
      '<p class="turnos-hint">Turnos prioritarios requieren PIN administrador al crearse. Defina la hora límite en cada fila prioritaria.</p>' +
      '<button type="button" class="turnos-btn turnos-btn--danger turnos-btn--xl" data-admin-action="reset">Reiniciar numeración</button>' +
      '<p class="turnos-hint">Conserva el historial. El próximo turno volverá a T-0001.</p>' +
      '<button type="button" class="turnos-btn turnos-btn--secondary" data-admin-action="logout">Cerrar sesión admin</button>' +
      '</section>';
  }

  function rowsForExport() {
    return S().getState().entries.map(function (e) {
      return {
        Turno: e.turno,
        Fecha: e.fecha,
        Hora: e.hora,
        Trámite: C().TIPO_LABELS[e.tipo] || e.tipo,
        Chofer: e.choferNombre,
        Detalle: e.detalle,
        Estado: e.estado,
        Prioridad: e.prioridad ? 'Sí' : 'No',
        'Hora límite': e.horaLimite || '',
        Convocado: e.convocadoAt ? new Date(e.convocadoAt).toLocaleString('es-ES') : '',
        Actualizado: e.updatedAt ? new Date(e.updatedAt).toLocaleString('es-ES') : '',
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
    var now = new Date();
    var timeEl = $('turnosClockTime');
    var dateEl = $('turnosClockDate');
    if (timeEl) timeEl.textContent = now.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    if (dateEl) dateEl.textContent = now.toLocaleDateString('es-ES', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
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
