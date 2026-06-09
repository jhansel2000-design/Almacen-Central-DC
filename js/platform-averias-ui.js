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

  function startApp(user) {
    currentEmployee = mapSessionUser(user);
    if (!currentEmployee) return;
    var main = document.getElementById('mainApp');
    if (main) main.classList.remove('hidden');
    document.getElementById('drawerUser').textContent = currentEmployee.name + ' (' + currentEmployee.role + ')';
    var auditAuditor = document.getElementById('auditAuditor');
    if (auditAuditor) auditAuditor.value = currentEmployee.name;
    var damageFecha = document.getElementById('damageFecha');
    if (damageFecha) damageFecha.value = new Date().toISOString().split('T')[0];
    initEquipmentFormDefaults();
    buildEquipmentChecklist();
    loadData();
    if (global.PlatformAveriasCloudSync && global.PlatformAveriasCloudSync.pull) {
      global.PlatformAveriasCloudSync.pull().then(function () {
        loadData();
        refreshCurrentView();
      });
    }
    if (typeof closeDrawer === 'function') closeDrawer();
    initFitScreen();
    initCorrectionModal();
    showWelcome();
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
        var applyingRemoteSnapshot = false;

        function buildSnapshot() {
            return {
                updatedAt: new Date().toISOString(),
                incidences: allIncidences,
                damages: allDamages,
                securityIncidents: allSecurity,
                audits5s: allAudits,
                equipmentInspections: allEquipmentInspections,
                equipmentRegistry: equipmentRegistry
            };
        }

        function applySnapshot(snap) {
            if (!snap || typeof snap !== 'object') return false;
            allIncidences = Array.isArray(snap.incidences) ? snap.incidences : [];
            allDamages = Array.isArray(snap.damages) ? snap.damages : [];
            allSecurity = Array.isArray(snap.securityIncidents) ? snap.securityIncidents : [];
            allAudits = Array.isArray(snap.audits5s) ? snap.audits5s : [];
            allEquipmentInspections = Array.isArray(snap.equipmentInspections) ? snap.equipmentInspections : [];
            equipmentRegistry = snap.equipmentRegistry && typeof snap.equipmentRegistry === 'object' ? snap.equipmentRegistry : {};
            ensureRecordStatuses();
            return true;
        }

        function isPendingStatus(record) {
            return String(record && record.status || 'PENDIENTE').toUpperCase() !== 'CORREGIDO';
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
            return changed;
        }

        function sameRecordId(a, b) {
            return String(a) === String(b);
        }

        function findById(list, id) {
            return list.find(function (r) { return sameRecordId(r.id, id); });
        }

        function writeIndividualKeys() {
            localStorage.setItem('averias_dc_incidences', JSON.stringify(allIncidences));
            localStorage.setItem('averias_dc_damages', JSON.stringify(allDamages));
            localStorage.setItem('averias_dc_securityIncidents', JSON.stringify(allSecurity));
            localStorage.setItem('averias_dc_audits5s', JSON.stringify(allAudits));
            localStorage.setItem('averias_dc_equipmentInspections', JSON.stringify(allEquipmentInspections));
            localStorage.setItem('averias_dc_equipmentRegistry', JSON.stringify(equipmentRegistry));
        }

        function persistSnapshot() {
            if (applyingRemoteSnapshot) return;
            try {
                applyingRemoteSnapshot = true;
                var idsAssigned = ensureRecordStatuses();
                writeIndividualKeys();
                var snap = buildSnapshot();
                snap.updatedAt = new Date().toISOString();
                localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snap));
                if (global.PlatformAveriasCloudSync && global.PlatformAveriasCloudSync.push) {
                    global.PlatformAveriasCloudSync.push(snap).then(function (result) {
                        if (result && !result.ok && global.PlatformAveriasCloudSync.isCloudConfigured &&
                            global.PlatformAveriasCloudSync.isCloudConfigured()) {
                            if (global.PlatformToast) {
                                global.PlatformToast.warn('Reporte guardado; reintentando sync...', 3000);
                            }
                        } else if (result && !result.ok && !global.PlatformAveriasCloudSync.isCloudConfigured()) {
                            if (global.PlatformToast) {
                                global.PlatformToast.warn('Reporte solo en este celular — falta configurar nube', 5000);
                            }
                        }
                    });
                } else if (idsAssigned) {
                    /* ids nuevos guardados solo en local */
                }
            } finally {
                applyingRemoteSnapshot = false;
            }
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

        function loadData() {
            const snapRaw = localStorage.getItem(SNAPSHOT_KEY);
            if (snapRaw) {
                try {
                    if (applySnapshot(JSON.parse(snapRaw))) {
                        if (ensureRecordStatuses()) persistSnapshot();
                        updateAllStats();
                        return;
                    }
                } catch (e) { /* fallback legacy */ }
            }
            loadDataFromLegacyKeys();
            ensureRecordStatuses();
            persistSnapshot();
            updateAllStats();
        }

        function updateAllStats() {
            updateStats();
            updateDamagesStats();
            updateSecurityStats();
            updateAuditStats();
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

        function reloadFromSync() {
            applyingRemoteSnapshot = true;
            try {
                loadData();
            } finally {
                applyingRemoteSnapshot = false;
            }
            refreshCurrentView();
        }

        function reloadFromSyncDebounced() {
            if (Date.now() < correctionLockUntil) return;
            clearTimeout(reloadSyncTimer);
            reloadSyncTimer = setTimeout(reloadFromSync, 80);
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
                    ? 'Reportes sincronizados — todos ven los mismos datos'
                    : 'Sin nube activa. Pulse «Activar nube» en el banner o ejecute SETUP-AVERIAS-CLOUD.bat en el PC.';
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
            if (status) {
                status.hidden = true;
                status.textContent = '';
                status.className = 'av-cloud-status';
            }
            if (input) input.value = '';
            if (modal) modal.hidden = false;
            if (input) global.setTimeout(function () { input.focus(); }, 100);
        }

        function closeCloudSetupModal() {
            var modal = document.getElementById('cloudSetupModal');
            if (modal) modal.hidden = true;
        }

        function submitCloudSetup() {
            var input = document.getElementById('cloudMasterKey');
            var submit = document.getElementById('cloudSetupSubmit');
            var status = document.getElementById('cloudSetupStatus');
            var key = input ? String(input.value || '').trim() : '';
            if (!key) {
                if (status) {
                    status.hidden = false;
                    status.className = 'av-cloud-status err';
                    status.textContent = 'Ingrese la Master Key de jsonbin.io';
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
            document.addEventListener('averias-updated', function () { reloadFromSyncDebounced(); });
            document.addEventListener('lan-ready', function () {
                if (global.PlatformLanSync && global.PlatformLanSync.forcePull) {
                    global.PlatformLanSync.forcePull().then(function () { reloadFromSyncDebounced(); });
                }
            });
            global.addEventListener('visibilitychange', function () {
                if (document.visibilityState === 'visible') {
                    if (global.PlatformAveriasCloudSync && global.PlatformAveriasCloudSync.pull) {
                        global.PlatformAveriasCloudSync.pull().then(reloadFromSyncDebounced);
                    } else if (global.PlatformLanSync && global.PlatformLanSync.isEnabled()) {
                        global.PlatformLanSync.forcePull().then(function () { reloadFromSyncDebounced(); });
                    }
                }
            }, { passive: true });
        }

        if (!global._averiasSyncBound) {
            global._averiasSyncBound = true;
            initAveriasSync();
        }

        function saveData() {
            persistSnapshot();
            updateStats();
        }

        function saveDamagesData() {
            persistSnapshot();
            updateDamagesStats();
        }

        function saveSecurityData() {
            persistSnapshot();
            updateSecurityStats();
        }

        function saveAuditsData() {
            persistSnapshot();
            updateAuditStats();
        }

        function saveEquipmentData() {
            persistSnapshot();
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
            document.getElementById('palletsDashboard').classList.remove('hidden');
            document.getElementById('palletsReport').classList.add('hidden');
            document.getElementById('palletsCorrect').classList.add('hidden');
            updateStats();
        }

        function handleReportButton() {
            playSelectFeedback();
            
            document.getElementById('palletsDashboard').classList.add('hidden');
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
            document.getElementById('damagesDashboard').classList.add('hidden');
            document.getElementById('damagesFormPanel').classList.remove('hidden');
            resetDamageArea();
        }

        function showSecurityDashboard() {
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
            document.getElementById('securityDashboard').classList.add('hidden');
            document.getElementById('securityFormPanel').classList.remove('hidden');
        }

        function showAuditDashboard() {
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
            document.getElementById('auditDashboard').classList.add('hidden');
            document.getElementById('auditFormPanel').classList.remove('hidden');
            document.getElementById('auditAuditor').value = currentEmployee.name;
        }

        function showEquipmentDashboard() {
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
            allDamages.push({
                id: Date.now(),
                area: selectedDamageArea,
                codigo,
                cantidad,
                fecha: document.getElementById('damageFecha').value,
                condicion: document.getElementById('damageCondicion').value,
                usuario: currentEmployee.name,
                fechaRegistro: new Date().toLocaleString('es-ES'),
                status: 'PENDIENTE',
                correctedBy: null,
                correctionDate: null
            });
            saveDamagesData();
            updateDamagesStats();
            alert('✅ Avería guardada correctamente');
            document.getElementById('damageCodigo').value = '';
            document.getElementById('damageCantidad').value = '';
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
            allSecurity.push({
                id: Date.now(),
                tipo: document.getElementById('securityTipo').value,
                detalle,
                area,
                clasificacion: securityClass,
                foto: hasPhoto,
                usuario: currentEmployee.name,
                fecha: new Date().toLocaleString('es-ES'),
                status: 'PENDIENTE',
                correctedBy: null,
                correctionDate: null
            });
            saveSecurityData();
            updateSecurityStats();
            alert('✅ Incidencia de seguridad guardada');
            document.getElementById('securityDetalle').value = '';
            document.getElementById('securityArea').value = '';
            hasPhoto = false;
            document.getElementById('photoStatus').textContent = '';
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
            allAudits.push({
                id: Date.now(),
                auditor,
                pasillo,
                responsable,
                turno: selectedTurno,
                obstruccionesPasillo: document.querySelector('#chkObstrucciones .toggle-switch').classList.contains('on'),
                sinSkuAveriado: document.querySelector('#chkSkuAveriado .toggle-switch').classList.contains('on'),
                iluminacion: document.querySelector('#chkIluminacion .toggle-switch').classList.contains('on'),
                sinPaletasRotas: document.querySelector('#chkPaletas .toggle-switch').classList.contains('on'),
                acuracidad: document.querySelector('#chkAcuracidad .toggle-switch').classList.contains('on'),
                usuario: currentEmployee.name,
                fecha: new Date().toLocaleString('es-ES'),
                status: 'PENDIENTE',
                correctedBy: null,
                correctionDate: null
            });
            saveAuditsData();
            updateAuditStats();
            alert('✅ Auditoría 5S guardada');
            document.getElementById('auditPasillo').value = '';
            document.getElementById('auditResponsable').value = '';
            document.querySelectorAll('.toggle-switch').forEach(t => { t.classList.remove('on'); });
            document.querySelectorAll('.checklist-item').forEach(r => { r.classList.remove('ok','bad'); r.classList.add('bad'); });
        }

        // Report Handler
        function handleReport(e) {
            e.preventDefault();
            const location = document.getElementById('reportLocation').value;
            const product = document.getElementById('reportProduct').value;
            const severity = document.getElementById('reportSeverity').value;
            const observation = document.getElementById('reportObservation').value;

            if (!severity) {
                document.getElementById('reportError').textContent = '❌ Selecciona un tipo de avería';
                document.getElementById('reportError').classList.add('show');
                return;
            }

            // Check for duplicate
            const duplicate = allIncidences.find(inc => 
                inc.location === location && 
                inc.product === product && 
                inc.status === 'PENDIENTE'
            );

            if (duplicate) {
                document.getElementById('reportError').textContent = '❌ Ya existe una avería reportada para esta ubicación y producto';
                document.getElementById('reportError').classList.add('show');
                return;
            }

            const productDescription = resolveProductDescription(product, location);

            const incidence = {
                id: Date.now(),
                location,
                product,
                productDescription,
                type: severity,
                description: observation,
                reportedBy: currentEmployee.name,
                reportDate: new Date().toLocaleDateString('es-ES') + ' ' + new Date().toLocaleTimeString('es-ES', {hour: '2-digit', minute:'2-digit'}),
                status: 'PENDIENTE',
                correctedBy: null,
                correctionDate: null
            };

            allIncidences.push(incidence);
            saveData();
            updateStats();

            document.getElementById('reportLocation').value = '';
            document.getElementById('reportProduct').value = '';
            document.getElementById('reportObservation').value = '';
            document.getElementById('reportSeverity').value = '';
            document.querySelectorAll('.severity-btn').forEach(function (btn) { btn.classList.remove('selected'); });
            document.getElementById('reportError').classList.remove('show');
            document.getElementById('reportSuccess').classList.add('show');

            setTimeout(function () {
                document.getElementById('reportSuccess').classList.remove('show');
                showPalletsDashboard();
            }, 1500);
        }

        function selectSeverity(severity) {
            playSelectFeedback();
            selectedSeverity = severity;
            document.getElementById('reportSeverity').value = severity;
            document.querySelectorAll('.severity-btn').forEach(btn => btn.classList.remove('selected'));
            event.target.classList.add('selected');

            // Auto-fill observation based on severity
            const observations = {
                'BAJO': 'Daño menor. Paleta con pequeñas roturas o deformaciones que no afectan funcionalidad.',
                'MEDIO': 'Daño moderado. Paleta con daños significativos en estructura o esquinas. Requiere reparación.',
                'ALTO': 'Daño crítico. Paleta destruida, derrumbada o con riesgos de seguridad. Requiere recolección inmediata.'
            };

            document.getElementById('reportObservation').value = observations[severity];
        }

        // Correct Handler (todos los módulos)
        function correctionTimestamp() {
            return new Date().toLocaleDateString('es-ES') + ' ' +
                new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
        }

        function markRecordCorrected(module, id) {
            playSelectFeedback();
            if (id == null || id === '') return;
            pendingCorrection = { module: module, id: id };
            var title = 'Confirmar corrección';
            var message = '¿Confirmar que este registro fue corregido?';

            if (module === 'pallets') {
                var inc = findById(allIncidences, id);
                title = 'Corregir paleta';
                message = inc
                    ? '¿Confirmar corrección de la incidencia en ' + inc.location + ' (' + inc.product + ')?'
                    : message;
            } else if (module === 'damages') {
                var d = findById(allDamages, id);
                title = 'Corregir avería';
                message = d
                    ? '¿Confirmar corrección de avería ' + d.codigo + ' en ' + d.area + '?'
                    : message;
            } else if (module === 'security') {
                var s = findById(allSecurity, id);
                title = 'Corregir incidencia de seguridad';
                message = s
                    ? '¿Confirmar corrección en ' + s.area + ' (' + s.tipo + ')?'
                    : message;
            } else if (module === 'audit') {
                var a = findById(allAudits, id);
                title = 'Corregir hallazgo 5S';
                message = a
                    ? '¿Confirmar corrección del pasillo ' + a.pasillo + ' (turno ' + a.turno + ')?'
                    : message;
            } else if (module === 'equipment') {
                title = 'Corregir equipo';
                message = '¿Marcar equipo ' + id + ' como DISPONIBLE?';
            }

            showCorrectionModal(title, message);
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
                    <button class="btn-correct-incidence" onclick="markRecordCorrected('pallets', ${inc.id})">✅ Paleta corregida</button>
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
                    '<button class="btn-correct-incidence" onclick="markRecordCorrected(\'damages\', ' + d.id + ')">✅ Avería corregida</button>' +
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
                    '<button class="btn-correct-incidence" onclick="markRecordCorrected(\'security\', ' + s.id + ')">✅ Incidencia corregida</button>' +
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
                    '<button class="btn-correct-incidence" onclick="markRecordCorrected(\'audit\', ' + a.id + ')">✅ Hallazgo corregido</button>' +
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
                    '<button class="btn-correct-incidence" onclick="markRecordCorrected(\'equipment\', ' + JSON.stringify(String(e.codigo)) + ')">✅ Equipo corregido</button>' +
                    '</div>';
            }).join('');
        }

        function markCorrected(id) {
            markRecordCorrected('pallets', id);
        }

        function confirmCorrection() {
            if (!pendingCorrection) return;
            var module = pendingCorrection.module;
            var id = pendingCorrection.id;
            var ts = correctionTimestamp();
            var corrected = false;

            if (module === 'pallets') {
                var inc = findById(allIncidences, id);
                if (inc) {
                    inc.status = 'CORREGIDO';
                    inc.correctedBy = currentEmployee.name;
                    inc.correctionDate = ts;
                    correctionLockUntil = Date.now() + 4000;
                    saveData();
                    filterIncidences();
                    corrected = true;
                }
            } else if (module === 'damages') {
                var dmg = findById(allDamages, id);
                if (dmg) {
                    dmg.status = 'CORREGIDO';
                    dmg.correctedBy = currentEmployee.name;
                    dmg.correctionDate = ts;
                    correctionLockUntil = Date.now() + 4000;
                    saveDamagesData();
                    filterDamagesPending();
                    corrected = true;
                }
            } else if (module === 'security') {
                var sec = findById(allSecurity, id);
                if (sec) {
                    sec.status = 'CORREGIDO';
                    sec.correctedBy = currentEmployee.name;
                    sec.correctionDate = ts;
                    correctionLockUntil = Date.now() + 4000;
                    saveSecurityData();
                    filterSecurityPending();
                    corrected = true;
                }
            } else if (module === 'audit') {
                var aud = findById(allAudits, id);
                if (aud) {
                    aud.status = 'CORREGIDO';
                    aud.correctedBy = currentEmployee.name;
                    aud.correctionDate = ts;
                    correctionLockUntil = Date.now() + 4000;
                    saveAuditsData();
                    filterAuditPending();
                    corrected = true;
                }
            } else if (module === 'equipment') {
                var codigo = String(id);
                var eq = equipmentRegistry[codigo];
                if (eq) {
                    eq.estado = 'DISPONIBLE';
                    eq.ultimaActualizacion = ts;
                    eq.correctedBy = currentEmployee.name;
                    correctionLockUntil = Date.now() + 4000;
                    saveEquipmentData();
                    updateEquipmentStats();
                    renderEquipmentCorrectList();
                    corrected = true;
                }
            }

            hideCorrectionModal();

            if (corrected && global.PlatformToast) {
                global.PlatformToast.success('Registro marcado como corregido', 3000);
            } else if (!corrected) {
                alert('No se pudo corregir el registro. Recargue la página e intente de nuevo.');
            }
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
    start: startApp
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
  global.handleLogout = handleLogout;
})(typeof window !== 'undefined' ? window : this);
