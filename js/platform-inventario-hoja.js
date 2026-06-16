/**
 * Hoja de inventario — libro Excel web (3 hojas: Inventario · Cuadre · Contado)
 */
(function (global) {
  'use strict';

  var CONC, SYNC, toastFn, escFn;
  var wb = {
    sheet: 'inventario',
    sistemaRows: [],
    contadoRows: [],
    meta: {},
    concRows: [],
    scanMap: {},
    stats: { ok: 0, revisar: 0, total: 0, accuracy: 0 }
  };

  var INV_COLS = ['location', 'barcode', 'product', 'matricula', 'pack', 'qtyCj'];
  var INV_LABELS = ['Ubicación', 'Código', 'Producto', 'Matrícula', 'Empaque', 'Sistema CJ'];
  var CONT_COLS = ['location', 'barcode', 'matricula', 'qtyContada', 'userId', 'notas'];
  var CONT_LABELS = ['Ubicación', 'Código', 'Matrícula', 'Contado CJ', 'Usuario', 'Notas'];

  function $(id) { return document.getElementById(id); }

  function fmtQty(v) {
    if (v == null || v === '') return '—';
    var n = Number(v);
    return isNaN(n) ? '—' : String(n);
  }

  function fmtDate(iso) {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleString('es-DO', {
        day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
      });
    } catch (e) { return String(iso); }
  }

  function blankContadoRow() {
    return { location: '', barcode: '', matricula: '', qtyContada: '', userId: '', notas: '' };
  }

  function ensureContadoRows() {
    if (!wb.contadoRows.length) wb.contadoRows.push(blankContadoRow());
  }

  function loadAll() {
    var cached = CONC.loadSistemaCache();
    wb.sistemaRows = cached.rows || [];
    wb.meta = cached.meta || {};
    wb.contadoRows = CONC.loadContadoCache();
    ensureContadoRows();
  }

  function persistSistema() {
    wb.meta = wb.meta || {};
    wb.meta.count = wb.sistemaRows.length;
    wb.meta.importedAt = new Date().toISOString();
    wb.meta.fileName = wb.meta.fileName || 'Pegado en hoja';
    wb.meta.formatLabel = wb.meta.formatLabel || 'Hoja Inventario';
    return CONC.saveSistemaCache(wb.sistemaRows, wb.meta);
  }

  function persistContado() {
    return CONC.saveContadoCache(wb.contadoRows.filter(function (r) {
      return String(r.location || '').trim() || String(r.barcode || '').trim();
    }));
  }

  function recompute() {
    wb.concRows = CONC.buildConciliationFromSources(wb.sistemaRows, wb.scanMap, wb.contadoRows);
    wb.stats = CONC.dashboardStats(wb.concRows);
  }

  function renderKpis() {
    var s = wb.stats;
    if ($('ixhKpiOk')) $('ixhKpiOk').textContent = String(s.ok);
    if ($('ixhKpiRev')) $('ixhKpiRev').textContent = String(s.revisar);
    if ($('ixhKpiTotal')) $('ixhKpiTotal').textContent = String(s.total);
    if ($('ixhKpiAcc')) $('ixhKpiAcc').textContent = s.total ? (s.accuracy + '%') : '—';
    if ($('ixhRowCount')) {
      var n = wb.sheet === 'inventario' ? wb.sistemaRows.length
        : (wb.sheet === 'contado' ? wb.contadoRows.length : wb.concRows.length);
      $('ixhRowCount').textContent = n.toLocaleString('es-DO') + ' filas';
    }
    var live = $('ixhLive');
    if (live) {
      live.textContent = SYNC && SYNC.isOnline && SYNC.isOnline() ? '● Conteo en vivo' : '○ Sin enlace en vivo';
      live.classList.toggle('is-on', !!(SYNC && SYNC.isOnline && SYNC.isOnline()));
    }
  }

  function renderInvGrid() {
    var tbody = $('ixhInvTbody');
    if (!tbody) return;
    if (!wb.sistemaRows.length) {
      tbody.innerHTML = '<tr><td colspan="6" class="inv-xwb-empty">Copie filas desde Dynamics y pulse <strong>Pegar</strong> o haga Ctrl+V aquí.</td></tr>';
      return;
    }
    tbody.innerHTML = wb.sistemaRows.map(function (r, idx) {
      return '<tr data-idx="' + idx + '">' +
        INV_COLS.map(function (c) {
          var val = c === 'qtyCj' ? (r.qtyCj != null ? r.qtyCj : '') : (r[c] || '');
          return '<td contenteditable="true" spellcheck="false" data-col="' + c + '">' + escFn(val) + '</td>';
        }).join('') +
        '</tr>';
    }).join('');
  }

  function renderContGrid() {
    var tbody = $('ixhContTbody');
    if (!tbody) return;
    ensureContadoRows();
    tbody.innerHTML = wb.contadoRows.map(function (r, idx) {
      return '<tr data-idx="' + idx + '">' +
        CONT_COLS.map(function (c) {
          var val = r[c] != null ? r[c] : '';
          return '<td contenteditable="true" spellcheck="false" data-col="' + c + '">' + escFn(val) + '</td>';
        }).join('') +
        '</tr>';
    }).join('');
  }

  function renderCuadreGrid() {
    var tbody = $('ixhCuadreTbody');
    if (!tbody) return;
    if (!wb.concRows.length) {
      tbody.innerHTML = '<tr><td colspan="10" class="inv-xwb-empty">Cargue inventario en la hoja <strong>Inventario</strong> y conteo en <strong>Contado</strong> o en vivo.</td></tr>';
      return;
    }
    tbody.innerHTML = wb.concRows.map(function (r) {
      var rowCls = r.status === 'Ok' ? 'row-ok' : (r.status === 'REVISAR' ? 'row-revisar' : '');
      var stCls = r.status === 'Ok' ? 'st-ok' : (r.status === 'REVISAR' ? 'st-revisar' : '');
      return '<tr class="' + rowCls + '">' +
        '<td>' + escFn(r.location) + '</td>' +
        '<td>' + escFn(r.barcode) + '</td>' +
        '<td>' + escFn(r.product) + '</td>' +
        '<td>' + escFn(r.matricula) + '</td>' +
        '<td>' + escFn(r.pack) + '</td>' +
        '<td class="num">' + fmtQty(r.qtySistema) + '</td>' +
        '<td class="num">' + fmtQty(r.qtyContada) + '</td>' +
        '<td class="' + stCls + '">' + escFn(r.status) + '</td>' +
        '<td>' + escFn(r.userId) + '</td>' +
        '<td>' + fmtDate(r.scannedAt) + '</td>' +
        '</tr>';
    }).join('');
  }

  function renderSheet() {
    document.querySelectorAll('[data-xwb-sheet]').forEach(function (panel) {
      panel.hidden = panel.getAttribute('data-xwb-sheet') !== wb.sheet;
    });
    document.querySelectorAll('[data-xwb-tab]').forEach(function (btn) {
      btn.classList.toggle('active', btn.getAttribute('data-xwb-tab') === wb.sheet);
    });
    var hint = $('ixhSheetHint');
    if (hint) {
      if (wb.sheet === 'inventario') {
        hint.textContent = 'Hoja 1 · Pegue «Inventario disponible» de Dynamics (CJ · almacén 300). Cada fila se conserva aunque se repita ubicación.';
      } else if (wb.sheet === 'contado') {
        hint.textContent = 'Hoja 3 · Digite o pegue lo contado. Prioridad sobre APK en el cuadre. Puede agregar filas.';
      } else {
        hint.textContent = 'Hoja 2 · Cuadre general automático: sistema vs contado (manual + en vivo).';
      }
    }
    if (wb.sheet === 'inventario') renderInvGrid();
    else if (wb.sheet === 'contado') renderContGrid();
    else renderCuadreGrid();
    renderKpis();
  }

  function setSheet(name) {
    wb.sheet = name || 'inventario';
    renderSheet();
  }

  function readEditableGrid(tbody, cols) {
    var rows = [];
    if (!tbody) return rows;
    tbody.querySelectorAll('tr[data-idx]').forEach(function (tr) {
      var row = {};
      tr.querySelectorAll('td[data-col]').forEach(function (td) {
        var col = td.getAttribute('data-col');
        var val = (td.textContent || '').trim();
        if (col === 'qtyCj' || col === 'qtyContada') {
          row[col] = val === '' ? '' : parseFloat(String(val).replace(',', '.')) || 0;
        } else {
          row[col] = val;
        }
      });
      var hasData = cols.some(function (c) {
        return row[c] != null && String(row[c]).trim() !== '';
      });
      if (hasData) rows.push(row);
    });
    return rows;
  }

  function syncFromDom() {
    if (wb.sheet === 'inventario') {
      var invBody = $('ixhInvTbody');
      if (invBody && invBody.querySelector('tr[data-idx]')) {
        wb.sistemaRows = readEditableGrid(invBody, INV_COLS).map(function (r) {
          return {
            location: r.location || '',
            barcode: r.barcode || '',
            product: r.product || '',
            matricula: r.matricula || '',
            pack: r.pack || 'CJ',
            qtyCj: r.qtyCj != null ? r.qtyCj : 0
          };
        });
      }
    } else if (wb.sheet === 'contado') {
      var contBody = $('ixhContTbody');
      if (contBody && contBody.querySelector('tr[data-idx]')) {
        wb.contadoRows = readEditableGrid(contBody, CONT_COLS);
        ensureContadoRows();
      }
    }
  }

  function saveWorkbook() {
    syncFromDom();
    var s1 = persistSistema();
    var s2 = persistContado();
    recompute();
    renderSheet();
    if (!s1.ok || !s2.ok) {
      toastFn('Guardado parcial: ' + (s1.error || s2.error || 'revise almacenamiento'), 'err');
    } else {
      toastFn('✓ Libro guardado en este navegador', 'ok');
    }
  }

  function applyPasteInventario(text) {
    var parsed = CONC.parsePasteText(text, { strictWarehouse: true });
    if (!parsed.rows.length) {
      parsed = CONC.parsePasteText(text, { strictWarehouse: false });
    }
    if (!parsed.rows.length) {
      toastFn('No se reconocieron filas. Copie desde Excel con Ubicación y Código.', 'err');
      return;
    }
    wb.sistemaRows = wb.sistemaRows.concat(parsed.rows);
    wb.meta.fileName = 'Pegado ' + new Date().toLocaleString('es-DO');
    wb.meta.formatLabel = parsed.format === 'dynamics_disponible' ? 'Dynamics pegado' : 'Pegado manual';
    persistSistema();
    recompute();
    renderSheet();
    toastFn('✓ ' + parsed.rows.length + ' filas pegadas · total ' + wb.sistemaRows.length, 'ok');
  }

  function applyPasteContado(text) {
    var parsed = CONC.parsePasteText(text, { strictWarehouse: false });
    var added = [];
    if (parsed.rows.length) {
      parsed.rows.forEach(function (r) {
        added.push({
          location: r.location,
          barcode: r.barcode,
          matricula: r.matricula || '',
          qtyContada: r.qtyCj != null ? r.qtyCj : '',
          userId: '',
          notas: ''
        });
      });
    } else {
      var lines = String(text || '').split(/\r?\n/).filter(function (l) { return l.trim(); });
      var sep = lines[0] && lines[0].indexOf('\t') >= 0 ? '\t' : ';';
      lines.forEach(function (line) {
        var p = line.split(sep);
        if (p.length < 2) return;
        added.push({
          location: (p[0] || '').trim(),
          barcode: (p[1] || '').trim(),
          matricula: (p[2] || '').trim(),
          qtyContada: (p[3] || '').trim(),
          userId: (p[4] || '').trim(),
          notas: (p[5] || '').trim()
        });
      });
    }
    if (!added.length) {
      toastFn('No se reconocieron filas de contado', 'err');
      return;
    }
    wb.contadoRows = wb.contadoRows.filter(function (r) {
      return String(r.location || '').trim() || String(r.barcode || '').trim();
    }).concat(added);
    ensureContadoRows();
    persistContado();
    recompute();
    renderSheet();
    toastFn('✓ ' + added.length + ' líneas de contado pegadas', 'ok');
  }

  function pasteFromClipboard() {
    if (navigator.clipboard && navigator.clipboard.readText) {
      navigator.clipboard.readText().then(function (text) {
        if (wb.sheet === 'contado') applyPasteContado(text);
        else applyPasteInventario(text);
      }).catch(function () {
        toastFn('Use Ctrl+V sobre la tabla o permita acceso al portapapeles', 'err');
      });
      return;
    }
    toastFn('Pulse Ctrl+V sobre la tabla para pegar', 'info');
  }

  function clearCurrentSheet() {
    if (wb.sheet === 'inventario') {
      if (!wb.sistemaRows.length) return;
      if (!global.confirm('¿Borrar todas las filas de la hoja Inventario?')) return;
      wb.sistemaRows = [];
      wb.meta = {};
      CONC.clearSistemaCache();
    } else if (wb.sheet === 'contado') {
      if (!global.confirm('¿Borrar todas las filas de contado manual?')) return;
      wb.contadoRows = [blankContadoRow()];
      CONC.clearContadoCache();
    } else {
      toastFn('La hoja Cuadre general se calcula sola', 'info');
      return;
    }
    recompute();
    renderSheet();
    toastFn('Hoja limpiada', 'ok');
  }

  function addContadoRow() {
    syncFromDom();
    wb.contadoRows.push(blankContadoRow());
    wb.sheet = 'contado';
    renderSheet();
    var wrap = $('ixhContWrap');
    if (wrap) wrap.scrollTop = wrap.scrollHeight;
  }

  function loadExcelFile(file) {
    if (!file || !CONC || !global.XLSX) return;
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var book = global.XLSX.read(reader.result, { type: 'array', cellDates: false });
        var parsed = CONC.parseWorkbook(book, file.name);
        wb.sistemaRows = parsed.rows || [];
        wb.meta = parsed.meta || {};
        wb.meta.fileName = file.name;
        persistSistema();
        recompute();
        renderSheet();
        toastFn('✓ ' + wb.sistemaRows.length + ' líneas importadas', 'ok');
      } catch (e) {
        toastFn('No se pudo leer el Excel', 'err');
      }
    };
    reader.readAsArrayBuffer(file);
  }

  function exportWorkbook() {
    syncFromDom();
    recompute();
    var name = 'inventario-dc-' + new Date().toISOString().slice(0, 10) + '.xlsx';
    if (CONC.exportWorkbookXlsx(wb.sistemaRows, wb.concRows, wb.contadoRows, name)) {
      toastFn('Excel descargado (3 hojas)', 'ok');
    } else {
      toastFn('No se pudo exportar — espere a que cargue SheetJS', 'err');
    }
  }

  function bindGridPaste(wrapId, handler) {
    var wrap = $(wrapId);
    if (!wrap || wrap.dataset.bound) return;
    wrap.dataset.bound = '1';
    wrap.addEventListener('paste', function (e) {
      var text = e.clipboardData && e.clipboardData.getData('text/plain');
      if (!text || !String(text).trim()) return;
      e.preventDefault();
      handler(text);
    });
  }

  function bindEvents() {
    document.querySelectorAll('[data-xwb-tab]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        syncFromDom();
        recompute();
        setSheet(btn.getAttribute('data-xwb-tab'));
      });
    });
    $('ixhBtnPaste') && $('ixhBtnPaste').addEventListener('click', pasteFromClipboard);
    $('ixhBtnSave') && $('ixhBtnSave').addEventListener('click', saveWorkbook);
    $('ixhBtnClear') && $('ixhBtnClear').addEventListener('click', clearCurrentSheet);
    $('ixhBtnAddRow') && $('ixhBtnAddRow').addEventListener('click', addContadoRow);
    $('ixhBtnExport') && $('ixhBtnExport').addEventListener('click', exportWorkbook);
    $('ixhBtnRefresh') && $('ixhBtnRefresh').addEventListener('click', refresh);
    var fileInput = $('ixhFileInput');
    $('ixhBtnImport') && $('ixhBtnImport').addEventListener('click', function () {
      if (fileInput) fileInput.click();
    });
    if (fileInput) {
      fileInput.addEventListener('change', function () {
        if (fileInput.files && fileInput.files[0]) loadExcelFile(fileInput.files[0]);
        fileInput.value = '';
      });
    }
    bindGridPaste('ixhInvWrap', applyPasteInventario);
    bindGridPaste('ixhContWrap', applyPasteContado);
  }

  function refresh() {
    if (!SYNC || !CONC) return Promise.resolve();
    return SYNC.fetchEntries().then(function (entries) {
      wb.scanMap = CONC.aggregateScans(entries);
      recompute();
      renderSheet();
    }).catch(function () {
      recompute();
      renderSheet();
    });
  }

  function init(deps) {
    CONC = deps.CONC;
    SYNC = deps.SYNC;
    toastFn = deps.toast || function () {};
    escFn = deps.esc || function (s) { return String(s || ''); };
    loadAll();
    recompute();
    bindEvents();
    renderSheet();
  }

  function show() {
    var shell = $('ixhApp');
    if (shell) {
      shell.hidden = false;
      shell.classList.remove('is-hidden');
    }
    refresh();
  }

  function hide() {
    var shell = $('ixhApp');
    if (shell) {
      shell.hidden = true;
      shell.classList.add('is-hidden');
    }
  }

  global.PlatformInventarioHoja = {
    init: init,
    show: show,
    hide: hide,
    refresh: refresh,
    saveWorkbook: saveWorkbook
  };
})(typeof window !== 'undefined' ? window : this);
