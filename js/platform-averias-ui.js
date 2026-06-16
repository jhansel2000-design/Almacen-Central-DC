/**
 * Portal Operaciones de Piso — UI (APK Warehouse App DC)
 */
(function (global) {
  'use strict';

  function mapSessionUser(user) {
    if (!user) return null;
    var wmsRole = user.role || 'operador';
    var floorRole = (wmsRole === 'administrador' || wmsRole === 'admin' || wmsRole === 'supervisor' || wmsRole === 'validador')
      ? 'CORRIGE' : 'REPORTA';
    return {
      name: user.name || user.username || 'Usuario',
      role: floorRole,
      wmsRole: wmsRole
    };
  }

  function parseOnclickArg(token, el, ev) {
    token = String(token || '').trim();
    if (!token) return undefined;
    if (token === 'this') return el;
    if (token === 'event') return ev;
    var q = token.charAt(0);
    if ((q === "'" || q === '"') && token.charAt(token.length - 1) === q) {
      return token.slice(1, -1);
    }
    if (/^-?\d+(?:\.\d+)?$/.test(token)) return Number(token);
    if (token === 'true') return true;
    if (token === 'false') return false;
    if (token === 'null') return null;
    return token;
  }

  function splitOnclickArgs(argsStr) {
    var args = [];
    var cur = '';
    var quote = null;
    for (var i = 0; i < argsStr.length; i++) {
      var c = argsStr[i];
      if (quote) {
        cur += c;
        if (c === quote && argsStr[i - 1] !== '\\') quote = null;
        continue;
      }
      if (c === "'" || c === '"') {
        quote = c;
        cur += c;
        continue;
      }
      if (c === ',') {
        args.push(cur);
        cur = '';
        continue;
      }
      cur += c;
    }
    if (cur.trim()) args.push(cur);
    return args;
  }

  function runOnclickAction(raw, el, ev) {
    raw = String(raw || '').trim();
    if (!raw) return;
    raw.split(';').forEach(function (stmt) {
      stmt = stmt.trim();
      if (!stmt) return;
      var match = stmt.match(/^([A-Za-z_$][\w.$]*)\s*\(([\s\S]*)\)$/);
      if (!match) throw new Error('Acción no reconocida: ' + stmt);
      var fn = global[match[1]];
      if (typeof fn !== 'function') throw new Error('Función no disponible: ' + match[1]);
      var argTokens = match[2].trim() ? splitOnclickArgs(match[2]) : [];
      var args = argTokens.map(function (t) { return parseOnclickArg(t, el, ev); });
      fn.apply(global, args);
    });
  }

  function bindInlineClickHandlers(root) {
    if (!root || !root.querySelectorAll) return;
    root.querySelectorAll('[onclick], [data-av-onclick]').forEach(function (el) {
      var raw = el.getAttribute('onclick') || el.getAttribute('data-av-onclick') || el.dataset.avOnclick;
      if (!raw || !String(raw).trim()) return;
      el.dataset.avOnclick = raw;
      el.removeAttribute('onclick');
      if (el.__avClickHandler) {
        el.removeEventListener('click', el.__avClickHandler);
      }
      el.__avClickHandler = function (ev) {
        try {
          runOnclickAction(el.dataset.avOnclick || raw, el, ev);
        } catch (err) {
          console.error('[Operaciones] Acción fallida:', el.dataset.avOnclick || raw, err);
          if (global.PlatformToast) global.PlatformToast.error('No se pudo ejecutar la acción.');
        }
      };
      el.addEventListener('click', el.__avClickHandler);
      el.dataset.avClickBound = '1';
    });
  }

  function initAveriasDelegatedActions() {
    var app = document.getElementById('avApp');
    if (!app || global.__avDelegatedBound) return;
    global.__avDelegatedBound = true;
    app.addEventListener('click', function (ev) {
      if (ev.target && ev.target.closest && ev.target.closest('[data-av-click-bound="1"]')) return;
      var drawerItem = ev.target.closest('.drawer-item[data-module]');
      if (drawerItem && drawerItem.dataset.module && typeof navigateToModule === 'function') {
        ev.preventDefault();
        navigateToModule(drawerItem.dataset.module);
        return;
      }
      if (ev.target.closest('#btn-menu') && typeof toggleDrawer === 'function') {
        ev.preventDefault();
        toggleDrawer();
        return;
      }
      if (ev.target.closest('#drawerOverlay') && typeof closeDrawer === 'function') {
        ev.preventDefault();
        closeDrawer();
      }
    });
  }

  function initAveriasClickBridge() {
    var app = document.getElementById('avApp');
    if (!app) return;
    initAveriasDelegatedActions();
    bindInlineClickHandlers(app);
    bindInlineClickHandlers(document.getElementById('cloudSetupModal'));
    if (global.__avClickBridgeObs) return;
    global.__avClickBridgeObs = new MutationObserver(function (mutations) {
      mutations.forEach(function (m) {
        m.addedNodes.forEach(function (node) {
          if (node.nodeType !== 1) return;
          if (node.hasAttribute && node.hasAttribute('onclick')) {
            bindInlineClickHandlers(node.parentNode || app);
          }
          bindInlineClickHandlers(node);
        });
      });
    });
    global.__avClickBridgeObs.observe(app, { childList: true, subtree: true });
  }

  function startApp(user) {
    currentEmployee = mapSessionUser(user);
    if (!currentEmployee) return;
    initAveriasClickBridge();
    var main = document.getElementById('mainApp');
    if (main) main.classList.remove('hidden');
    var drawerUser = document.getElementById('drawerUser');
    if (drawerUser) drawerUser.textContent = currentEmployee.name + ' (' + currentEmployee.role + ')';
    var auditAuditor = document.getElementById('auditAuditor');
    if (auditAuditor) auditAuditor.value = currentEmployee.name;
    var damageFecha = document.getElementById('damageFecha');
    if (damageFecha) damageFecha.value = new Date().toISOString().split('T')[0];
    initEquipmentFormDefaults();
    buildEquipmentChecklist();

    function finishBoot() {
      loadData({ bootstrap: true });
      refreshCurrentView();
      if (typeof closeDrawer === 'function') closeDrawer();
      initFitScreen();
      initCorrectionModal();
      showWelcome();
    }

    var cloud = global.PlatformAveriasCloudSync;
    if (cloud && cloud.ready) {
      cloud.ready().then(function () {
        return cloud.pull ? cloud.pull() : null;
      }).then(finishBoot).catch(finishBoot);
    } else if (cloud && cloud.pull) {
      cloud.pull().then(finishBoot).catch(finishBoot);
    } else {
      finishBoot();
    }
  }
// Data Management
        const productsCatalog = [
            { code: '7501001234567', description: 'Paleta Estándar 120x80 cm' },
            { code: '7501001234568', description: 'Paleta Europea EUR 120x80' },
            { code: '7501001234569', description: 'Paleta Americana 48x40 pulg' },
            { code: '7502009876543', description: 'Contenedor Plástico 600x400 mm' },
            { code: '7503001111222', description: 'Caja Cartón Corrugado Grande' },
            { code: '7504005555666', description: 'Tambor Plástico 200L' },
            { code: 'SKU8945', description: 'Paleta Industrial Reforzada' },
            { code: 'SKU1234', description: 'Base Plástica Nestable' },
            { code: 'PAL-001', description: 'Paleta Madera Nueva' },
            { code: 'PAL-002', description: 'Paleta Madera Reciclada' },
            { code: 'CON-100', description: 'Contenedor Azul Apilable' },
            { code: 'CAJ-200', description: 'Caja Exportación Reforzada' }
        ];

        const inventoryCatalog = [
            { location: 'R01-N02-P03', code: '7501001234567', description: 'Paleta Estándar 120x80 cm' },
            { location: 'R01-N02-P04', code: '7501001234568', description: 'Paleta Europea EUR 120x80' },
            { location: 'A01-1-01', code: 'SKU8945', description: 'Paleta Industrial Reforzada' },
            { location: 'A01-1-02', code: 'SKU1234', description: 'Base Plástica Nestable' },
            { location: 'B02-N03-P01', code: '7502009876543', description: 'Contenedor Plástico 600x400 mm' },
            { location: 'B02-N03-P02', code: '7503001111222', description: 'Caja Cartón Corrugado Grande' },
            { location: 'C03-N01-P05', code: 'PAL-001', description: 'Paleta Madera Nueva' },
            { location: 'C03-N01-P06', code: 'PAL-002', description: 'Paleta Madera Reciclada' }
        ];

        let currentEmployee = null;
        let incidences = [];
        let selectedSeverity = null;
        let allIncidences = [];
        let allDamages = [];
        let allSecurity = [];
        let allAudits = [];
        let allEquipmentInspections = [];
        let equipmentRegistry = {};
        let currentModule = 'home';
        let selectedDamageArea = null;
        let securityClass = 'No urgente';
        let selectedTurno = 'A';
        let hasPhoto = false;
        let pendingCorrection = null;
        var correctionLockUntil = 0;
        var editingRecord = null;
        var isLoadingRemoteSnapshot = false;

        function avCore() {
            return global.PlatformAveriasCore;
        }

        function escAv(value) {
            var C = avCore();
            return C ? C.escapeHtml(value) : String(value == null ? '' : value);
        }

        function auditAction(action, detail) {
            var C = avCore();
            if (C && C.auditLog) {
                C.auditLog(action, detail, currentEmployee && currentEmployee.name);
            }
        }

        const moduleTitles = {
            home: 'Almacén Central',
            pallets: 'Paletas Rotas',
            damages: 'Averías',
            security: 'Incidencias de Seguridad',
            audit: 'Auditoría 5S',
            equipment: 'Inspección de Equipos'
        };

        const equipmentCheckItems = [
            { key: 'bateriaOk', label: 'Nivel de batería', critical: false },
            { key: 'fluidosOk', label: 'Nivel de fluidos', critical: false },
            { key: 'frenosOk', label: 'Funcionamiento de frenos', critical: true },
            { key: 'luzCentellaOk', label: 'Luz centella mástil', critical: true },
            { key: 'bocinaOk', label: 'Bocina', critical: true },
            { key: 'pitoReversaOk', label: 'Pito de reversa', critical: true },
            { key: 'llantasOk', label: 'Llantas', critical: false },
            { key: 'extintorOk', label: 'Extintor', critical: false },
            { key: 'medidorTempOk', label: 'Funcionamiento medidor de temperatura', critical: false }
        ];

        let feedbackAudioCtx = null;

        function playSelectFeedback() {
            if (navigator.vibrate) {
                navigator.vibrate(35);
            }
            try {
                if (!feedbackAudioCtx) {
                    feedbackAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
                }
                const osc = feedbackAudioCtx.createOscillator();
                const gain = feedbackAudioCtx.createGain();
                osc.type = 'sine';
                osc.frequency.value = 740;
                gain.gain.value = 0.025;
                osc.connect(gain);
                gain.connect(feedbackAudioCtx.destination);
                osc.start();
                osc.stop(feedbackAudioCtx.currentTime + 0.045);
            } catch (e) {
                // Navegador sin soporte de audio
            }
        }

        function resolveProductDescription(code, location) {
            const trimmed = (code || '').trim();
            if (!trimmed) return '';

            if (location) {
                const inventoryMatch = inventoryCatalog.find(item =>
                    item.location.toUpperCase() === location.toUpperCase() &&
                    (item.code.toUpperCase() === trimmed.toUpperCase() || item.code.toUpperCase().endsWith(trimmed.toUpperCase()))
                );
                if (inventoryMatch) return inventoryMatch.description;
            }

            const exactMatch = productsCatalog.find(item => item.code.toUpperCase() === trimmed.toUpperCase());
            if (exactMatch) return exactMatch.description;

            const suffix = trimmed.length <= 4 ? trimmed : trimmed.slice(-4);
            const suffixMatch = productsCatalog.find(item => item.code.toUpperCase().endsWith(suffix.toUpperCase()));
            if (suffixMatch) return suffixMatch.description;

            const inventorySuffix = inventoryCatalog.find(item => item.code.toUpperCase().endsWith(suffix.toUpperCase()));
            return inventorySuffix ? inventorySuffix.description : '';
        }

        function lookupProductDescription() {
            const code = document.getElementById('reportProduct').value;
            const location = document.getElementById('reportLocation').value;
            const description = resolveProductDescription(code, location);
            const label = document.getElementById('reportProductDescription');

            if (description) {
                label.textContent = 'Producto: ' + description;
                label.style.display = 'block';
            } else {
                label.textContent = '';
                label.style.display = 'none';
            }
        }

        var FIT_KEY = 'averias_dc_fit_screen';
        var SNAPSHOT_KEY = 'averias_dc_snapshot';
        var memoryLocalSeq = 0;

        function datesHtml(record) {
            var C = avCore();
            return C ? C.datesBlockHtml(record, escAv) : '';
        }

        function buildSnapshot() {
            var prevSeq = memoryLocalSeq;
            try {
                var raw = localStorage.getItem(SNAPSHOT_KEY);
                if (raw) {
                    var prev = JSON.parse(raw);
                    prevSeq = Math.max(prevSeq, prev && prev.localSeq ? prev.localSeq : 0);
                }
            } catch (e) { /* noop */ }
            return {
                version: 1,
                localSeq: prevSeq,
                updatedAt: new Date().toISOString(),
                incidences: allIncidences.slice(),
                damages: allDamages.slice(),
                securityIncidents: allSecurity.slice(),
                audits5s: allAudits.slice(),
                equipmentInspections: allEquipmentInspections.slice(),
                equipmentRegistry: Object.assign({}, equipmentRegistry)
            };
        }

        function applySnapshot(snap, preferIncoming) {
            if (!snap || typeof snap !== 'object') return false;
            if (global.PlatformAveriasCloudSync && global.PlatformAveriasCloudSync.mergeAveriasSnapshots) {
                if (preferIncoming) {
                    snap = global.PlatformAveriasCloudSync.mergeAveriasSnapshots(snap, buildSnapshot());
                } else {
                    snap = global.PlatformAveriasCloudSync.mergeAveriasSnapshots(buildSnapshot(), snap);
                }
            }
            allIncidences = Array.isArray(snap.incidences) ? snap.incidences.slice() : [];
            allDamages = Array.isArray(snap.damages) ? snap.damages.slice() : [];
            allSecurity = Array.isArray(snap.securityIncidents) ? snap.securityIncidents.slice() : [];
            allAudits = Array.isArray(snap.audits5s) ? snap.audits5s.slice() : [];
            allEquipmentInspections = Array.isArray(snap.equipmentInspections) ? snap.equipmentInspections.slice() : [];
            equipmentRegistry = snap.equipmentRegistry && typeof snap.equipmentRegistry === 'object'
                ? Object.assign({}, snap.equipmentRegistry) : {};
            memoryLocalSeq = Math.max(memoryLocalSeq, snap.localSeq || 0);
            ensureRecordStatuses();
            return true;
        }

        function isPendingStatus(record) {
            var C = avCore();
            if (C && C.isPendingStatus) return C.isPendingStatus(record);
            return String(record && record.status || 'PENDIENTE').toUpperCase() !== 'CORREGIDO';
        }

        function isCorrectedStatus(record) {
            var C = avCore();
            if (C && C.isCorrectedStatus) return C.isCorrectedStatus(record);
            return !isPendingStatus(record);
        }

        function assignMissingIds(list, seedBase) {
            var maxId = list.reduce(function (max, r) {
                var n = Number(r && r.id);
                return isFinite(n) && n > max ? n : max;
            }, seedBase || Date.now());
            var assigned = false;
            list.forEach(function (r) {
                if (!r) return;
                if (r.id == null || r.id === '') {
                    maxId += 1;
                    r.id = maxId;
                    assigned = true;
                }
                if (!r.status) r.status = 'PENDIENTE';
            });
            return assigned;
        }

        function ensureRecordStatuses() {
            var changed = false;
            changed = assignMissingIds(allIncidences, 1000) || changed;
            changed = assignMissingIds(allDamages, 200000) || changed;
            changed = assignMissingIds(allSecurity, 300000) || changed;
            changed = assignMissingIds(allAudits, 400000) || changed;
            allIncidences.forEach(function (r) { if (r && !r.status) r.status = 'PENDIENTE'; });
            allDamages.forEach(function (r) { if (r && !r.status) r.status = 'PENDIENTE'; });
            allSecurity.forEach(function (r) { if (r && !r.status) r.status = 'PENDIENTE'; });
            allAudits.forEach(function (r) { if (r && !r.status) r.status = 'PENDIENTE'; });
            var C = avCore();
            if (C && C.normalizeRecordTimestamps) {
                allIncidences.forEach(C.normalizeRecordTimestamps);
                allDamages.forEach(C.normalizeRecordTimestamps);
                allSecurity.forEach(C.normalizeRecordTimestamps);
                allAudits.forEach(C.normalizeRecordTimestamps);
            }
            return changed;
        }

        function sameRecordId(a, b) {
            return String(a) === String(b);
        }

        function findById(list, id) {
            var found = list.find(function (r) { return sameRecordId(r.id, id); });
            if (found) return found;
            var numId = Number(id);
            if (!isNaN(numId)) {
                return list.find(function (r) { return Number(r.id) === numId; });
            }
            return undefined;
        }

        function writeIndividualKeys() {
            localStorage.setItem('averias_dc_incidences', JSON.stringify(allIncidences));
            localStorage.setItem('averias_dc_damages', JSON.stringify(allDamages));
            localStorage.setItem('averias_dc_securityIncidents', JSON.stringify(allSecurity));
            localStorage.setItem('averias_dc_audits5s', JSON.stringify(allAudits));
            localStorage.setItem('averias_dc_equipmentInspections', JSON.stringify(allEquipmentInspections));
            localStorage.setItem('averias_dc_equipmentRegistry', JSON.stringify(equipmentRegistry));
        }

        function persistLocalOnly() {
            ensureRecordStatuses();
            writeIndividualKeys();
            var snap = buildSnapshot();
            snap.updatedAt = new Date().toISOString();
            localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snap));
        }

        function persistSnapshot(options) {
            options = options || {};
            if (isLoadingRemoteSnapshot && !options.force) {
                return Promise.resolve({ ok: false, skipped: true });
            }
            try {
                var idsAssigned = ensureRecordStatuses();
                writeIndividualKeys();
                var snap = buildSnapshot();
                if (global.PlatformAveriasCloudSync && global.PlatformAveriasCloudSync.beginLocalEdit) {
                    global.PlatformAveriasCloudSync.beginLocalEdit(snap);
                }
                snap.updatedAt = new Date().toISOString();
                if (!options.seqAlreadyBumped) {
                    snap.localSeq = (snap.localSeq || 0) + 1;
                    memoryLocalSeq = snap.localSeq;
                }
                localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snap));
                if (!localStorage.getItem(SNAPSHOT_KEY)) {
                    return Promise.resolve({ ok: false, error: 'storage-blocked' });
                }
                lastUiSignature = contentSignature(snap);
                if (global.PlatformAveriasCloudSync && global.PlatformAveriasCloudSync.noteLocalSave) {
                    global.PlatformAveriasCloudSync.noteLocalSave(snap);
                }
                updateAllStats();
                try {
                    global.dispatchEvent(new CustomEvent('averias-updated', { detail: { source: 'local-save' } }));
                } catch (e) { /* noop */ }
                if (options.localOnly || options.bootstrap) {
                    return Promise.resolve({ ok: true, localOnly: true });
                }
                if (global.PlatformAveriasCloudSync && global.PlatformAveriasCloudSync.publishChange) {
                    return global.PlatformAveriasCloudSync.publishChange(snap, options.liveRecord || null).then(function (result) {
                        var cloud = global.PlatformAveriasCloudSync.isCloudConfigured &&
                            global.PlatformAveriasCloudSync.isCloudConfigured();
                        if (result && !result.cloud && cloud) {
                            if (global.PlatformToast) {
                                global.PlatformToast.error('No se publicó en la nube. Compruebe conexión y recargue (Ctrl+F5).', 8000);
                            }
                        } else if (result && result.cloud && global.PlatformToast) {
                            global.PlatformToast.success('Publicado — todos los usuarios lo ven en vivo', 2500);
                        }
                        return { ok: true, cloud: !!(result && result.cloud) };
                    });
                }
                if (global.PlatformAveriasCloudSync && global.PlatformAveriasCloudSync.push) {
                    return global.PlatformAveriasCloudSync.push(snap, 3, { wait: true }).then(function (result) {
                        return { ok: !!(result && result.ok), cloud: !!(result && result.cloud) };
                    });
                }
                return Promise.resolve({ ok: true, localOnly: true });
            } catch (e) {
                return Promise.resolve({ ok: false, error: e });
            }
        }

        function persistSnapshotSync(options) {
            persistSnapshot(options);
        }

        function loadDataFromLegacyKeys() {
            const stored = localStorage.getItem('averias_dc_incidences');
            if (stored) allIncidences = JSON.parse(stored);
            const d = localStorage.getItem('averias_dc_damages');
            if (d) allDamages = JSON.parse(d);
            const s = localStorage.getItem('averias_dc_securityIncidents');
            if (s) allSecurity = JSON.parse(s);
            const a = localStorage.getItem('averias_dc_audits5s');
            if (a) allAudits = JSON.parse(a);
            const eq = localStorage.getItem('averias_dc_equipmentInspections');
            if (eq) allEquipmentInspections = JSON.parse(eq);
            const reg = localStorage.getItem('averias_dc_equipmentRegistry');
            if (reg) equipmentRegistry = JSON.parse(reg);
        }

        function loadData(options) {
            options = options || {};
            const snapRaw = localStorage.getItem(SNAPSHOT_KEY);
            if (snapRaw) {
                try {
                    if (applySnapshot(JSON.parse(snapRaw))) {
                        if (ensureRecordStatuses()) persistLocalOnly();
                        updateAllStats();
                        lastUiSignature = contentSignature(buildSnapshot());
                        return;
                    }
                } catch (e) { /* fallback legacy */ }
            }
            loadDataFromLegacyKeys();
            ensureRecordStatuses();
            persistLocalOnly();
            updateAllStats();
            lastUiSignature = contentSignature(buildSnapshot());
        }

        function updateAllStats() {
            updateStats();
            updateDamagesStats();
            updateSecurityStats();
            updateAuditStats();
            renderReportedWorkLists();
        }

        function refreshCurrentView() {
            updateAllStats();
            if (currentModule === 'pallets') {
                if (!document.getElementById('palletsCorrect').classList.contains('hidden')) filterIncidences();
                else if (!document.getElementById('palletsReport').classList.contains('hidden')) { /* form */ }
                else showPalletsDashboard();
            } else if (currentModule === 'damages') {
                if (!document.getElementById('damagesCorrect').classList.contains('hidden')) filterDamagesPending();
                else if (!document.getElementById('damagesFormPanel').classList.contains('hidden')) { /* form */ }
                else showDamagesDashboard();
            } else if (currentModule === 'security') {
                if (!document.getElementById('securityCorrect').classList.contains('hidden')) filterSecurityPending();
                else if (!document.getElementById('securityFormPanel').classList.contains('hidden')) { /* form */ }
                else showSecurityDashboard();
            } else if (currentModule === 'audit') {
                if (!document.getElementById('auditCorrect').classList.contains('hidden')) filterAuditPending();
                else if (!document.getElementById('auditFormPanel').classList.contains('hidden')) { /* form */ }
                else showAuditDashboard();
            } else if (currentModule === 'equipment') {
                if (!document.getElementById('equipmentCorrect').classList.contains('hidden')) renderEquipmentCorrectList();
                else if (!document.getElementById('equipmentListPanel').classList.contains('hidden')) renderEquipmentList();
                else if (!document.getElementById('equipmentFormPanel').classList.contains('hidden')) { /* form */ }
                else showEquipmentDashboard();
            }
        }

        var reloadSyncTimer = null;
        var lastUiSignature = '';
        var lastNewReportToastAt = 0;

        function contentSignature(snap) {
            if (global.PlatformAveriasCloudSync && global.PlatformAveriasCloudSync.contentSignature) {
                return global.PlatformAveriasCloudSync.contentSignature(snap);
            }
            if (!snap) return '';
            return [
                (snap.incidences || []).length,
                (snap.damages || []).length,
                (snap.securityIncidents || []).length,
                (snap.audits5s || []).length
            ].join(':');
        }

        function snapshotSignature(snap) {
            return contentSignature(snap);
        }

        function countReports(snap) {
            snap = snap || buildSnapshot();
            return {
                total: (snap.incidences || []).length + (snap.damages || []).length +
                    (snap.securityIncidents || []).length + (snap.audits5s || []).length,
                pending: allIncidences.filter(isPendingStatus).length +
                    allDamages.filter(isPendingStatus).length +
                    allSecurity.filter(isPendingStatus).length +
                    allAudits.filter(isPendingStatus).length
            };
        }

        function applyRemoteSnapshot(snap, opts) {
            opts = opts || {};
            if (!snap) return false;
            if (global.PlatformAveriasCloudSync) {
                if (global.PlatformAveriasCloudSync.isPushing && global.PlatformAveriasCloudSync.isPushing()) {
                    return false;
                }
                if (global.PlatformAveriasCloudSync.inLocalEditGrace &&
                    global.PlatformAveriasCloudSync.inLocalEditGrace()) {
                    return false;
                }
                if (global.PlatformAveriasCloudSync.shouldBlockStaleRemote &&
                    global.PlatformAveriasCloudSync.shouldBlockStaleRemote(snap)) {
                    return false;
                }
            }
            var sigBefore = lastUiSignature || contentSignature(buildSnapshot());
            var countsBefore = countReports(buildSnapshot());
            isLoadingRemoteSnapshot = true;
            try {
                applySnapshot(snap, true);
                writeIndividualKeys();
                var synced = buildSnapshot();
                synced.updatedAt = new Date().toISOString();
                localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(synced));
            } finally {
                isLoadingRemoteSnapshot = false;
            }
            lastUiSignature = contentSignature(buildSnapshot());
            var countsAfter = countReports(buildSnapshot());
            var changed = lastUiSignature !== sigBefore ||
                countsAfter.total !== countsBefore.total ||
                countsAfter.pending !== countsBefore.pending;
            if (opts.fromCloud || changed) {
                updateAllStats();
                var onReportForm = currentModule === 'pallets' &&
                    document.getElementById('palletsReport') &&
                    !document.getElementById('palletsReport').classList.contains('hidden');
                if (!onReportForm) refreshCurrentView();
                updateLiveChip(true);
            }
            if (opts.fromCloud && countsAfter.pending < countsBefore.pending && global.PlatformToast) {
                var resolvedNow = Date.now();
                if (resolvedNow - lastNewReportToastAt > 2500) {
                    lastNewReportToastAt = resolvedNow;
                    global.PlatformToast.success('Actualizado en vivo — trabajo finalizado en otro dispositivo', 3200);
                }
            }
            if (!opts.silent && countsAfter.pending > countsBefore.pending && global.PlatformToast) {
                var now = Date.now();
                if (now - lastNewReportToastAt > 2500) {
                    lastNewReportToastAt = now;
                    global.PlatformToast.info('Nuevo reporte en vivo — pantalla actualizada', 2800);
                }
            }
            return opts.fromCloud || changed;
        }

        function getSnapshotSignature() {
            return contentSignature(buildSnapshot());
        }

        function updateLiveChip(active) {
            var live = document.getElementById('avSyncLive');
            if (!live) return;
            var cloud = global.PlatformAveriasCloudSync && global.PlatformAveriasCloudSync.isCloudConfigured &&
                global.PlatformAveriasCloudSync.isCloudConfigured();
            live.hidden = !cloud;
            live.classList.toggle('is-pulse', !!active);
        }

        function reloadFromSync() {
            isLoadingRemoteSnapshot = true;
            try {
                var snapRaw = localStorage.getItem(SNAPSHOT_KEY);
                if (snapRaw) {
                    try {
                        applySnapshot(JSON.parse(snapRaw), true);
                        writeIndividualKeys();
                    } catch (e) {
                        loadData();
                    }
                } else {
                    loadData();
                }
            } finally {
                isLoadingRemoteSnapshot = false;
            }
            updateAllStats();
        }

        function reloadFromSyncDebounced(ev) {
            clearTimeout(reloadSyncTimer);
            if (global.PlatformAveriasCloudSync) {
                if (global.PlatformAveriasCloudSync.isPushing && global.PlatformAveriasCloudSync.isPushing()) return;
                if (global.PlatformAveriasCloudSync.inLocalEditGrace &&
                    global.PlatformAveriasCloudSync.inLocalEditGrace()) return;
            }
            if (ev && ev.detail) {
                if (ev.detail.source === 'push-ok' || ev.detail.source === 'local-save') return;
                if (ev.detail.source === 'apply') return;
            }
            reloadFromSync();
        }

        function refreshUiAfterLocalChange() {
            updateAllStats();
            refreshCurrentView();
        }

        function syncAveriasData() {
            playSelectFeedback();
            var tasks = [];
            if (global.PlatformAveriasCloudSync && global.PlatformAveriasCloudSync.pull) {
                tasks.push(global.PlatformAveriasCloudSync.pull());
            }
            if (global.PlatformLanSync && global.PlatformLanSync.forcePull) {
                tasks.push(global.PlatformLanSync.forcePull());
            }
            Promise.all(tasks.length ? tasks : [Promise.resolve()]).then(function () {
                reloadFromSync();
                var cloud = global.PlatformAveriasCloudSync && global.PlatformAveriasCloudSync.isCloudConfigured &&
                    global.PlatformAveriasCloudSync.isCloudConfigured();
                var msg = cloud
                    ? 'Reportes sincronizados — todos ven los mismos datos (Firebase en vivo)'
                    : 'Conectando sync… recargue con Ctrl+F5. No necesita JSONBin en GitHub Pages.';
                if (global.PlatformToast) {
                    global.PlatformToast[cloud ? 'success' : 'warn'](msg, 4500);
                } else {
                    alert(cloud ? '✅ ' + msg : '⚠️ ' + msg);
                }
            });
        }

        function openCloudSetupModal() {
            playSelectFeedback();
            var modal = document.getElementById('cloudSetupModal');
            var input = document.getElementById('cloudMasterKey');
            var status = document.getElementById('cloudSetupStatus');
            var fbPanel = document.getElementById('cloudSetupFirebasePanel');
            var jbPanel = document.getElementById('cloudSetupJsonBinPanel');
            var submit = document.getElementById('cloudSetupSubmit');
            var useFirebase = global.PlatformFirebaseBridge && global.PlatformFirebaseBridge.isEnabled &&
                global.PlatformFirebaseBridge.isEnabled();
            if (status) {
                status.hidden = true;
                status.textContent = '';
                status.className = 'av-cloud-status';
            }
            if (input) input.value = '';
            if (fbPanel) fbPanel.hidden = !useFirebase;
            if (jbPanel) jbPanel.hidden = !!useFirebase;
            if (submit) submit.textContent = useFirebase ? 'Sincronizar ahora' : 'Activar JSONBin';
            if (modal) modal.hidden = false;
            if (!useFirebase && input) global.setTimeout(function () { input.focus(); }, 100);
        }

        function closeCloudSetupModal() {
            var modal = document.getElementById('cloudSetupModal');
            if (modal) modal.hidden = true;
        }

        function submitCloudSetup() {
            var input = document.getElementById('cloudMasterKey');
            var submit = document.getElementById('cloudSetupSubmit');
            var status = document.getElementById('cloudSetupStatus');
            if (global.PlatformFirebaseBridge && global.PlatformFirebaseBridge.isEnabled &&
                global.PlatformFirebaseBridge.isEnabled()) {
                if (submit) submit.disabled = true;
                if (status) {
                    status.hidden = false;
                    status.className = 'av-cloud-status';
                    status.textContent = 'Conectando sync en vivo…';
                }
                var tasks = [];
                if (global.PlatformFirebaseBridge.ensureReady) {
                    tasks.push(global.PlatformFirebaseBridge.ensureReady());
                }
                if (global.PlatformAveriasCloudSync && global.PlatformAveriasCloudSync.pull) {
                    tasks.push(global.PlatformAveriasCloudSync.pull());
                }
                Promise.all(tasks.length ? tasks : [Promise.resolve()]).then(function () {
                    reloadFromSync();
                    if (status) {
                        status.className = 'av-cloud-status ok';
                        status.textContent = '✅ Sync en vivo activa — todos los celulares comparten reportes.';
                    }
                    if (global.PlatformToast) {
                        global.PlatformToast.success('Sync Firebase conectada. Misma URL en todos los dispositivos.', 5000);
                    }
                    global.setTimeout(closeCloudSetupModal, 1200);
                }).finally(function () {
                    if (submit) submit.disabled = false;
                });
                return;
            }
            var key = input ? String(input.value || '').trim() : '';
            if (!key) {
                if (status) {
                    status.hidden = false;
                    status.className = 'av-cloud-status err';
                    status.textContent = 'Ingrese la Master Key de jsonbin.io (solo servidor LAN local)';
                }
                return;
            }
            if (!global.PlatformAveriasCloudSync || !global.PlatformAveriasCloudSync.activateCloud) {
                alert('Actualice la página e intente de nuevo.');
                return;
            }
            if (submit) submit.disabled = true;
            if (status) {
                status.hidden = false;
                status.className = 'av-cloud-status';
                status.textContent = 'Activando nube…';
            }
            global.PlatformAveriasCloudSync.activateCloud(key).then(function (result) {
                reloadFromSync();
                if (status) {
                    status.className = 'av-cloud-status ok';
                    status.textContent = result.localOnly
                        ? ('✅ Activo en este celular (bin ' + result.binId + '). Para todos: SETUP-AVERIAS-CLOUD.bat en el PC.')
                        : ('✅ Nube activa — bin ' + result.binId + '. Espere ~2 min y recargue en los demás celulares.');
                }
                if (global.PlatformToast) {
                    global.PlatformToast.success(result.localOnly ? result.hint : 'Nube activada para todos los celulares', 6000);
                }
                global.setTimeout(function () {
                    closeCloudSetupModal();
                }, result.localOnly ? 4000 : 2500);
            }).catch(function (err) {
                if (status) {
                    status.className = 'av-cloud-status err';
                    status.textContent = 'Error: ' + (err.message || err);
                }
            }).finally(function () {
                if (submit) submit.disabled = false;
            });
        }

        function initAveriasSync() {
            document.addEventListener('lan-sync', function (ev) {
                if (ev.detail && ev.detail.store === 'averias') reloadFromSyncDebounced();
            });
            document.addEventListener('averias-updated', function (ev) {
                if (ev.detail && (ev.detail.source === 'push-ok' || ev.detail.source === 'local-save')) return;
                reloadFromSyncDebounced(ev);
            });
            document.addEventListener('averias-web-wiped', function () {
                var pull = global.PlatformAveriasCloudSync && global.PlatformAveriasCloudSync.pull;
                if (pull) {
                    pull().then(function () {
                        reloadFromSync();
                        refreshCurrentView();
                    });
                } else {
                    reloadFromSyncDebounced({ detail: { source: 'wipe' } });
                }
            });
            document.addEventListener('averias-sync-push', function () {
                /* El push ya subió datos; no hacer pull burst que pisa reportes locales */
            });
            global.addEventListener('firebase-denied', function () {
                if (global.PlatformToast) {
                    global.PlatformToast.error('Firebase bloqueó el guardado. Ejecute CONFIGURAR-FIREBASE-REGLAS.bat en el PC.', 8000);
                }
            });
            document.addEventListener('lan-ready', function () {
                if (global.PlatformLanSync && global.PlatformLanSync.forcePull) {
                    global.PlatformLanSync.forcePull().then(function () { reloadFromSyncDebounced(); });
                }
            });
            global.addEventListener('visibilitychange', function () {
                if (document.visibilityState === 'visible') {
                    if (global.PlatformAveriasCloudSync && global.PlatformAveriasCloudSync.pull) {
                        global.PlatformAveriasCloudSync.pull().then(function () {
                            reloadFromSync();
                        });
                    } else if (global.PlatformLanSync && global.PlatformLanSync.isEnabled()) {
                        global.PlatformLanSync.forcePull().then(function () { reloadFromSyncDebounced(); });
                    }
                }
            }, { passive: true });
        }

        if (!global._averiasSyncBound) {
            global._averiasSyncBound = true;
            initAveriasSync();
            global.setInterval(function () {
                if (global.PlatformAveriasCloudSync && global.PlatformAveriasCloudSync.isCloudConfigured &&
                    global.PlatformAveriasCloudSync.isCloudConfigured()) {
                    var last = global.PlatformAveriasCloudSync.getLastPullAt && global.PlatformAveriasCloudSync.getLastPullAt();
                    updateLiveChip(last && (Date.now() - last) < 10000);
                }
            }, 3000);
        }

        function saveData() {
            persistSnapshot({ force: true });
            updateStats();
        }

        function saveDamagesData() {
            persistSnapshot({ force: true });
            updateDamagesStats();
        }

        function saveSecurityData() {
            persistSnapshot({ force: true });
            updateSecurityStats();
        }

        function saveAuditsData() {
            persistSnapshot({ force: true });
            updateAuditStats();
        }

        function saveEquipmentData() {
            persistSnapshot({ force: true });
        }

        function handleLogout() {
            if (global.PlatformAveriasApp && global.PlatformAveriasApp.logout) {
                global.PlatformAveriasApp.logout();
            }
        }

        function showMainApp() {
            hideAllScreens();
            document.getElementById('mainApp').classList.remove('hidden');
            document.getElementById('drawerUser').textContent = currentEmployee.name + ' (' + currentEmployee.role + ')';
            document.getElementById('auditAuditor').value = currentEmployee.name;
            document.getElementById('damageFecha').value = new Date().toISOString().split('T')[0];
            initEquipmentFormDefaults();
            buildEquipmentChecklist();
            showWelcome();
        }

        function initEquipmentFormDefaults() {
            const today = new Date();
            const fechaEl = document.getElementById('eqFecha');
            if (fechaEl) {
                fechaEl.value = today.toISOString().split('T')[0];
                fechaEl.onchange = updateEqMes;
                updateEqMes();
            }
            const op = document.getElementById('eqOperador');
            if (op && currentEmployee) op.value = currentEmployee.name;
        }

        function updateEqMes() {
            const val = document.getElementById('eqFecha').value;
            if (!val) return;
            const d = new Date(val + 'T12:00:00');
            document.getElementById('eqMes').value = d.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
        }

        function buildEquipmentChecklist() {
            const container = document.getElementById('equipmentChecklist');
            if (!container) return;
            container.innerHTML = equipmentCheckItems.map(item => `
                <div class="equipment-check-row ${item.critical ? 'critical' : ''}" data-key="${item.key}">
                    <span class="check-label">${item.label}${item.critical ? '<span class="crit-tag">CRÍTICO</span>' : ''}</span>
                    <div class="si-no-group">
                        <button type="button" class="si-no-btn" data-val="si" onclick="selectEqCheck(this)">Sí</button>
                        <button type="button" class="si-no-btn" data-val="no" onclick="selectEqCheck(this)">No</button>
                    </div>
                </div>
            `).join('');
        }

        function selectEqCheck(btn) {
            playSelectFeedback();
            const group = btn.parentElement;
            group.querySelectorAll('.si-no-btn').forEach(b => {
                b.classList.remove('selected-si', 'selected-no');
            });
            btn.classList.add(btn.dataset.val === 'si' ? 'selected-si' : 'selected-no');
            updateEqObsRequired();
        }

        function getEqCheckValues() {
            const values = {};
            let hasFailure = false;
            equipmentCheckItems.forEach(item => {
                const row = document.querySelector(`.equipment-check-row[data-key="${item.key}"]`);
                const si = row.querySelector('.si-no-btn[data-val="si"]');
                const no = row.querySelector('.si-no-btn[data-val="no"]');
                if (si.classList.contains('selected-si')) {
                    values[item.key] = true;
                } else if (no.classList.contains('selected-no')) {
                    values[item.key] = false;
                    hasFailure = true;
                } else {
                    values[item.key] = null;
                }
            });
            return { values, hasFailure, allAnswered: equipmentCheckItems.every(i => values[i.key] !== null) };
        }

        function updateEqObsRequired() {
            const { hasFailure } = getEqCheckValues();
            document.getElementById('eqObsRequired').style.display = hasFailure ? 'inline' : 'none';
        }

        function resetEquipmentChecklist() {
            document.querySelectorAll('.si-no-btn').forEach(b => b.classList.remove('selected-si', 'selected-no'));
            document.getElementById('eqObservaciones').value = '';
            updateEqObsRequired();
        }

        function updateWelcomeUser() {
            if (!currentEmployee) return;
            const nameEl = document.getElementById('welcomeUserName');
            const roleEl = document.getElementById('welcomeUserRole');
            if (nameEl) nameEl.textContent = currentEmployee.name;
            if (roleEl) roleEl.textContent = 'Rol: ' + currentEmployee.role;
        }

        function showWelcome() {
            navigateToModule('home');
        }

        function toggleDrawer() {
            playSelectFeedback();
            var drawer = document.getElementById('drawer');
            var overlay = document.getElementById('drawerOverlay');
            if (!drawer || !overlay) return;
            var open = !drawer.classList.contains('open');
            drawer.classList.toggle('open', open);
            overlay.classList.toggle('show', open);
            document.body.classList.toggle('averias-drawer-open', open);
        }

        function closeDrawer() {
            var drawer = document.getElementById('drawer');
            var overlay = document.getElementById('drawerOverlay');
            if (drawer) drawer.classList.remove('open');
            if (overlay) overlay.classList.remove('show');
            document.body.classList.remove('averias-drawer-open');
        }

        if (!global._averiasDrawerResizeBound) {
            global._averiasDrawerResizeBound = true;
            global.addEventListener('resize', function () {
                if (global.innerWidth >= 1100) {
                    document.body.classList.remove('averias-drawer-open');
                    applyFitScreen(false);
                } else {
                    closeDrawer();
                    applyFitScreen(loadFitScreenPref());
                }
            }, { passive: true });
        }

        var FIT_KEY = 'averias_dc_fit_screen';

        function isMobileView() {
            return global.innerWidth < 1100;
        }

        function loadFitScreenPref() {
            var stored = localStorage.getItem(FIT_KEY);
            if (stored === null) return isMobileView();
            return stored === '1';
        }

        function applyFitScreen(enabled) {
            var app = document.getElementById('avApp');
            if (!app) return;
            var on = !!enabled && isMobileView();
            app.classList.toggle('averias-fit-screen', on);
            app.classList.toggle('averias-fit-normal', !on);
            var btn = document.getElementById('btnFitScreen');
            if (btn) {
                btn.setAttribute('aria-pressed', on ? 'true' : 'false');
                btn.title = on
                    ? 'Pantalla completa activa — tocar para desplazamiento normal'
                    : 'Ajustar contenido a la pantalla del celular';
                btn.classList.toggle('active', on);
            }
            updateFitScale();
        }

        function updateFitScale() {
            var app = document.getElementById('avApp');
            if (!app || !app.classList.contains('averias-fit-screen')) {
                if (app) app.style.removeProperty('--av-ui-scale');
                return;
            }
            var w = global.innerWidth || 390;
            var h = global.innerHeight || 740;
            var scale = Math.min(1.08, Math.max(0.88, Math.min(w / 360, h / 680)));
            app.style.setProperty('--av-ui-scale', String(Math.round(scale * 1000) / 1000));
        }

        function initFitScreen() {
            applyFitScreen(loadFitScreenPref());
        }

        function toggleFitScreen() {
            playSelectFeedback();
            var app = document.getElementById('avApp');
            if (!app || !isMobileView()) return;
            var next = !app.classList.contains('averias-fit-screen');
            localStorage.setItem(FIT_KEY, next ? '1' : '0');
            applyFitScreen(next);
        }

        function navigateToModule(module) {
            playSelectFeedback();
            currentModule = module;
            document.getElementById('moduleTitle').textContent = moduleTitles[module];
            document.querySelectorAll('.drawer-item').forEach(item => {
                item.classList.toggle('active', item.dataset.module === module);
            });
            document.querySelectorAll('.module-panel').forEach(p => p.classList.add('hidden'));
            const panelMap = {
                home: 'moduleWelcome',
                pallets: 'modulePallets',
                damages: 'moduleDamages',
                security: 'moduleSecurity',
                audit: 'moduleAudit',
                equipment: 'moduleEquipment'
            };
            document.getElementById(panelMap[module]).classList.remove('hidden');
            if (module === 'home') updateWelcomeUser();
            else if (module === 'pallets') showPalletsDashboard();
            else if (module === 'damages') showDamagesDashboard();
            else if (module === 'security') showSecurityDashboard();
            else if (module === 'audit') showAuditDashboard();
            else if (module === 'equipment') showEquipmentDashboard();
            closeDrawer();
        }

        function showPalletsDashboard() {
            clearEditingRecord();
            document.getElementById('palletsDashboard').classList.remove('hidden');
            document.getElementById('palletsReport').classList.add('hidden');
            document.getElementById('palletsCorrect').classList.add('hidden');
            updateStats();
        }

        function handleReportButton() {
            playSelectFeedback();
            clearEditingRecord();
            document.getElementById('palletsDashboard').classList.add('hidden');
            document.getElementById('palletsCorrect').classList.add('hidden');
            document.getElementById('palletsReport').classList.remove('hidden');
            document.getElementById('reportSuccess').classList.remove('show');
            document.getElementById('reportError').classList.remove('show');
        }

        function handleCorrectButton() {
            playSelectFeedback();
            document.getElementById('palletsDashboard').classList.add('hidden');
            document.getElementById('palletsCorrect').classList.remove('hidden');
            filterIncidences();
        }

        function showDamagesDashboard() {
            clearEditingRecord();
            document.getElementById('damagesDashboard').classList.remove('hidden');
            document.getElementById('damagesFormPanel').classList.add('hidden');
            document.getElementById('damagesCorrect').classList.add('hidden');
            resetDamageArea();
            updateDamagesStats();
        }

        function handleDamagesCorrectButton() {
            playSelectFeedback();
            document.getElementById('damagesDashboard').classList.add('hidden');
            document.getElementById('damagesFormPanel').classList.add('hidden');
            document.getElementById('damagesCorrect').classList.remove('hidden');
            filterDamagesPending();
        }

        function showDamagesForm() {
            clearEditingRecord();
            document.getElementById('damagesDashboard').classList.add('hidden');
            document.getElementById('damagesFormPanel').classList.remove('hidden');
            resetDamageArea();
        }

        function showSecurityDashboard() {
            clearEditingRecord();
            document.getElementById('securityDashboard').classList.remove('hidden');
            document.getElementById('securityFormPanel').classList.add('hidden');
            document.getElementById('securityCorrect').classList.add('hidden');
            updateSecurityStats();
        }

        function handleSecurityCorrectButton() {
            playSelectFeedback();
            document.getElementById('securityDashboard').classList.add('hidden');
            document.getElementById('securityFormPanel').classList.add('hidden');
            document.getElementById('securityCorrect').classList.remove('hidden');
            filterSecurityPending();
        }

        function showSecurityForm() {
            clearEditingRecord();
            document.getElementById('securityDashboard').classList.add('hidden');
            document.getElementById('securityFormPanel').classList.remove('hidden');
        }

        function showAuditDashboard() {
            clearEditingRecord();
            document.getElementById('auditDashboard').classList.remove('hidden');
            document.getElementById('auditFormPanel').classList.add('hidden');
            document.getElementById('auditCorrect').classList.add('hidden');
            updateAuditStats();
        }

        function handleAuditCorrectButton() {
            playSelectFeedback();
            document.getElementById('auditDashboard').classList.add('hidden');
            document.getElementById('auditFormPanel').classList.add('hidden');
            document.getElementById('auditCorrect').classList.remove('hidden');
            filterAuditPending();
        }

        function showAuditForm() {
            clearEditingRecord();
            document.getElementById('auditDashboard').classList.add('hidden');
            document.getElementById('auditFormPanel').classList.remove('hidden');
            document.getElementById('auditAuditor').value = currentEmployee.name;
        }

        function showEquipmentDashboard() {
            clearEditingRecord();
            document.getElementById('equipmentDashboard').classList.remove('hidden');
            document.getElementById('equipmentFormPanel').classList.add('hidden');
            document.getElementById('equipmentListPanel').classList.add('hidden');
            document.getElementById('equipmentCorrect').classList.add('hidden');
            updateEquipmentStats();
        }

        function handleEquipmentCorrectButton() {
            playSelectFeedback();
            document.getElementById('equipmentDashboard').classList.add('hidden');
            document.getElementById('equipmentFormPanel').classList.add('hidden');
            document.getElementById('equipmentListPanel').classList.add('hidden');
            document.getElementById('equipmentCorrect').classList.remove('hidden');
            renderEquipmentCorrectList();
        }

        function showEquipmentForm() {
            document.getElementById('equipmentDashboard').classList.add('hidden');
            document.getElementById('equipmentFormPanel').classList.remove('hidden');
            document.getElementById('equipmentListPanel').classList.add('hidden');
            initEquipmentFormDefaults();
            resetEquipmentChecklist();
        }

        function showEquipmentList() {
            document.getElementById('equipmentDashboard').classList.add('hidden');
            document.getElementById('equipmentFormPanel').classList.add('hidden');
            document.getElementById('equipmentListPanel').classList.remove('hidden');
            renderEquipmentList();
        }

        function updateEquipmentStats() {
            const equipos = Object.values(equipmentRegistry);
            const montacargas = equipos.filter(e => e.tipo === 'Montacargas').length;
            const unaElec = equipos.filter(e => e.tipo === 'Uña eléctrica').length;
            const unaMano = equipos.filter(e => e.tipo === 'Uña de mano').length;
            const disponibles = equipos.filter(e => e.estado === 'DISPONIBLE').length;
            const noDisponibles = equipos.filter(e => e.estado === 'NO_DISPONIBLE').length;
            document.getElementById('statEqMontacargas').textContent = montacargas;
            document.getElementById('statEqUnaElec').textContent = unaElec;
            document.getElementById('statEqUnaMano').textContent = unaMano;
            document.getElementById('statEqDisponibles').textContent = disponibles;
            document.getElementById('statEqNoDisponibles').textContent = noDisponibles;
        }

        function renderEquipmentList() {
            const tipoFilter = document.getElementById('eqFilterTipo').value;
            const estadoFilter = document.getElementById('eqFilterEstado').value;
            let equipos = Object.entries(equipmentRegistry).map(([codigo, data]) => ({ codigo, ...data }));
            if (tipoFilter) equipos = equipos.filter(e => e.tipo === tipoFilter);
            if (estadoFilter) equipos = equipos.filter(e => e.estado === estadoFilter);
            equipos.sort((a, b) => a.codigo.localeCompare(b.codigo));
            const container = document.getElementById('equipmentListContainer');
            if (equipos.length === 0) {
                container.innerHTML = '<p style="color:#8B949E;text-align:center;padding:24px;">No hay equipos registrados</p>';
                return;
            }
            container.innerHTML = equipos.map(e => {
                const disponible = e.estado === 'DISPONIBLE';
                const estadoLabel = disponible ? 'Disponible' : 'No disponible';
                const badgeClass = disponible ? 'available' : 'unavailable';
                return `<div class="equipment-list-item">
                    <div>
                        <div class="eq-code">${e.codigo}</div>
                        <div class="eq-type">${e.tipo}</div>
                    </div>
                    <span class="eq-badge ${badgeClass}">${estadoLabel}</span>
                </div>`;
            }).join('');
        }

        function saveEquipmentInspection() {
            const almacen = document.getElementById('eqAlmacen').value.trim();
            const fecha = document.getElementById('eqFecha').value;
            const mes = document.getElementById('eqMes').value.trim();
            const operador = document.getElementById('eqOperador').value.trim();
            const supervisor = document.getElementById('eqSupervisor').value.trim();
            const codigo = document.getElementById('eqCodigo').value.trim().toUpperCase();
            const tipo = document.getElementById('eqTipo').value;
            const observaciones = document.getElementById('eqObservaciones').value.trim();
            const { values, hasFailure, allAnswered } = getEqCheckValues();

            if (!almacen || !fecha || !operador || !supervisor || !codigo) {
                alert('Complete almacén, fecha, operador, supervisor y código del equipo');
                return;
            }
            if (!allAnswered) {
                alert('Responda todos los puntos del checklist (Sí / No)');
                return;
            }
            if (hasFailure && !observaciones) {
                alert('Las observaciones son obligatorias cuando hay fallas');
                return;
            }

            const disponible = !hasFailure;
            const estado = disponible ? 'DISPONIBLE' : 'NO_DISPONIBLE';
            const record = {
                id: Date.now(),
                almacen, fecha, mes, operador, supervisor,
                codigoEquipo: codigo, tipoEquipo: tipo,
                bateriaOk: values.bateriaOk,
                fluidosOk: values.fluidosOk,
                frenosOk: values.frenosOk,
                luzCentellaOk: values.luzCentellaOk,
                bocinaOk: values.bocinaOk,
                pitoReversaOk: values.pitoReversaOk,
                llantasOk: values.llantasOk,
                extintorOk: values.extintorOk,
                medidorTempOk: values.medidorTempOk,
                disponible,
                observaciones,
                usuario: currentEmployee.name,
                fechaRegistro: new Date().toLocaleString('es-ES')
            };
            allEquipmentInspections.push(record);
            equipmentRegistry[codigo] = { tipo, estado, ultimaActualizacion: record.fechaRegistro };
            saveEquipmentData();
            updateEquipmentStats();
            const msg = disponible
                ? 'Inspección guardada. Equipo marcado como DISPONIBLE.'
                : 'Inspección guardada. Equipo marcado como NO DISPONIBLE por fallas detectadas.';
            alert(msg);
            showEquipmentDashboard();
        }

        // --- Módulo Averías ---
        function selectDamageArea(area) {
            playSelectFeedback();
            selectedDamageArea = area;
            document.getElementById('damageAreaBadge').textContent = 'Área: ' + area;
            document.getElementById('damagesAreaSelect').classList.add('hidden');
            document.getElementById('damagesForm').classList.remove('hidden');
        }

        function resetDamageArea() {
            selectedDamageArea = null;
            document.getElementById('damagesAreaSelect').classList.remove('hidden');
            document.getElementById('damagesForm').classList.add('hidden');
        }

        function saveDamage() {
            const codigo = document.getElementById('damageCodigo').value.trim();
            const cantidad = parseInt(document.getElementById('damageCantidad').value);
            if (!selectedDamageArea || !codigo || !cantidad) {
                alert('Complete área, código y cantidad');
                return;
            }
            if (editingRecord && editingRecord.module === 'damages') {
                var existing = findById(allDamages, editingRecord.id);
                if (existing) {
                    existing.area = selectedDamageArea;
                    existing.codigo = codigo;
                    existing.cantidad = cantidad;
                    existing.fecha = document.getElementById('damageFecha').value;
                    existing.condicion = document.getElementById('damageCondicion').value;
                    existing.modifiedAt = new Date().toISOString();
                    saveDamagesData();
                    clearEditingRecord();
                    alert('✅ Reporte corregido');
                    showDamagesDashboard();
                    return;
                }
            }
            allDamages.push({
                id: Date.now(),
                area: selectedDamageArea,
                codigo: (avCore() && avCore().sanitizeText(codigo, 64)) || codigo,
                cantidad,
                fecha: document.getElementById('damageFecha').value,
                condicion: document.getElementById('damageCondicion').value,
                usuario: currentEmployee.name,
                status: 'PENDIENTE',
                correctedBy: null,
                correctionDate: null
            });
            var lastD = allDamages[allDamages.length - 1];
            if (avCore() && avCore().stampNewReport) {
                lastD.fechaRegistro = avCore().formatDisplayDateTime(avCore().nowIso());
                avCore().stampNewReport(lastD);
            }
            auditAction('REPORTAR', { module: 'damages', codigo: codigo, area: selectedDamageArea });
            persistSnapshot({ force: true, liveRecord: { module: 'damages', record: lastD } }).then(function () {
                updateDamagesStats();
                alert('✅ Avería guardada correctamente');
                document.getElementById('damageCodigo').value = '';
                document.getElementById('damageCantidad').value = '';
            });
        }

        // --- Módulo Seguridad ---
        function selectSecurityClass(cls) {
            playSelectFeedback();
            securityClass = cls;
            document.getElementById('pillUrgente').classList.toggle('selected', cls === 'Urgente');
            document.getElementById('pillNoUrgente').classList.toggle('selected', cls === 'No urgente');
        }

        function simulatePhoto() {
            hasPhoto = true;
            document.getElementById('photoStatus').textContent = '✅ Foto adjunta (simulada)';
        }

        function saveSecurity() {
            const detalle = document.getElementById('securityDetalle').value.trim();
            const area = document.getElementById('securityArea').value.trim();
            if (!detalle || !area) {
                alert('Complete detalle y área específica');
                return;
            }
            if (editingRecord && editingRecord.module === 'security') {
                var existingSec = findById(allSecurity, editingRecord.id);
                if (existingSec) {
                    existingSec.tipo = document.getElementById('securityTipo').value;
                    existingSec.detalle = detalle;
                    existingSec.area = area;
                    existingSec.clasificacion = securityClass;
                    existingSec.foto = hasPhoto;
                    existingSec.modifiedAt = new Date().toISOString();
                    saveSecurityData();
                    clearEditingRecord();
                    alert('✅ Reporte corregido');
                    showSecurityDashboard();
                    return;
                }
            }
            allSecurity.push({
                id: Date.now(),
                tipo: document.getElementById('securityTipo').value,
                detalle: (avCore() && avCore().sanitizeText(detalle, 500)) || detalle,
                area: (avCore() && avCore().sanitizeText(area, 120)) || area,
                clasificacion: securityClass,
                foto: hasPhoto,
                usuario: currentEmployee.name,
                status: 'PENDIENTE',
                correctedBy: null,
                correctionDate: null
            });
            var lastS = allSecurity[allSecurity.length - 1];
            if (avCore() && avCore().stampNewReport) {
                lastS.fecha = avCore().formatDisplayDateTime(avCore().nowIso());
                avCore().stampNewReport(lastS);
            }
            auditAction('REPORTAR', { module: 'security', area: area });
            persistSnapshot({ force: true, liveRecord: { module: 'security', record: lastS } }).then(function () {
                updateSecurityStats();
                alert('✅ Incidencia de seguridad guardada');
                document.getElementById('securityDetalle').value = '';
                document.getElementById('securityArea').value = '';
                hasPhoto = false;
                document.getElementById('photoStatus').textContent = '';
            });
        }

        // --- Módulo Auditoría 5S ---
        function selectTurno(turno) {
            playSelectFeedback();
            selectedTurno = turno;
            document.getElementById('pillTurnoA').classList.toggle('selected', turno === 'A');
            document.getElementById('pillTurnoB').classList.toggle('selected', turno === 'B');
        }

        function toggleCheck(el) {
            playSelectFeedback();
            el.classList.toggle('on');
            const row = el.closest('.checklist-item');
            row.classList.toggle('ok', el.classList.contains('on'));
            row.classList.toggle('bad', !el.classList.contains('on'));
        }

        function saveAudit() {
            const auditor = document.getElementById('auditAuditor').value.trim();
            const pasillo = document.getElementById('auditPasillo').value.trim();
            const responsable = document.getElementById('auditResponsable').value.trim();
            if (!auditor || !pasillo || !responsable) {
                alert('Complete auditor, pasillo y responsable');
                return;
            }
            if (editingRecord && editingRecord.module === 'audit') {
                var existingAud = findById(allAudits, editingRecord.id);
                if (existingAud) {
                    existingAud.auditor = auditor;
                    existingAud.pasillo = pasillo;
                    existingAud.responsable = responsable;
                    existingAud.turno = selectedTurno;
                    existingAud.obstruccionesPasillo = document.querySelector('#chkObstrucciones .toggle-switch').classList.contains('on');
                    existingAud.sinSkuAveriado = document.querySelector('#chkSkuAveriado .toggle-switch').classList.contains('on');
                    existingAud.iluminacion = document.querySelector('#chkIluminacion .toggle-switch').classList.contains('on');
                    existingAud.sinPaletasRotas = document.querySelector('#chkPaletas .toggle-switch').classList.contains('on');
                    existingAud.acuracidad = document.querySelector('#chkAcuracidad .toggle-switch').classList.contains('on');
                    existingAud.modifiedAt = new Date().toISOString();
                    saveAuditsData();
                    clearEditingRecord();
                    alert('✅ Reporte corregido');
                    showAuditDashboard();
                    return;
                }
            }
            allAudits.push({
                id: Date.now(),
                auditor,
                pasillo: (avCore() && avCore().sanitizeText(pasillo, 80)) || pasillo,
                responsable: (avCore() && avCore().sanitizeText(responsable, 120)) || responsable,
                turno: selectedTurno,
                obstruccionesPasillo: document.querySelector('#chkObstrucciones .toggle-switch').classList.contains('on'),
                sinSkuAveriado: document.querySelector('#chkSkuAveriado .toggle-switch').classList.contains('on'),
                iluminacion: document.querySelector('#chkIluminacion .toggle-switch').classList.contains('on'),
                sinPaletasRotas: document.querySelector('#chkPaletas .toggle-switch').classList.contains('on'),
                acuracidad: document.querySelector('#chkAcuracidad .toggle-switch').classList.contains('on'),
                usuario: currentEmployee.name,
                status: 'PENDIENTE',
                correctedBy: null,
                correctionDate: null
            });
            var lastA = allAudits[allAudits.length - 1];
            if (avCore() && avCore().stampNewReport) {
                lastA.fecha = avCore().formatDisplayDateTime(avCore().nowIso());
                avCore().stampNewReport(lastA);
            }
            auditAction('REPORTAR', { module: 'audit', pasillo: pasillo });
            persistSnapshot({ force: true, liveRecord: { module: 'audit', record: lastA } }).then(function () {
                updateAuditStats();
                alert('✅ Auditoría 5S guardada');
                document.getElementById('auditPasillo').value = '';
                document.getElementById('auditResponsable').value = '';
                document.querySelectorAll('.toggle-switch').forEach(t => { t.classList.remove('on'); });
                document.querySelectorAll('.checklist-item').forEach(r => { r.classList.remove('ok','bad'); r.classList.add('bad'); });
            });
        }

        // Report Handler
        function handleReport(e) {
            e.preventDefault();
            const location = (document.getElementById('reportLocation').value || '').trim();
            const product = (document.getElementById('reportProduct').value || '').trim();
            const severity = (document.getElementById('reportSeverity').value || selectedSeverity || '').trim();
            const observation = document.getElementById('reportObservation').value;
            const submitBtn = document.querySelector('#palletsReport button[type="submit"]');

            if (!location || !product) {
                document.getElementById('reportError').textContent = '❌ Complete ubicación y producto';
                document.getElementById('reportError').classList.add('show');
                return;
            }

            if (!severity) {
                document.getElementById('reportError').textContent = '❌ Toque BAJO, MEDIO o ALTO antes de guardar';
                document.getElementById('reportError').classList.add('show');
                return;
            }

            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.textContent = 'Guardando…';
            }

            if (editingRecord && editingRecord.module === 'pallets') {
                var existingInc = findById(allIncidences, editingRecord.id);
                if (existingInc) {
                    existingInc.location = location;
                    existingInc.product = product;
                    existingInc.productDescription = resolveProductDescription(product, location);
                    existingInc.type = severity;
                    existingInc.description = observation;
                    existingInc.modifiedAt = new Date().toISOString();
                    saveData();
                    clearEditingRecord();
                    document.getElementById('reportError').classList.remove('show');
                    document.getElementById('reportSuccess').textContent = '✅ Reporte corregido';
                    document.getElementById('reportSuccess').classList.add('show');
                    setTimeout(function () {
                        document.getElementById('reportSuccess').classList.remove('show');
                        showPalletsDashboard();
                    }, 1200);
                    return;
                }
            }

            // Check for duplicate (ignore case / spaces)
            const locKey = location.toUpperCase();
            const prodKey = product.toUpperCase();
            const duplicate = allIncidences.find(function (inc) {
                return String(inc.location || '').trim().toUpperCase() === locKey &&
                    String(inc.product || '').trim().toUpperCase() === prodKey &&
                    isPendingStatus(inc);
            });

            if (duplicate) {
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.textContent = 'GUARDAR INCIDENCIA';
                }
                document.getElementById('reportError').textContent = '❌ Ya hay una avería PENDIENTE en esa ubicación y producto';
                document.getElementById('reportError').classList.add('show');
                return;
            }

            const productDescription = resolveProductDescription(product, location);

            const incidence = {
                id: Date.now(),
                location: (avCore() && avCore().sanitizeText(location, 80)) || location,
                product: (avCore() && avCore().sanitizeText(product, 64)) || product,
                productDescription,
                type: severity,
                description: (avCore() && avCore().sanitizeText(observation, 500)) || observation,
                reportedBy: currentEmployee.name,
                status: 'PENDIENTE',
                correctedBy: null,
                correctionDate: null
            };
            if (avCore() && avCore().stampNewReport) avCore().stampNewReport(incidence);

            allIncidences.push(incidence);
            ensureRecordStatuses();
            writeIndividualKeys();
            var preSnap = buildSnapshot();
            preSnap.updatedAt = new Date().toISOString();
            preSnap.localSeq = (preSnap.localSeq || 0) + 1;
            memoryLocalSeq = preSnap.localSeq;
            try {
                localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(preSnap));
            } catch (e) { /* noop */ }
            if (global.PlatformAveriasCloudSync && global.PlatformAveriasCloudSync.beginLocalEdit) {
                global.PlatformAveriasCloudSync.beginLocalEdit(preSnap);
            }
            if (global.PlatformAveriasCloudSync && global.PlatformAveriasCloudSync.noteLocalSave) {
                global.PlatformAveriasCloudSync.noteLocalSave(preSnap);
            }
            memoryLocalSeq = Math.max(memoryLocalSeq, (buildSnapshot().localSeq || 0));
            updateStats();
            renderPalletsReportedList();
            auditAction('REPORTAR', { module: 'pallets', location: incidence.location, product: incidence.product });
            persistSnapshot({ force: true, seqAlreadyBumped: true, liveRecord: { module: 'pallets', record: incidence } }).then(function (result) {
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.textContent = 'GUARDAR INCIDENCIA';
                }
                if (result && result.ok === false && !result.skipped) {
                    document.getElementById('reportError').textContent = '❌ No se pudo guardar. Revise espacio del navegador e intente de nuevo.';
                    document.getElementById('reportError').classList.add('show');
                    document.getElementById('reportSuccess').classList.remove('show');
                    return;
                }
                updateStats();
                renderPalletsReportedList();
                document.getElementById('reportError').classList.remove('show');
                document.getElementById('reportSuccess').textContent = result && result.cloud
                    ? '✅ Publicado en vivo — todos lo ven'
                    : '⚠️ Solo en este equipo — publique reglas Firebase';
                document.getElementById('reportSuccess').classList.add('show');
                setTimeout(function () {
                    showPalletsDashboard();
                }, 1200);
            });
        }

        function selectSeverity(severity) {
            playSelectFeedback();
            selectedSeverity = severity;
            var hidden = document.getElementById('reportSeverity');
            if (hidden) hidden.value = severity;
            document.querySelectorAll('.severity-btn').forEach(function (btn) {
                btn.classList.remove('selected');
                if (btn.classList.contains(String(severity).toLowerCase())) btn.classList.add('selected');
            });
            var err = document.getElementById('reportError');
            if (err) err.classList.remove('show');

            // Auto-fill observation based on severity
            const observations = {
                'BAJO': 'Daño menor. Paleta con pequeñas roturas o deformaciones que no afectan funcionalidad.',
                'MEDIO': 'Daño moderado. Paleta con daños significativos en estructura o esquinas. Requiere reparación.',
                'ALTO': 'Daño crítico. Paleta destruida, derrumbada o con riesgos de seguridad. Requiere recolección inmediata.'
            };

            document.getElementById('reportObservation').value = observations[severity];
        }

        function isSupervisorRole() {
            return currentEmployee && currentEmployee.role === 'CORRIGE';
        }

        function samePerson(a, b) {
            if (!a || !b) return false;
            var x = String(a).trim().toLowerCase();
            var y = String(b).trim().toLowerCase();
            if (x === y) return true;
            return x.split(' ')[0] === y.split(' ')[0];
        }

        function recordAuthor(record) {
            return record.reportedBy || record.usuario || record.auditor || '';
        }

        function canEditReport(record) {
            if (!currentEmployee || !isPendingStatus(record)) return false;
            if (isSupervisorRole()) return true;
            return samePerson(recordAuthor(record), currentEmployee.name);
        }

        function recordIdAttr(module, id) {
            if (module === 'equipment') return String(id).replace(/"/g, '&quot;');
            return id;
        }

        function canResolveReport(record) {
            if (!currentEmployee || !isPendingStatus(record)) return false;
            if (isSupervisorRole()) return true;
            return samePerson(recordAuthor(record), currentEmployee.name);
        }

        function reportedWorkActionsHtml(module, id, record) {
            var html = '<div class="reported-work-actions">';
            if (canEditReport(record)) {
                html += '<button type="button" class="btn-edit-incidence" data-edit-module="' + module + '" data-edit-id="' + recordIdAttr(module, id) + '">✏️ Editar reporte</button>';
            }
            if (canResolveReport(record)) {
                html += '<button type="button" class="btn-correct-incidence btn-correct-inline" data-correct-module="' + module + '" data-correct-id="' + recordIdAttr(module, id) + '">✅ Marcar resuelto</button>';
            }
            html += '</div>';
            return html;
        }

        function renderReportedWorkLists() {
            renderPalletsReportedList();
            renderDamagesReportedList();
            renderSecurityReportedList();
            renderAuditReportedList();
            renderEquipmentReportedList();
        }

        function renderPalletsReportedList() {
            var list = document.getElementById('palletsReportedList');
            if (!list) return;
            var pending = allIncidences.filter(function (i) { return isPendingStatus(i); }).slice(0, 20);
            if (!pending.length) {
                list.innerHTML = '<div class="reported-work-empty">No hay paletas reportadas pendientes.</div>';
                return;
            }
            list.innerHTML = pending.map(function (inc) {
                return '<div class="incidence-card ' + String(inc.type || '').toLowerCase() + '">' +
                    '<div class="incidence-card-row"><span class="incidence-card-label">Ubicación:</span><span class="incidence-card-value">' + escAv(inc.location) + '</span></div>' +
                    '<div class="incidence-card-row"><span class="incidence-card-label">Producto:</span><span class="incidence-card-value">' + escAv(inc.product) + '</span></div>' +
                    '<div class="incidence-card-row"><span class="incidence-card-label">Tipo:</span><span class="incidence-card-value">' + getSeverityEmoji(inc.type) + ' ' + escAv(inc.type) + '</span></div>' +
                    datesHtml(inc) +
                    reportedWorkActionsHtml('pallets', inc.id, inc) +
                    '</div>';
            }).join('');
            renderRecentCompleted('pallets', allIncidences, 'palletsCompletedList');
        }

        function renderDamagesReportedList() {
            var list = document.getElementById('damagesReportedList');
            if (!list) return;
            var pending = allDamages.filter(function (d) { return isPendingStatus(d); }).slice(0, 20);
            if (!pending.length) {
                list.innerHTML = '<div class="reported-work-empty">No hay averías reportadas pendientes.</div>';
                return;
            }
            list.innerHTML = pending.map(function (d) {
                return '<div class="incidence-card medio">' +
                    '<div class="incidence-card-row"><span class="incidence-card-label">Área:</span><span class="incidence-card-value">' + escAv(d.area) + '</span></div>' +
                    '<div class="incidence-card-row"><span class="incidence-card-label">Código:</span><span class="incidence-card-value">' + escAv(d.codigo) + '</span></div>' +
                    '<div class="incidence-card-row"><span class="incidence-card-label">Cantidad:</span><span class="incidence-card-value">' + escAv(d.cantidad) + '</span></div>' +
                    datesHtml(d) +
                    reportedWorkActionsHtml('damages', d.id, d) +
                    '</div>';
            }).join('');
            renderRecentCompleted('damages', allDamages, 'damagesCompletedList');
        }

        function renderRecentCompleted(module, list, containerId) {
            var container = document.getElementById(containerId);
            if (!container) return;
            var C = avCore();
            var done = (list || []).filter(function (r) { return isCorrectedStatus(r); })
                .sort(function (a, b) {
                    var ta = C && C.recordTimeForMerge ? C.recordTimeForMerge(a) : 0;
                    var tb = C && C.recordTimeForMerge ? C.recordTimeForMerge(b) : 0;
                    return tb - ta;
                })
                .slice(0, 5);
            if (!done.length) {
                container.innerHTML = '<div class="reported-work-empty">Sin trabajos finalizados recientes.</div>';
                return;
            }
            container.innerHTML = done.map(function (r) {
                var title = module === 'pallets' ? escAv(r.location + ' · ' + r.product)
                    : module === 'damages' ? escAv(r.codigo + ' · ' + r.area)
                    : module === 'security' ? escAv(r.area)
                    : escAv(r.pasillo || r.codigo || '—');
                return '<div class="incidence-card completed">' +
                    '<div class="incidence-card-row"><span class="incidence-card-label">Trabajo:</span><span class="incidence-card-value">' + title + '</span></div>' +
                    '<span class="av-status-badge av-status-done">' + (C && C.statusLabel ? C.statusLabel(r.status) : 'Finalizado') + '</span>' +
                    datesHtml(r) +
                    '</div>';
            }).join('');
        }

        function renderSecurityReportedList() {
            var list = document.getElementById('securityReportedList');
            if (!list) return;
            var pending = allSecurity.filter(function (s) { return isPendingStatus(s); }).slice(0, 20);
            if (!pending.length) {
                list.innerHTML = '<div class="reported-work-empty">No hay incidencias de seguridad pendientes.</div>';
                return;
            }
            list.innerHTML = pending.map(function (s) {
                return '<div class="incidence-card ' + (s.clasificacion === 'Urgente' ? 'alto' : 'medio') + '">' +
                    '<div class="incidence-card-row"><span class="incidence-card-label">Área:</span><span class="incidence-card-value">' + escAv(s.area) + '</span></div>' +
                    '<div class="incidence-card-row"><span class="incidence-card-label">Tipo:</span><span class="incidence-card-value">' + escAv(s.tipo) + '</span></div>' +
                    datesHtml(s) +
                    reportedWorkActionsHtml('security', s.id, s) +
                    '</div>';
            }).join('');
            renderRecentCompleted('security', allSecurity, 'securityCompletedList');
        }

        function renderAuditReportedList() {
            var list = document.getElementById('auditReportedList');
            if (!list) return;
            var pending = allAudits.filter(function (a) { return isPendingStatus(a); }).slice(0, 20);
            if (!pending.length) {
                list.innerHTML = '<div class="reported-work-empty">No hay hallazgos 5S pendientes.</div>';
                return;
            }
            list.innerHTML = pending.map(function (a) {
                return '<div class="incidence-card medio">' +
                    '<div class="incidence-card-row"><span class="incidence-card-label">Pasillo:</span><span class="incidence-card-value">' + escAv(a.pasillo) + '</span></div>' +
                    '<div class="incidence-card-row"><span class="incidence-card-label">Turno:</span><span class="incidence-card-value">' + escAv(a.turno) + '</span></div>' +
                    datesHtml(a) +
                    reportedWorkActionsHtml('audit', a.id, a) +
                    '</div>';
            }).join('');
            renderRecentCompleted('audit', allAudits, 'auditCompletedList');
        }

        function renderEquipmentReportedList() {
            var list = document.getElementById('equipmentReportedList');
            if (!list) return;
            var pending = Object.entries(equipmentRegistry)
                .filter(function (entry) { return entry[1] && entry[1].estado === 'NO_DISPONIBLE'; })
                .map(function (entry) { return { codigo: entry[0], tipo: entry[1].tipo, ultimaActualizacion: entry[1].ultimaActualizacion }; })
                .slice(0, 20);
            if (!pending.length) {
                list.innerHTML = '<div class="reported-work-empty">No hay equipos marcados no disponibles.</div>';
                return;
            }
            list.innerHTML = pending.map(function (e) {
                return '<div class="incidence-card alto">' +
                    '<div class="incidence-card-row"><span class="incidence-card-label">Equipo:</span><span class="incidence-card-value">' + e.codigo + '</span></div>' +
                    '<div class="incidence-card-row"><span class="incidence-card-label">Tipo:</span><span class="incidence-card-value">' + (e.tipo || '') + '</span></div>' +
                    (isSupervisorRole()
                        ? '<div class="reported-work-actions"><button type="button" class="btn-correct-incidence btn-correct-inline" data-correct-module="equipment" data-correct-id="' + recordIdAttr('equipment', e.codigo) + '">✅ Marcar disponible</button></div>'
                        : '') +
                    '</div>';
            }).join('');
        }

        function resetFormSubmitLabels() {
            var palletsBtn = document.querySelector('#palletsReport button[type="submit"]');
            if (palletsBtn) palletsBtn.textContent = 'GUARDAR INCIDENCIA';
            var damageBtn = document.querySelector('#damagesForm .btn-primary');
            if (damageBtn) damageBtn.textContent = 'GUARDAR AVERÍA';
            var secBtn = document.querySelector('#securityFormPanel .btn-primary');
            if (secBtn) secBtn.textContent = 'GUARDAR INCIDENCIA';
            var auditBtn = document.querySelector('#auditFormPanel .btn-primary');
            if (auditBtn) auditBtn.textContent = 'GUARDAR AUDITORÍA';
        }

        function clearEditingRecord() {
            editingRecord = null;
            resetFormSubmitLabels();
        }

        function setAuditToggle(id, value) {
            var row = document.getElementById(id);
            if (!row) return;
            var toggle = row.querySelector('.toggle-switch');
            if (!toggle) return;
            toggle.classList.toggle('on', !!value);
            row.classList.toggle('ok', !!value);
            row.classList.toggle('bad', !value);
        }

        function openEditReport(module, id) {
            playSelectFeedback();
            ensureRecordStatuses();
            if (module === 'pallets') {
                var inc = findById(allIncidences, id);
                if (!inc || !canEditReport(inc)) {
                    alert('No puede editar este reporte.');
                    return;
                }
                editingRecord = { module: module, id: id };
                document.getElementById('palletsDashboard').classList.add('hidden');
                document.getElementById('palletsCorrect').classList.add('hidden');
                document.getElementById('palletsReport').classList.remove('hidden');
                document.getElementById('reportLocation').value = inc.location || '';
                document.getElementById('reportProduct').value = inc.product || '';
                document.getElementById('reportObservation').value = inc.description || '';
                document.getElementById('reportSeverity').value = inc.type || '';
                document.querySelectorAll('.severity-btn').forEach(function (btn) { btn.classList.remove('selected'); });
                var sevBtn = document.querySelector('.severity-btn.' + String(inc.type || '').toLowerCase());
                if (sevBtn) sevBtn.classList.add('selected');
                lookupProductDescription();
                var submitBtn = document.querySelector('#palletsReport button[type="submit"]');
                if (submitBtn) submitBtn.textContent = 'GUARDAR CORRECCIÓN';
                return;
            }
            if (module === 'damages') {
                var dmg = findById(allDamages, id);
                if (!dmg || !canEditReport(dmg)) {
                    alert('No puede editar este reporte.');
                    return;
                }
                editingRecord = { module: module, id: id };
                document.getElementById('damagesDashboard').classList.add('hidden');
                document.getElementById('damagesCorrect').classList.add('hidden');
                document.getElementById('damagesFormPanel').classList.remove('hidden');
                selectedDamageArea = dmg.area;
                document.getElementById('damagesAreaSelect').classList.add('hidden');
                document.getElementById('damagesForm').classList.remove('hidden');
                document.getElementById('damageAreaBadge').textContent = 'Área: ' + dmg.area;
                document.getElementById('damageCodigo').value = dmg.codigo || '';
                document.getElementById('damageCantidad').value = dmg.cantidad || '';
                document.getElementById('damageFecha').value = dmg.fecha || '';
                document.getElementById('damageCondicion').value = dmg.condicion || 'Vencimiento';
                var damageBtn = document.querySelector('#damagesForm .btn-primary');
                if (damageBtn) damageBtn.textContent = 'GUARDAR CORRECCIÓN';
                return;
            }
            if (module === 'security') {
                var sec = findById(allSecurity, id);
                if (!sec || !canEditReport(sec)) {
                    alert('No puede editar este reporte.');
                    return;
                }
                editingRecord = { module: module, id: id };
                document.getElementById('securityDashboard').classList.add('hidden');
                document.getElementById('securityCorrect').classList.add('hidden');
                document.getElementById('securityFormPanel').classList.remove('hidden');
                document.getElementById('securityTipo').value = sec.tipo || 'Acto inseguro';
                document.getElementById('securityDetalle').value = sec.detalle || '';
                document.getElementById('securityArea').value = sec.area || '';
                selectSecurityClass(sec.clasificacion || 'No urgente');
                hasPhoto = !!sec.foto;
                document.getElementById('photoStatus').textContent = hasPhoto ? '✅ Foto adjunta (simulada)' : '';
                var secBtn = document.querySelector('#securityFormPanel .btn-primary');
                if (secBtn) secBtn.textContent = 'GUARDAR CORRECCIÓN';
                return;
            }
            if (module === 'audit') {
                var aud = findById(allAudits, id);
                if (!aud || !canEditReport(aud)) {
                    alert('No puede editar este reporte.');
                    return;
                }
                editingRecord = { module: module, id: id };
                document.getElementById('auditDashboard').classList.add('hidden');
                document.getElementById('auditCorrect').classList.add('hidden');
                document.getElementById('auditFormPanel').classList.remove('hidden');
                document.getElementById('auditAuditor').value = aud.auditor || '';
                document.getElementById('auditPasillo').value = aud.pasillo || '';
                document.getElementById('auditResponsable').value = aud.responsable || '';
                selectTurno(aud.turno || 'A');
                setAuditToggle('chkObstrucciones', aud.obstruccionesPasillo);
                setAuditToggle('chkSkuAveriado', aud.sinSkuAveriado);
                setAuditToggle('chkIluminacion', aud.iluminacion);
                setAuditToggle('chkPaletas', aud.sinPaletasRotas);
                setAuditToggle('chkAcuracidad', aud.acuracidad);
                var auditBtn = document.querySelector('#auditFormPanel .btn-primary');
                if (auditBtn) auditBtn.textContent = 'GUARDAR CORRECCIÓN';
            }
        }

        // Correct Handler (todos los módulos)
        function finalizeWorkRecord(record) {
            var C = avCore();
            if (C && C.finalizeRecord) {
                C.finalizeRecord(record, currentEmployee.name);
            } else {
                record.status = 'CORREGIDO';
                record.correctedBy = currentEmployee.name;
                record.correctionDate = new Date().toLocaleString('es-DO');
            }
            return record;
        }

        function applyCorrectionNow(module, id) {
            ensureRecordStatuses();
            var label = '';

            function afterPersist(result) {
                updateAllStats();
                if (result && result.cloud === false && global.PlatformToast) {
                    global.PlatformToast.warn('Guardado local — reintentando subir a la nube…', 4000);
                } else if (global.PlatformToast) {
                    global.PlatformToast.success('Trabajo finalizado — todos lo ven en vivo', 3500);
                }
            }

            function doFinalize(record, mod, onDone) {
                finalizeWorkRecord(record);
                correctionLockUntil = Date.now() + 30000;
                writeIndividualKeys();
                var preSnap = buildSnapshot();
                preSnap.updatedAt = new Date().toISOString();
                preSnap.localSeq = (preSnap.localSeq || 0) + 1;
                memoryLocalSeq = preSnap.localSeq;
                try {
                    localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(preSnap));
                } catch (e) { /* noop */ }
                if (global.PlatformAveriasCloudSync && global.PlatformAveriasCloudSync.beginLocalEdit) {
                    global.PlatformAveriasCloudSync.beginLocalEdit(preSnap);
                }
                if (global.PlatformAveriasCloudSync && global.PlatformAveriasCloudSync.noteLocalSave) {
                    global.PlatformAveriasCloudSync.noteLocalSave(preSnap);
                }
                return persistSnapshot({ force: true, seqAlreadyBumped: true, liveRecord: { module: mod, record: record } }).then(function (result) {
                    if (typeof onDone === 'function') onDone();
                    afterPersist(result);
                    return true;
                });
            }

            if (module === 'pallets') {
                var inc = findById(allIncidences, id);
                if (inc) {
                    label = inc.location + ' / ' + inc.product;
                    auditAction('FINALIZAR', { module: module, id: id, label: label });
                    return doFinalize(inc, 'pallets', function () {
                        filterIncidences();
                        renderReportedWorkLists();
                    });
                }
            } else if (module === 'damages') {
                var dmg = findById(allDamages, id);
                if (dmg) {
                    label = dmg.codigo + ' / ' + dmg.area;
                    auditAction('FINALIZAR', { module: module, id: id, label: label });
                    return doFinalize(dmg, 'damages', function () {
                        filterDamagesPending();
                        renderReportedWorkLists();
                    });
                }
            } else if (module === 'security') {
                var sec = findById(allSecurity, id);
                if (sec) {
                    label = sec.area;
                    auditAction('FINALIZAR', { module: module, id: id, label: label });
                    return doFinalize(sec, 'security', function () {
                        filterSecurityPending();
                        renderReportedWorkLists();
                    });
                }
            } else if (module === 'audit') {
                var aud = findById(allAudits, id);
                if (aud) {
                    label = 'Pasillo ' + aud.pasillo;
                    auditAction('FINALIZAR', { module: module, id: id, label: label });
                    return doFinalize(aud, 'audit', function () {
                        filterAuditPending();
                        renderReportedWorkLists();
                    });
                }
            } else if (module === 'equipment') {
                var codigo = String(id);
                var eq = equipmentRegistry[codigo];
                if (eq) {
                    var C = avCore();
                    var iso = C && C.nowIso ? C.nowIso() : new Date().toISOString();
                    eq.estado = 'DISPONIBLE';
                    eq.ultimaActualizacion = C && C.formatDisplayDateTime ? C.formatDisplayDateTime(iso) : iso;
                    eq.executedAtIso = iso;
                    eq.correctedBy = currentEmployee.name;
                    label = codigo;
                    correctionLockUntil = Date.now() + 30000;
                    auditAction('FINALIZAR', { module: module, id: id, label: label });
                    return persistSnapshot({ force: true }).then(function (result) {
                        updateEquipmentStats();
                        renderEquipmentCorrectList();
                        renderReportedWorkLists();
                        afterPersist(result);
                        return true;
                    });
                }
            }

            alert('No se encontró el registro. Sincronice (↻) e intente de nuevo.');
            return Promise.resolve(false);
        }

        function buildCorrectionMessage(module, id) {
            if (module === 'pallets') {
                var inc = findById(allIncidences, id);
                return inc
                    ? '¿Finalizar trabajo en ' + inc.location + ' (' + inc.product + ')?'
                    : '¿Finalizar este trabajo?';
            }
            if (module === 'damages') {
                var d = findById(allDamages, id);
                return d ? '¿Finalizar avería ' + d.codigo + ' en ' + d.area + '?' : '¿Finalizar este trabajo?';
            }
            if (module === 'security') {
                var s = findById(allSecurity, id);
                return s ? '¿Finalizar incidencia en ' + s.area + '?' : '¿Finalizar este trabajo?';
            }
            if (module === 'audit') {
                var a = findById(allAudits, id);
                return a ? '¿Finalizar hallazgo 5S en pasillo ' + a.pasillo + '?' : '¿Finalizar este trabajo?';
            }
            if (module === 'equipment') {
                return '¿Marcar equipo ' + id + ' como DISPONIBLE?';
            }
            return '¿Finalizar este trabajo?';
        }

        function markRecordCorrected(module, id) {
            playSelectFeedback();
            if (id == null || id === '') return;
            ensureRecordStatuses();
            var message = buildCorrectionMessage(module, id);
            if (!window.confirm(message)) return;
            applyCorrectionNow(module, id);
        }

        function filterIncidences() {
            const locationFilter = document.getElementById('correctLocation').value.toUpperCase();
            incidences = allIncidences.filter(inc => 
                isPendingStatus(inc) && 
                inc.location.toUpperCase().includes(locationFilter)
            );

            document.getElementById('pendingCount').textContent = incidences.length;
            renderIncidences();
        }

        function renderIncidences() {
            const list = document.getElementById('incidencesList');
            if (incidences.length === 0) {
                list.innerHTML = '<div style="color: #999; text-align: center; padding: 24px;">No hay incidencias pendientes</div>';
                return;
            }

            list.innerHTML = incidences.map(inc => `
                <div class="incidence-card ${inc.type.toLowerCase()}">
                    <div class="incidence-card-row">
                        <span class="incidence-card-label">Ubicación:</span>
                        <span class="incidence-card-value">${inc.location}</span>
                    </div>
                    <div class="incidence-card-row">
                        <span class="incidence-card-label">Producto:</span>
                        <span class="incidence-card-value">${inc.product}</span>
                    </div>
                    ${inc.productDescription ? `
                    <div class="incidence-card-row">
                        <span class="incidence-card-label">Descripción:</span>
                        <span class="incidence-card-value" style="color: #4FC3F7; font-style: italic;">${inc.productDescription}</span>
                    </div>` : ''}
                    <div class="incidence-card-row">
                        <span class="incidence-card-label">Tipo:</span>
                        <span class="incidence-card-value">${getSeverityEmoji(inc.type)} ${inc.type}</span>
                    </div>
                    <div class="incidence-card-row">
                        <span class="incidence-card-label">Desc:</span>
                        <span class="incidence-card-value">${inc.description || 'N/A'}</span>
                    </div>
                    <div class="incidence-card-row">
                        <span class="incidence-card-label">Por:</span>
                        <span class="incidence-card-value">${inc.reportedBy.split(' ')[0]}</span>
                    </div>
                    <div class="incidence-card-row">
                        <span class="incidence-card-label">Fecha:</span>
                        <span class="incidence-card-value">${inc.reportDate}</span>
                    </div>
                    <button type="button" class="btn-correct-incidence" data-correct-module="pallets" data-correct-id="${inc.id}">✅ Paleta corregida</button>
                </div>
            `).join('');
        }

        function filterDamagesPending() {
            ensureRecordStatuses();
            var filterEl = document.getElementById('damagesCorrectFilter');
            var filter = filterEl ? filterEl.value.toUpperCase() : '';
            var pending = allDamages.filter(function (d) {
                return isPendingStatus(d) && String(d.codigo || '').toUpperCase().indexOf(filter) !== -1;
            });
            var countEl = document.getElementById('damagesPendingCount');
            if (countEl) countEl.textContent = pending.length;
            var list = document.getElementById('damagesCorrectList');
            if (!list) return;
            if (pending.length === 0) {
                list.innerHTML = '<div style="color: #999; text-align: center; padding: 24px;">No hay averías pendientes</div>';
                return;
            }
            list.innerHTML = pending.map(function (d) {
                return '<div class="incidence-card medio">' +
                    '<div class="incidence-card-row"><span class="incidence-card-label">Área:</span><span class="incidence-card-value">' + d.area + '</span></div>' +
                    '<div class="incidence-card-row"><span class="incidence-card-label">Código:</span><span class="incidence-card-value">' + d.codigo + '</span></div>' +
                    '<div class="incidence-card-row"><span class="incidence-card-label">Cantidad:</span><span class="incidence-card-value">' + d.cantidad + '</span></div>' +
                    '<div class="incidence-card-row"><span class="incidence-card-label">Condición:</span><span class="incidence-card-value">' + d.condicion + '</span></div>' +
                    '<div class="incidence-card-row"><span class="incidence-card-label">Por:</span><span class="incidence-card-value">' + (d.usuario || '').split(' ')[0] + '</span></div>' +
                    '<div class="incidence-card-row"><span class="incidence-card-label">Fecha:</span><span class="incidence-card-value">' + (d.fechaRegistro || d.fecha) + '</span></div>' +
                    '<button type="button" class="btn-correct-incidence" data-correct-module="damages" data-correct-id="' + d.id + '">✅ Avería corregida</button>' +
                    '</div>';
            }).join('');
        }

        function filterSecurityPending() {
            ensureRecordStatuses();
            var filterEl = document.getElementById('securityCorrectFilter');
            var filter = filterEl ? filterEl.value.toUpperCase() : '';
            var pending = allSecurity.filter(function (s) {
                return isPendingStatus(s) && String(s.area || '').toUpperCase().indexOf(filter) !== -1;
            });
            var countEl = document.getElementById('securityPendingCount');
            if (countEl) countEl.textContent = pending.length;
            var list = document.getElementById('securityCorrectList');
            if (!list) return;
            if (pending.length === 0) {
                list.innerHTML = '<div style="color: #999; text-align: center; padding: 24px;">No hay incidencias pendientes</div>';
                return;
            }
            list.innerHTML = pending.map(function (s) {
                var urg = s.clasificacion === 'Urgente' ? 'alto' : 'medio';
                return '<div class="incidence-card ' + urg + '">' +
                    '<div class="incidence-card-row"><span class="incidence-card-label">Tipo:</span><span class="incidence-card-value">' + s.tipo + '</span></div>' +
                    '<div class="incidence-card-row"><span class="incidence-card-label">Área:</span><span class="incidence-card-value">' + s.area + '</span></div>' +
                    '<div class="incidence-card-row"><span class="incidence-card-label">Detalle:</span><span class="incidence-card-value">' + s.detalle + '</span></div>' +
                    '<div class="incidence-card-row"><span class="incidence-card-label">Clasif.:</span><span class="incidence-card-value">' + s.clasificacion + '</span></div>' +
                    '<div class="incidence-card-row"><span class="incidence-card-label">Por:</span><span class="incidence-card-value">' + (s.usuario || '').split(' ')[0] + '</span></div>' +
                    '<div class="incidence-card-row"><span class="incidence-card-label">Fecha:</span><span class="incidence-card-value">' + s.fecha + '</span></div>' +
                    '<button type="button" class="btn-correct-incidence" data-correct-module="security" data-correct-id="' + s.id + '">✅ Incidencia corregida</button>' +
                    '</div>';
            }).join('');
        }

        function auditFailedCount(a) {
            return [a.obstruccionesPasillo, a.sinSkuAveriado, a.iluminacion, a.sinPaletasRotas, a.acuracidad]
                .filter(Boolean).length;
        }

        function filterAuditPending() {
            ensureRecordStatuses();
            var filterEl = document.getElementById('auditCorrectFilter');
            var filter = filterEl ? filterEl.value.toUpperCase() : '';
            var pending = allAudits.filter(function (a) {
                return isPendingStatus(a) && String(a.pasillo || '').toUpperCase().indexOf(filter) !== -1;
            });
            var countEl = document.getElementById('auditPendingCount');
            if (countEl) countEl.textContent = pending.length;
            var list = document.getElementById('auditCorrectList');
            if (!list) return;
            if (pending.length === 0) {
                list.innerHTML = '<div style="color: #999; text-align: center; padding: 24px;">No hay hallazgos pendientes</div>';
                return;
            }
            list.innerHTML = pending.map(function (a) {
                var ok = auditFailedCount(a);
                var pct = Math.round((ok / 5) * 100);
                return '<div class="incidence-card ' + (pct < 60 ? 'alto' : 'medio') + '">' +
                    '<div class="incidence-card-row"><span class="incidence-card-label">Pasillo:</span><span class="incidence-card-value">' + a.pasillo + '</span></div>' +
                    '<div class="incidence-card-row"><span class="incidence-card-label">Auditor:</span><span class="incidence-card-value">' + a.auditor + '</span></div>' +
                    '<div class="incidence-card-row"><span class="incidence-card-label">Turno:</span><span class="incidence-card-value">' + a.turno + '</span></div>' +
                    '<div class="incidence-card-row"><span class="incidence-card-label">Cumplimiento:</span><span class="incidence-card-value">' + pct + '% (' + ok + '/5)</span></div>' +
                    '<div class="incidence-card-row"><span class="incidence-card-label">Fecha:</span><span class="incidence-card-value">' + a.fecha + '</span></div>' +
                    '<button type="button" class="btn-correct-incidence" data-correct-module="audit" data-correct-id="' + a.id + '">✅ Hallazgo corregido</button>' +
                    '</div>';
            }).join('');
        }

        function renderEquipmentCorrectList() {
            var equipos = Object.entries(equipmentRegistry)
                .map(function (entry) { return { codigo: entry[0], data: entry[1] }; })
                .filter(function (e) { return e.data && e.data.estado === 'NO_DISPONIBLE'; })
                .sort(function (a, b) { return a.codigo.localeCompare(b.codigo); });
            var list = document.getElementById('equipmentCorrectList');
            if (!list) return;
            if (equipos.length === 0) {
                list.innerHTML = '<div style="color: #999; text-align: center; padding: 24px;">No hay equipos pendientes de corrección</div>';
                return;
            }
            list.innerHTML = equipos.map(function (e) {
                return '<div class="incidence-card alto">' +
                    '<div class="incidence-card-row"><span class="incidence-card-label">Código:</span><span class="incidence-card-value">' + e.codigo + '</span></div>' +
                    '<div class="incidence-card-row"><span class="incidence-card-label">Tipo:</span><span class="incidence-card-value">' + e.data.tipo + '</span></div>' +
                    '<div class="incidence-card-row"><span class="incidence-card-label">Estado:</span><span class="incidence-card-value">No disponible</span></div>' +
                    '<div class="incidence-card-row"><span class="incidence-card-label">Actualizado:</span><span class="incidence-card-value">' + (e.data.ultimaActualizacion || '—') + '</span></div>' +
                    '<button type="button" class="btn-correct-incidence" data-correct-module="equipment" data-correct-id="' + String(e.codigo).replace(/"/g, '&quot;') + '">✅ Equipo corregido</button>' +
                    '</div>';
            }).join('');
        }

        function markCorrected(id) {
            markRecordCorrected('pallets', id);
        }

        function confirmCorrection() {
            if (pendingCorrection) {
                applyCorrectionNow(pendingCorrection.module, pendingCorrection.id);
                pendingCorrection = null;
            }
            hideCorrectionModal();
        }

        function getSeverityEmoji(type) {
            const emojis = { BAJO: '🟡', MEDIO: '🟠', ALTO: '🔴' };
            return emojis[type] || '⚪';
        }

        // Stats
        function updateStats() {
            const pending = allIncidences.filter(i => isPendingStatus(i)).length;
            const corrected = allIncidences.filter(i => !isPendingStatus(i)).length;
            const critical = allIncidences.filter(i => isPendingStatus(i) && i.type === 'ALTO').length;
            const totalPl = allIncidences.length;
            const total = pending + corrected;
            const completion = total === 0 ? 0 : Math.round((corrected / total) * 100);

            const el = (id) => document.getElementById(id);
            if (el('statPending')) el('statPending').textContent = pending;
            if (el('statCorrected')) el('statCorrected').textContent = corrected;
            if (el('statCritical')) el('statCritical').textContent = critical;
            if (el('statTotalPl')) el('statTotalPl').textContent = totalPl;
            if (el('statCompletion')) el('statCompletion').textContent = completion + '%';
        }

        function updateDamagesStats() {
            const today = new Date().toISOString().split('T')[0];
            const pending = allDamages.filter(d => isPendingStatus(d)).length;
            const total = allDamages.length;
            const almacen = allDamages.filter(d => d.area === 'Almacén').length;
            const devolucion = allDamages.filter(d => d.area === 'Devolución').length;
            const recuperacion = allDamages.filter(d => d.area === 'Recuperación').length;
            const registrosHoy = allDamages.filter(d => d.fecha === today).length;
            const el = (id) => document.getElementById(id);
            if (el('statDamTotal')) el('statDamTotal').textContent = total;
            if (el('statDamAlmacen')) el('statDamAlmacen').textContent = almacen;
            if (el('statDamDevolucion')) el('statDamDevolucion').textContent = devolucion;
            if (el('statDamRecuperacion')) el('statDamRecuperacion').textContent = recuperacion;
            if (el('statDamToday')) el('statDamToday').textContent = registrosHoy + (pending > 0 ? ' · ' + pending + ' pend.' : '');
        }

        function updateSecurityStats() {
            const total = allSecurity.length;
            const urgent = allSecurity.filter(s => s.clasificacion === 'Urgente').length;
            const nonUrgent = allSecurity.filter(s => s.clasificacion === 'No urgente').length;
            const withPhoto = allSecurity.filter(s => s.foto).length;
            const pctUrgent = total === 0 ? 0 : Math.round((urgent / total) * 100);
            const el = (id) => document.getElementById(id);
            if (el('statSecTotal')) el('statSecTotal').textContent = total;
            if (el('statSecUrgent')) el('statSecUrgent').textContent = urgent;
            if (el('statSecNonUrgent')) el('statSecNonUrgent').textContent = nonUrgent;
            if (el('statSecPhoto')) el('statSecPhoto').textContent = withPhoto;
            if (el('statSecPctUrgent')) el('statSecPctUrgent').textContent = pctUrgent + '%';
        }

        function updateAuditStats() {
            const total = allAudits.length;
            const turnoA = allAudits.filter(a => a.turno === 'A').length;
            const turnoB = allAudits.filter(a => a.turno === 'B').length;
            const pasillos = new Set(allAudits.map(a => (a.pasillo || '').trim().toLowerCase()).filter(Boolean)).size;
            let compliance = 0;
            if (total > 0) {
                const passed = allAudits.reduce((sum, a) => {
                    return sum + [a.obstruccionesPasillo, a.sinSkuAveriado, a.iluminacion, a.sinPaletasRotas, a.acuracidad].filter(Boolean).length;
                }, 0);
                compliance = Math.round((passed / (total * 5)) * 100);
            }
            const el = (id) => document.getElementById(id);
            if (el('statAuditTotal')) el('statAuditTotal').textContent = total;
            if (el('statAuditTurnoA')) el('statAuditTurnoA').textContent = turnoA;
            if (el('statAuditTurnoB')) el('statAuditTurnoB').textContent = turnoB;
            if (el('statAuditPasillos')) el('statAuditPasillos').textContent = pasillos;
            if (el('statAuditCompliance')) el('statAuditCompliance').textContent = compliance + '%';
        }

        // CSV Export
        function escapeCsvField(value) {
            const str = String(value ?? '');
            return '"' + str.replace(/"/g, '""') + '"';
        }

        function downloadCsv(filename, headers, rows) {
            const delimiter = ';';
            let csv = '\uFEFF' + headers.map(escapeCsvField).join(delimiter) + '\n';
            rows.forEach(row => {
                csv += row.map(escapeCsvField).join(delimiter) + '\n';
            });
            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            a.click();
            URL.revokeObjectURL(url);
        }

        function exportCSV() {
            if (allIncidences.length === 0) {
                alert('No hay incidencias para exportar');
                return;
            }
            const headers = [
                'ID', 'Ubicación', 'Rack', 'Nivel', 'Posición', 'Producto', 'Descripción Producto',
                'Tipo', 'Avería', 'Estado', 'Reporta', 'Fecha', 'Corregido Por', 'Fecha Corrección', 'Ruta Foto'
            ];
            const rows = allIncidences.map(inc => {
                const parts = (inc.location || '').split('-');
                return [
                    inc.id,
                    inc.location,
                    parts[0] || '',
                    parts[1] || '',
                    parts[2] || '',
                    inc.product,
                    inc.productDescription || resolveProductDescription(inc.product, inc.location),
                    inc.type,
                    inc.description || '',
                    inc.status,
                    inc.reportedBy,
                    inc.reportDate,
                    inc.correctedBy || '',
                    inc.correctionDate || '',
                    ''
                ];
            });
            downloadCsv(`paletas_rotas_${new Date().toLocaleDateString('es-ES').replace(/\//g, '-')}.csv`, headers, rows);
            alert('✅ CSV de paletas exportado');
        }

        function exportDamagesCSV() {
            if (allDamages.length === 0) {
                alert('No hay averías para exportar');
                return;
            }
            const headers = ['ID', 'Área', 'Código', 'Cantidad', 'Fecha', 'Condición', 'Registrado Por', 'Fecha Registro'];
            const rows = allDamages.map(d => [
                d.id, d.area, d.codigo, d.cantidad, d.fecha, d.condicion, d.usuario, d.fechaRegistro || d.fecha
            ]);
            downloadCsv(`averias_inventario_${new Date().toLocaleDateString('es-ES').replace(/\//g, '-')}.csv`, headers, rows);
            alert('✅ CSV de averías exportado');
        }

        function exportSecurityCSV() {
            if (allSecurity.length === 0) {
                alert('No hay incidencias de seguridad para exportar');
                return;
            }
            const headers = ['ID', 'Tipo', 'Detalle', 'Área Específica', 'Clasificación', 'Reportado Por', 'Fecha Reporte', 'Ruta Foto'];
            const rows = allSecurity.map(s => [
                s.id, s.tipo, s.detalle, s.area, s.clasificacion, s.usuario, s.fecha, s.foto ? 'foto_adjunta' : ''
            ]);
            downloadCsv(`incidencias_seguridad_${new Date().toLocaleDateString('es-ES').replace(/\//g, '-')}.csv`, headers, rows);
            alert('✅ CSV de seguridad exportado');
        }

        function exportAuditCSV() {
            if (allAudits.length === 0) {
                alert('No hay auditorías para exportar');
                return;
            }
            const headers = [
                'ID', 'Auditor', 'Pasillo', 'Responsable', 'Turno',
                'Sin Obstrucciones Pasillo', 'Sin SKU Averiado', 'Iluminación y Limpieza',
                'Sin Paletas Rotas', 'Acuracidad', 'Registrado Por', 'Fecha Registro'
            ];
            const yesNo = v => v ? 'Sí' : 'No';
            const rows = allAudits.map(a => [
                a.id, a.auditor, a.pasillo, a.responsable, a.turno,
                yesNo(a.obstruccionesPasillo), yesNo(a.sinSkuAveriado), yesNo(a.iluminacion),
                yesNo(a.sinPaletasRotas), yesNo(a.acuracidad), a.usuario, a.fecha
            ]);
            downloadCsv(`auditoria_5s_${new Date().toLocaleDateString('es-ES').replace(/\//g, '-')}.csv`, headers, rows);
            alert('✅ CSV de auditoría 5S exportado');
        }

        function exportEquipmentCSV() {
            if (allEquipmentInspections.length === 0) {
                alert('No hay inspecciones de equipos para exportar');
                return;
            }
            const headers = [
                'ID', 'Almacén', 'Fecha', 'Mes', 'Operador', 'Supervisor', 'Código Equipo', 'Tipo Equipo',
                'Nivel Batería', 'Nivel Fluidos', 'Frenos', 'Luz Centella Mástil', 'Bocina', 'Pito Reversa',
                'Llantas', 'Extintor', 'Medidor Temperatura', 'Disponible', 'Observaciones',
                'Registrado Por', 'Fecha Registro'
            ];
            const yesNo = v => v ? 'Sí' : 'No';
            const rows = allEquipmentInspections.map(r => [
                r.id, r.almacen, r.fecha, r.mes, r.operador, r.supervisor, r.codigoEquipo, r.tipoEquipo,
                yesNo(r.bateriaOk), yesNo(r.fluidosOk), yesNo(r.frenosOk), yesNo(r.luzCentellaOk),
                yesNo(r.bocinaOk), yesNo(r.pitoReversaOk), yesNo(r.llantasOk), yesNo(r.extintorOk),
                yesNo(r.medidorTempOk), r.disponible ? 'Sí' : 'No', r.observaciones, r.usuario, r.fechaRegistro
            ]);
            downloadCsv(`inspeccion_equipos_${new Date().toLocaleDateString('es-ES').replace(/\//g, '-')}.csv`, headers, rows);
            alert('CSV de inspección de equipos exportado');
        }

        function showCorrectionModal(title, message) {
            var modal = document.getElementById('modal');
            if (!modal) return;
            document.getElementById('modalTitle').textContent = title;
            document.getElementById('modalMessage').textContent = message;
            modal.classList.add('show');
            modal.removeAttribute('hidden');
            modal.setAttribute('aria-hidden', 'false');
            document.body.classList.add('av-modal-open');
        }

        function hideCorrectionModal() {
            pendingCorrection = null;
            var modal = document.getElementById('modal');
            if (modal) {
                modal.classList.remove('show');
                modal.setAttribute('hidden', 'hidden');
                modal.setAttribute('aria-hidden', 'true');
            }
            document.body.classList.remove('av-modal-open');
        }

        function initCorrectionModal() {
            if (!global.__avCorrectionClickBound) {
                global.__avCorrectionClickBound = true;
                document.addEventListener('click', function (e) {
                    var editBtn = e.target && e.target.closest ? e.target.closest('[data-edit-module]') : null;
                    if (editBtn) {
                        e.preventDefault();
                        e.stopPropagation();
                        var editModule = editBtn.getAttribute('data-edit-module');
                        var editRawId = editBtn.getAttribute('data-edit-id');
                        var editId = editModule === 'equipment' ? editRawId : (Number(editRawId) || editRawId);
                        openEditReport(editModule, editId);
                        return;
                    }
                    var btn = e.target && e.target.closest ? e.target.closest('[data-correct-module]') : null;
                    if (!btn) return;
                    e.preventDefault();
                    e.stopPropagation();
                    var module = btn.getAttribute('data-correct-module');
                    var rawId = btn.getAttribute('data-correct-id');
                    var id = module === 'equipment' ? rawId : (Number(rawId) || rawId);
                    markRecordCorrected(module, id);
                }, true);
            }
            var modal = document.getElementById('modal');
            var confirmBtn = document.getElementById('modalConfirmBtn');
            var cancelBtn = modal && modal.querySelector('.modal-btn-cancel');
            if (confirmBtn && !confirmBtn.__avBound) {
                confirmBtn.__avBound = true;
                confirmBtn.addEventListener('click', function (e) {
                    e.preventDefault();
                    confirmModal();
                });
            }
            if (cancelBtn && !cancelBtn.__avBound) {
                cancelBtn.__avBound = true;
                cancelBtn.addEventListener('click', function (e) {
                    e.preventDefault();
                    hideCorrectionModal();
                });
            }
            if (modal && !modal.__avBound) {
                modal.__avBound = true;
                modal.addEventListener('click', function (e) {
                    if (e.target === modal) hideCorrectionModal();
                });
            }
        }

        function confirmModal() {
            if (pendingCorrection) {
                confirmCorrection();
                return;
            }
            hideCorrectionModal();
        }

        function closeModal() {
            hideCorrectionModal();
        }

        
    

  global.PlatformAveriasUI = {
    start: startApp,
    bindClickBridge: initAveriasClickBridge,
    applyRemoteSnapshot: applyRemoteSnapshot,
    getSnapshotSignature: getSnapshotSignature,
    getMemorySnapshot: buildSnapshot
  };

  global.navigateToModule = navigateToModule;
  global.toggleDrawer = toggleDrawer;
  global.closeDrawer = closeDrawer;
  global.toggleFitScreen = toggleFitScreen;
  global.syncAveriasData = syncAveriasData;
  global.openCloudSetupModal = openCloudSetupModal;
  global.closeCloudSetupModal = closeCloudSetupModal;
  global.submitCloudSetup = submitCloudSetup;
  global.handleReportButton = handleReportButton;
  global.handleCorrectButton = handleCorrectButton;
  global.handleDamagesCorrectButton = handleDamagesCorrectButton;
  global.handleSecurityCorrectButton = handleSecurityCorrectButton;
  global.handleAuditCorrectButton = handleAuditCorrectButton;
  global.handleEquipmentCorrectButton = handleEquipmentCorrectButton;
  global.filterDamagesPending = filterDamagesPending;
  global.filterSecurityPending = filterSecurityPending;
  global.filterAuditPending = filterAuditPending;
  global.markRecordCorrected = markRecordCorrected;
  global.openEditReport = openEditReport;
  global.showPalletsDashboard = showPalletsDashboard;
  global.handleReport = handleReport;
  global.selectSeverity = selectSeverity;
  global.filterIncidences = filterIncidences;
  global.markCorrected = markCorrected;
  global.closeModal = closeModal;
  global.confirmModal = confirmModal;
  global.showDamagesForm = showDamagesForm;
  global.showDamagesDashboard = showDamagesDashboard;
  global.selectDamageArea = selectDamageArea;
  global.resetDamageArea = resetDamageArea;
  global.saveDamage = saveDamage;
  global.showSecurityForm = showSecurityForm;
  global.selectSecurityClass = selectSecurityClass;
  global.simulatePhoto = simulatePhoto;
  global.saveSecurity = saveSecurity;
  global.showAuditForm = showAuditForm;
  global.selectTurno = selectTurno;
  global.toggleCheck = toggleCheck;
  global.saveAudit = saveAudit;
  global.showEquipmentForm = showEquipmentForm;
  global.showEquipmentList = showEquipmentList;
  global.selectEqCheck = selectEqCheck;
  global.saveEquipmentInspection = saveEquipmentInspection;
  global.exportCSV = exportCSV;
  global.exportDamagesCSV = exportDamagesCSV;
  global.exportSecurityCSV = exportSecurityCSV;
  global.exportAuditCSV = exportAuditCSV;
  global.exportEquipmentCSV = exportEquipmentCSV;
  global.playSelectFeedback = playSelectFeedback;
  global.lookupProductDescription = lookupProductDescription;
  global.showSecurityDashboard = showSecurityDashboard;
  global.showAuditDashboard = showAuditDashboard;
  global.showEquipmentDashboard = showEquipmentDashboard;
  global.handleLogout = handleLogout;
})(typeof window !== 'undefined' ? window : this);
