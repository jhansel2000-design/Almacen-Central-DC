/**
 * Control de Turnos — UI, escáner QR, exportación
 */
(function (global) {
  'use strict';

  var C = function () { return global.PlatformTurnosCore; };
  var state = { entries: [], counter: 0, module: 'dashboard', scanner: null, scanning: false };
  var operatorName = 'Operador DC';

  function $(id) { return document.getElementById(id); }

  function esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function persist() {
    C().saveState({ counter: state.counter, entries: state.entries });
  }

  function load() {
    var s = C().loadState();
    state.counter = s.counter;
    state.entries = s.entries;
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
    else if (mod === 'history') renderHistory();
    else if (mod === 'export') renderExport();
    else if (mod === 'config') renderConfig();
    else if (mod === 'scan') renderScan();
    if (mod !== 'scan') stopScanner();
  }

  function updateClock() {
    var now = new Date();
    var timeEl = $('turnosClockTime');
    var dateEl = $('turnosClockDate');
    if (timeEl) {
      timeEl.textContent = now.toLocaleTimeString('es-ES', {
        hour: '2-digit', minute: '2-digit', second: '2-digit'
      });
    }
    if (dateEl) {
      dateEl.textContent = now.toLocaleDateString('es-ES', {
        weekday: 'long', day: '2-digit', month: 'long', year: 'numeric'
      });
    }
  }

  function statusBadge(estado) {
    var ok = estado === 'VALIDADO';
    return '<span class="turnos-badge turnos-badge--' + (ok ? 'ok' : 'pending') + '">' + esc(estado) + '</span>';
  }

  function renderDashboard() {
    var host = $('turnosViewDashboard');
    if (!host) return;
    var stats = C().statsToday(state.entries);
    var last = state.counter > 0 ? C().formatTurno(state.counter) : '—';

    host.innerHTML =
      '<div class="turnos-kpi-grid">' +
      '<article class="turnos-kpi turnos-kpi--blue"><span class="turnos-kpi-label">Total turnos hoy</span><strong>' + stats.totalHoy + '</strong></article>' +
      '<article class="turnos-kpi turnos-kpi--green"><span class="turnos-kpi-label">Validados</span><strong>' + stats.validados + '</strong></article>' +
      '<article class="turnos-kpi turnos-kpi--red"><span class="turnos-kpi-label">Pendientes</span><strong>' + stats.pendientes + '</strong></article>' +
      '<article class="turnos-kpi turnos-kpi--gray"><span class="turnos-kpi-label">Último turno</span><strong class="turnos-mono">' + esc(last) + '</strong></article>' +
      '</div>' +
      '<div class="turnos-split">' +
      '<section class="turnos-panel"><h2>Historial de turnos</h2>' + historyTableHtml(state.entries.slice(0, 8), true) + '</section>' +
      '<aside class="turnos-panel turnos-quick">' +
      '<h2>Acciones rápidas</h2>' +
      '<button type="button" class="turnos-btn turnos-btn--primary turnos-btn--xl" data-turnos-action="go-scan">Escanear QR</button>' +
      '<button type="button" class="turnos-btn turnos-btn--secondary turnos-btn--xl" data-turnos-action="export-xlsx">Exportar a Excel</button>' +
      '<button type="button" class="turnos-btn turnos-btn--secondary turnos-btn--xl" data-turnos-action="export-csv">Exportar a CSV</button>' +
      '<button type="button" class="turnos-btn turnos-btn--danger turnos-btn--xl" data-turnos-action="reset">Reiniciar numeración</button>' +
      '</aside></div>';
  }

  function historyTableHtml(entries, compact) {
    if (!entries.length) {
      return '<p class="turnos-empty">Sin registros. Escanee un QR para generar el primer turno.</p>';
    }
    var rows = entries.map(function (e) {
      return '<tr><td class="turnos-mono turnos-turno">' + esc(e.turno) + '</td>' +
        '<td>' + esc(e.fecha) + '</td><td class="turnos-mono">' + esc(e.hora) + '</td>' +
        '<td class="turnos-qr-cell" title="' + esc(e.qrContent) + '">' + esc(e.qrContent) + '</td>' +
        '<td>' + statusBadge(e.estado) + '</td>' +
        (compact ? '' : '<td>' + (e.estado === 'PENDIENTE'
          ? '<button type="button" class="turnos-btn turnos-btn--sm turnos-btn--green" data-validate="' + esc(e.id) + '">Validar</button>'
          : '—') + '</td>') +
        '</tr>';
    }).join('');
    return '<div class="turnos-table-wrap"><table class="turnos-table"><thead><tr>' +
      '<th>Turno</th><th>Fecha</th><th>Hora</th><th>QR leído</th><th>Estado</th>' +
      (compact ? '' : '<th>Acción</th>') + '</tr></thead><tbody>' + rows + '</tbody></table></div>';
  }

  function renderHistory() {
    var host = $('turnosViewHistory');
    if (!host) return;
    host.innerHTML = '<section class="turnos-panel"><h2>Historial completo</h2>' +
      historyTableHtml(state.entries, false) + '</section>';
  }

  function renderExport() {
    var host = $('turnosViewExport');
    if (!host) return;
    host.innerHTML =
      '<section class="turnos-panel turnos-export-cards">' +
      '<h2>Exportar registros</h2>' +
      '<p class="turnos-sub">' + state.entries.length + ' movimientos guardados en este equipo.</p>' +
      '<button type="button" class="turnos-export-card" data-turnos-action="export-xlsx">' +
      '<span class="turnos-export-icon">📊</span><strong>Exportar a Excel</strong><span>.xlsx</span></button>' +
      '<button type="button" class="turnos-export-card" data-turnos-action="export-csv">' +
      '<span class="turnos-export-icon">📄</span><strong>Exportar a CSV</strong><span>.csv</span></button>' +
      '</section>';
  }

  function renderConfig() {
    var host = $('turnosViewConfig');
    if (!host) return;
    host.innerHTML =
      '<section class="turnos-panel">' +
      '<h2>Configuración</h2>' +
      '<label class="turnos-field"><span>Nombre del operador</span>' +
      '<input type="text" id="turnosOperatorName" class="turnos-input" maxlength="64" value="' + esc(operatorName) + '"></label>' +
      '<button type="button" class="turnos-btn turnos-btn--danger turnos-btn--xl" data-turnos-action="reset">Reiniciar numeración de turnos</button>' +
      '<p class="turnos-hint">El historial se conserva. Solo vuelve a T-0001 el contador.</p>' +
      '<button type="button" class="turnos-btn turnos-btn--secondary" data-turnos-action="load-samples">Cargar datos de prueba</button>' +
      '</section>';
  }

  function renderScan() {
    var host = $('turnosViewScan');
    if (!host) return;
    host.innerHTML =
      '<section class="turnos-panel turnos-scan-panel">' +
      '<h2>Escanear QR</h2>' +
      '<p class="turnos-sub">Apunte la cámara al código del operador o cliente.</p>' +
      '<div id="turnosQrReader" class="turnos-qr-reader"></div>' +
      '<div class="turnos-scan-actions">' +
      '<button type="button" class="turnos-btn turnos-btn--primary turnos-btn--xl" id="turnosBtnStartScan">Escanear QR</button>' +
      '<button type="button" class="turnos-btn turnos-btn--secondary turnos-btn--xl" id="turnosBtnStopScan" hidden>Detener cámara</button>' +
      '</div>' +
      '<div id="turnosScanStatus" class="turnos-scan-status" hidden></div>' +
      '<div id="turnosScanSuccess" class="turnos-scan-success" hidden></div>' +
      '</section>';
    bindScanButtons();
    startScanner();
  }

  function showScanSuccess(entry, qrContent) {
    var box = $('turnosScanSuccess');
    var status = $('turnosScanStatus');
    if (status) { status.hidden = true; }
    if (!box) return;
    box.hidden = false;
    box.innerHTML =
      '<div class="turnos-success-icon">✓</div>' +
      '<p class="turnos-success-title">¡Turno generado correctamente!</p>' +
      '<p class="turnos-success-turno turnos-mono">' + esc(entry.turno) + '</p>' +
      '<p class="turnos-success-qr">QR: <strong>' + esc(qrContent) + '</strong></p>' +
      '<p class="turnos-success-meta">' + esc(entry.fecha) + ' · ' + esc(entry.hora) + '</p>' +
      '<button type="button" class="turnos-btn turnos-btn--primary turnos-btn--xl" data-turnos-action="rescan">Escanear otro QR</button>';
  }

  function registerQr(qrContent) {
    var text = String(qrContent || '').trim();
    if (!text) return { ok: false, msg: 'QR vacío.' };
    if (C().isDuplicate(state.entries, text)) {
      return { ok: false, msg: 'Este QR ya generó turno hace menos de 10 segundos.' };
    }
    state.counter += 1;
    var entry = C().createEntry(state.counter, text);
    state.entries.unshift(entry);
    persist();
    C().playBeep();
    return { ok: true, entry: entry, qr: text };
  }

  function stopScanner() {
    if (!state.scanner) return;
    var sc = state.scanner;
    state.scanner = null;
    state.scanning = false;
    var p = sc.isScanning ? sc.stop().catch(function () {}) : Promise.resolve();
    p.then(function () {
      try { sc.clear(); } catch (e) { /* noop */ }
    });
    var startBtn = $('turnosBtnStartScan');
    var stopBtn = $('turnosBtnStopScan');
    if (startBtn) startBtn.hidden = false;
    if (stopBtn) stopBtn.hidden = true;
  }

  function startScanner() {
    if (state.scanning || !global.Html5Qrcode) return;
    var readerId = 'turnosQrReader';
    if (!$(readerId)) return;

    stopScanner();
    state.scanner = new global.Html5Qrcode(readerId);
    var lastText = '';
    var lastAt = 0;

    state.scanner.start(
      { facingMode: 'environment' },
      { fps: 10, qrbox: { width: 260, height: 260 } },
      function (decoded) {
        var text = String(decoded || '').trim();
        if (!text) return;
        var now = Date.now();
        if (text === lastText && now - lastAt < 1500) return;
        lastText = text;
        lastAt = now;

        var status = $('turnosScanStatus');
        if (status) {
          status.hidden = false;
          status.className = 'turnos-scan-status turnos-scan-status--info';
          status.textContent = 'QR detectado: ' + text + ' — Procesando…';
        }

        var result = registerQr(text);
        if (!result.ok) {
          if (status) {
            status.className = 'turnos-scan-status turnos-scan-status--err';
            status.textContent = result.msg;
          }
          return;
        }
        showScanSuccess(result.entry, result.qr);
      },
      function () { /* sin lectura */ }
    ).then(function () {
      state.scanning = true;
      var startBtn = $('turnosBtnStartScan');
      var stopBtn = $('turnosBtnStopScan');
      if (startBtn) startBtn.hidden = true;
      if (stopBtn) stopBtn.hidden = false;
    }).catch(function (err) {
      var status = $('turnosScanStatus');
      if (status) {
        status.hidden = false;
        status.className = 'turnos-scan-status turnos-scan-status--err';
        status.textContent = (err && err.message) || 'No se pudo activar la cámara.';
      }
    });
  }

  function bindScanButtons() {
    var startBtn = $('turnosBtnStartScan');
    var stopBtn = $('turnosBtnStopScan');
    if (startBtn && !startBtn.dataset.bound) {
      startBtn.dataset.bound = '1';
      startBtn.addEventListener('click', startScanner);
    }
    if (stopBtn && !stopBtn.dataset.bound) {
      stopBtn.dataset.bound = '1';
      stopBtn.addEventListener('click', stopScanner);
    }
  }

  function validateTurno(id) {
    state.entries = state.entries.map(function (e) {
      return e.id === id ? Object.assign({}, e, { estado: 'VALIDADO' }) : e;
    });
    persist();
    if (state.module === 'history') renderHistory();
    else if (state.module === 'dashboard') renderDashboard();
  }

  function resetCounter() {
    if (!confirm('¿Reiniciar numeración? El historial se conserva.')) return;
    state.counter = 0;
    persist();
    refresh();
  }

  function loadSamples() {
    var day = C().todayKey();
    state.counter = 3;
    state.entries = [
      { id: 's1', turno: 'T-0001', fecha: day, hora: '08:15:22', qrContent: 'DESPACHO-CLIENTE-A', estado: 'VALIDADO', createdAt: Date.now() - 7200000 },
      { id: 's2', turno: 'T-0002', fecha: day, hora: '08:18:05', qrContent: 'DESPACHO-CLIENTE-B', estado: 'PENDIENTE', createdAt: Date.now() - 5400000 },
      { id: 's3', turno: 'T-0003', fecha: day, hora: '09:02:41', qrContent: 'MONTACARGAS-ZEBRA-07', estado: 'PENDIENTE', createdAt: Date.now() - 3600000 }
    ];
    persist();
    refresh();
  }

  function rowsForExport() {
    return state.entries.map(function (e) {
      return { Turno: e.turno, Fecha: e.fecha, Hora: e.hora, 'QR leído': e.qrContent, Estado: e.estado };
    });
  }

  function exportCsv() {
    if (!state.entries.length) { alert('No hay datos para exportar.'); return; }
    var XLSX = global.XLSX;
    if (!XLSX) { alert('Librería Excel no cargada.'); return; }
    var ws = XLSX.utils.json_to_sheet(rowsForExport());
    var csv = XLSX.utils.sheet_to_csv(ws);
    var blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
    downloadBlob(blob, 'turnos_despacho_' + C().todayKey() + '.csv');
  }

  function exportXlsx() {
    if (!state.entries.length) { alert('No hay datos para exportar.'); return; }
    var XLSX = global.XLSX;
    if (!XLSX) { alert('Librería Excel no cargada.'); return; }
    var ws = XLSX.utils.json_to_sheet(rowsForExport());
    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Turnos');
    XLSX.writeFile(wb, 'turnos_despacho_' + C().todayKey() + '.xlsx');
  }

  function downloadBlob(blob, name) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  }

  function refresh() {
    setModule(state.module);
  }

  function bindApp() {
    document.body.addEventListener('click', function (ev) {
      var nav = ev.target.closest('[data-turnos-nav]');
      if (nav) {
        ev.preventDefault();
        setModule(nav.getAttribute('data-turnos-nav'));
        return;
      }
      var validateBtn = ev.target.closest('[data-validate]');
      if (validateBtn) {
        validateTurno(validateBtn.getAttribute('data-validate'));
        return;
      }
      var actionBtn = ev.target.closest('[data-turnos-action]');
      if (!actionBtn) return;
      var action = actionBtn.getAttribute('data-turnos-action');
      if (action === 'go-scan') setModule('scan');
      else if (action === 'export-xlsx') exportXlsx();
      else if (action === 'export-csv') exportCsv();
      else if (action === 'reset') resetCounter();
      else if (action === 'load-samples') loadSamples();
      else if (action === 'rescan') {
        var ok = $('turnosScanSuccess');
        if (ok) ok.hidden = true;
        startScanner();
      }
    });

    var opInput = document.body;
    opInput.addEventListener('change', function (ev) {
      if (ev.target.id === 'turnosOperatorName') {
        operatorName = ev.target.value.trim() || 'Operador DC';
        var label = $('turnosOperatorLabel');
        if (label) label.textContent = operatorName;
      }
    });
  }

  function start() {
    load();
    bindApp();
    updateClock();
    setInterval(updateClock, 1000);
    setModule('dashboard');
  }

  global.PlatformTurnosUI = { start: start, setModule: setModule, stopScanner: stopScanner };
})(typeof window !== 'undefined' ? window : this);
