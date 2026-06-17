/**
 * Control de Turnos — vista administrativa
 */
(function (global) {
  'use strict';

  var C = function () { return global.PlatformTurnosCore; };
  var S = function () { return global.PlatformTurnosStore; };
  var state = { module: 'dashboard', adminUser: null };

  function $(id) { return document.getElementById(id); }

  function esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function statusBadge(estado) {
    var cls = C().statusClass(estado);
    return '<span class="turnos-badge turnos-badge--' + cls + '">' + esc(estado.replace(/_/g, ' ')) + '</span>';
  }

  function statusSelect(entry) {
    var options = C().allowedStates(entry.tipo).map(function (st) {
      var sel = st === entry.estado ? ' selected' : '';
      return '<option value="' + esc(st) + '"' + sel + '>' + esc(st.replace(/_/g, ' ')) + '</option>';
    }).join('');
    return '<select class="turnos-status-select" data-turno-id="' + esc(entry.id) + '" aria-label="Cambiar estado">' + options + '</select>';
  }

  function adminTableHtml(entries, compact) {
    if (!entries.length) {
      return '<p class="turnos-empty">No hay turnos registrados.</p>';
    }
    var rows = entries.map(function (e) {
      return '<tr>' +
        '<td class="turnos-mono turnos-turno">' + esc(e.turno) + '</td>' +
        '<td>' + esc(C().TIPO_LABELS[e.tipo] || e.tipo) + '</td>' +
        '<td>' + esc(e.choferNombre || '—') + '</td>' +
        '<td class="turnos-qr-cell" title="' + esc(e.detalle) + '">' + esc(e.detalle) + '</td>' +
        '<td class="turnos-mono">' + esc(e.hora) + '</td>' +
        '<td>' + statusBadge(e.estado) + '</td>' +
        (compact ? '' : '<td>' + statusSelect(e) + '</td>') +
        '</tr>';
    }).join('');

    return '<div class="turnos-table-wrap"><table class="turnos-table"><thead><tr>' +
      '<th>Turno</th><th>Trámite</th><th>Chofer</th><th>Detalle</th><th>Hora</th><th>Estado</th>' +
      (compact ? '' : '<th>Gestionar</th>') + '</tr></thead><tbody>' + rows + '</tbody></table></div>';
  }

  function setModule(mod) {
    state.module = mod;
    document.querySelectorAll('.turnos-view').forEach(function (el) {
      el.hidden = el.getAttribute('data-module') !== mod;
    });
    document.querySelectorAll('[data-turnos-nav]').forEach(function (btn) {
      btn.classList.toggle('active', btn.getAttribute('data-turnos-nav') === mod);
    });
    if (mod === 'dashboard') renderDashboard();
    else if (mod === 'manage') renderManage();
    else if (mod === 'export') renderExport();
    else if (mod === 'config') renderConfig();
  }

  function renderDashboard() {
    var host = $('turnosViewDashboard');
    if (!host) return;
    var data = S().getState();
    var stats = C().statsToday(data.entries);
    var last = data.counter > 0 ? C().formatTurno(data.counter) : '—';

    host.innerHTML =
      '<div class="turnos-kpi-grid turnos-kpi-grid--admin">' +
      kpi('Total hoy', stats.totalHoy, 'blue') +
      kpi('Pendientes', stats.pendientes, 'red') +
      kpi('En proceso', stats.enProceso, 'process') +
      kpi('Completados', stats.completados, 'green') +
      kpi('Notas pend.', stats.notasPendientes, 'red') +
      kpi('Confirmados', stats.confirmados, 'process') +
      kpi('Asentados', stats.asentados, 'green') +
      kpi('Último turno', last, 'gray', true) +
      '</div>' +
      '<div class="turnos-split">' +
      '<section class="turnos-panel"><h2>Turnos recientes</h2>' + adminTableHtml(data.entries.slice(0, 10), true) + '</section>' +
      '<aside class="turnos-panel turnos-quick">' +
      '<h2>Acciones</h2>' +
      '<button type="button" class="turnos-btn turnos-btn--primary turnos-btn--xl" data-admin-action="manage">Gestionar turnos</button>' +
      '<button type="button" class="turnos-btn turnos-btn--secondary turnos-btn--xl" data-admin-action="export-xlsx">Exportar Excel</button>' +
      '<button type="button" class="turnos-btn turnos-btn--secondary turnos-btn--xl" data-admin-action="export-csv">Exportar CSV</button>' +
      '</aside></div>';
  }

  function kpi(label, value, tone, mono) {
    return '<article class="turnos-kpi turnos-kpi--' + tone + '"><span class="turnos-kpi-label">' + esc(label) +
      '</span><strong' + (mono ? ' class="turnos-mono"' : '') + '>' + esc(String(value)) + '</strong></article>';
  }

  function renderManage() {
    var host = $('turnosViewManage');
    if (!host) return;
    var data = S().getState();
    host.innerHTML =
      '<section class="turnos-panel">' +
      '<h2>Gestión de turnos</h2>' +
      '<p class="turnos-sub">Solo personal autorizado puede cambiar estados. Notas de crédito: Pendiente → Confirmado → Asentado.</p>' +
      adminTableHtml(data.entries, false) +
      '</section>';
  }

  function renderExport() {
    var host = $('turnosViewExport');
    if (!host) return;
    var n = S().getState().entries.length;
    host.innerHTML =
      '<section class="turnos-panel turnos-export-cards">' +
      '<h2>Exportar</h2><p class="turnos-sub">' + n + ' registros.</p>' +
      '<button type="button" class="turnos-export-card" data-admin-action="export-xlsx"><span class="turnos-export-icon">📊</span><strong>Excel (.xlsx)</strong></button>' +
      '<button type="button" class="turnos-export-card" data-admin-action="export-csv"><span class="turnos-export-icon">📄</span><strong>CSV</strong></button>' +
      '</section>';
  }

  function renderConfig() {
    var host = $('turnosViewConfig');
    if (!host) return;
    host.innerHTML =
      '<section class="turnos-panel">' +
      '<h2>Configuración</h2>' +
      '<p class="turnos-sub">Usuario: <strong>' + esc(state.adminUser && (state.adminUser.name || state.adminUser.username)) + '</strong></p>' +
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
        Estado: e.estado
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
      var btn = ev.target.closest('[data-admin-action]');
      if (!btn) return;
      var action = btn.getAttribute('data-admin-action');
      if (action === 'manage') setModule('manage');
      else if (action === 'export-xlsx') exportXlsx();
      else if (action === 'export-csv') exportCsv();
      else if (action === 'reset') {
        if (confirm('¿Reiniciar numeración de turnos?')) {
          S().resetCounter();
          refresh();
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
      var result = S().setEstado(id, estado, userName);
      if (!result.ok) {
        alert(result.msg);
        refresh();
        return;
      }
      refresh();
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
    S().load();
    bind();
    if (state._unsub) state._unsub();
    state._unsub = S().subscribe(function () { refresh(); });
    updateClock();
    setInterval(updateClock, 1000);
    var label = $('turnosAdminUserLabel');
    if (label && user) label.textContent = (user.name || user.username || 'Admin') + ' (' + (user.role || 'admin') + ')';
    setModule('dashboard');
  }

  function show() {
    var root = $('turnosAdminRoot');
    if (root) root.classList.remove('is-hidden');
  }

  function hide() {
    var root = $('turnosAdminRoot');
    if (root) root.classList.add('is-hidden');
  }

  global.PlatformTurnosAdmin = { start: start, show: show, hide: hide, refresh: refresh };
})(typeof window !== 'undefined' ? window : this);
