/**
 * Administración: usuarios, áreas, permisos, solicitudes de acceso, logs
 */
(function (global) {
  'use strict';

  var KEYS = {
    users: 'almacen_users',
    areas: 'almacen_areas',
    logs: 'almacen_logs',
    accessRequests: 'almacen_access_requests'
  };

  var PERMISSIONS = {
    'dashboard.view': 'Ver dashboards',
    'filter.apply': 'Aplicar filtros',
    'data.import': 'Importar Excel',
    'users.manage': 'Gestionar usuarios',
    'areas.manage': 'Gestionar áreas',
    'config.save': 'Configuración',
    'logs.view': 'Ver historial',
    'ai.use': 'Asistente IA',
    'tv.mode': 'Modo TV',
    'admin.panel': 'Panel administración completo',
    'export.data': 'Exportar datos',
    'despacho.use': 'Módulo Despacho (preparador)',
    'despacho.validate': 'Validador de despacho',
    'access.request': 'Solicitar acceso a configuración',
    'requests.manage': 'Gestionar solicitudes de acceso'
  };

  var ROLE_PERMISSIONS = {
    administrador: Object.keys(PERMISSIONS),
    supervisor: ['dashboard.view', 'filter.apply', 'data.import', 'export.data', 'logs.view', 'ai.use', 'tv.mode', 'admin.panel', 'config.save', 'despacho.use', 'despacho.validate'],
    colaborador: ['dashboard.view', 'filter.apply', 'data.import', 'export.data', 'ai.use', 'tv.mode', 'despacho.use', 'despacho.validate', 'access.request'],
    operador: ['dashboard.view', 'tv.mode', 'despacho.use']
  };

  var ROLE_LABELS = {
    administrador: 'Administrador',
    supervisor: 'Supervisor',
    colaborador: 'Colaborador',
    operador: 'Operador'
  };

  var PRIMARY_ADMIN_USERNAME = 'janselcastro51192';
  var ADMIN_DEFAULT_PASSWORD_HASH = '449e3a3f84a49db5dffa682fc37613d6916da3a74dfe43c071bbdb9d2113e4bf';

  var DEFAULT_USERS = [
    {
      id: 'u_primary_admin',
      username: PRIMARY_ADMIN_USERNAME,
      name: 'Jansel Castro',
      role: 'administrador',
      passwordHash: ADMIN_DEFAULT_PASSWORD_HASH,
      areas: [],
      active: true,
      extraPermissions: [],
      isPrimaryAdmin: true
    }
  ];

  var DEFAULT_AREAS = [
    { id: 'a1', name: 'Recepción', description: 'Órdenes de compra y recibos', active: true },
    { id: 'a2', name: 'Control', description: 'Inventario y recuentos', active: true },
    { id: 'a3', name: 'Despacho', description: 'Ventas y reabastecimiento', active: true },
    { id: 'a4', name: 'Transferencia', description: 'Emisión de transferencias', active: true }
  ];

  function parse(raw, fallback) {
    try { return raw ? JSON.parse(raw) : fallback; } catch (e) { return fallback; }
  }

  function uid() {
    return 'id_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  }

  function normalizeUser(u) {
    if (!u.extraPermissions) u.extraPermissions = [];
    return u;
  }

  function isPrimaryAdminUser(user) {
    if (!user) return false;
    if (user.isPrimaryAdmin) return true;
    return String(user.username || '').toLowerCase() === PRIMARY_ADMIN_USERNAME.toLowerCase();
  }

  function ensureUserRegistry(list) {
    var primaryKey = PRIMARY_ADMIN_USERNAME.toLowerCase();
    var staff = [];
    var primary = null;
    var legacyAdmin = null;

    (list || []).forEach(function (u) {
      var un = String(u.username || '').toLowerCase();
      if (un === primaryKey) {
        primary = normalizeUser(Object.assign({}, u, {
          role: 'administrador',
          active: true,
          isPrimaryAdmin: true,
          username: PRIMARY_ADMIN_USERNAME
        }));
        return;
      }
      if (un === 'admin' && u.role === 'administrador') {
        legacyAdmin = u;
        return;
      }
      var copy = Object.assign({}, u);
      if (copy.role === 'administrador') copy.role = 'supervisor';
      staff.push(normalizeUser(copy));
    });

    if (!primary) {
      primary = normalizeUser({
        id: 'u_primary_admin',
        username: PRIMARY_ADMIN_USERNAME,
        name: 'Jansel Castro',
        role: 'administrador',
        passwordHash: legacyAdmin ? legacyAdmin.passwordHash : ADMIN_DEFAULT_PASSWORD_HASH,
        areas: [],
        active: true,
        extraPermissions: [],
        isPrimaryAdmin: true
      });
    }

    return [primary].concat(staff);
  }

  function getUsers() {
    if (!global.localStorage) {
      return ensureUserRegistry(DEFAULT_USERS).map(function (u) { return Object.assign({}, u); });
    }
    var list = parse(localStorage.getItem(KEYS.users), null);
    if (!list || !list.length) {
      var seeded = ensureUserRegistry(DEFAULT_USERS);
      saveUsers(seeded);
      return seeded.map(function (u) { return Object.assign({}, u); });
    }
    var normalized = ensureUserRegistry(list);
    if (JSON.stringify(normalized) !== JSON.stringify(list)) saveUsers(normalized);
    return normalized.map(function (u) { return Object.assign({}, u); });
  }

  function getPrimaryAdmin() {
    return getUsers().find(isPrimaryAdminUser) || null;
  }

  function getStaffUsers() {
    return getUsers().filter(function (u) { return !isPrimaryAdminUser(u); });
  }

  function saveUsers(users) {
    if (global.localStorage) localStorage.setItem(KEYS.users, JSON.stringify(users.map(normalizeUser)));
  }

  function getAreas() {
    if (!global.localStorage) return DEFAULT_AREAS.slice();
    var list = parse(localStorage.getItem(KEYS.areas), null);
    if (!list || !list.length) {
      saveAreas(DEFAULT_AREAS);
      return DEFAULT_AREAS.slice();
    }
    return list;
  }

  function saveAreas(areas) {
    if (global.localStorage) localStorage.setItem(KEYS.areas, JSON.stringify(areas));
  }

  function getLogs() {
    if (!global.localStorage) return [];
    return parse(localStorage.getItem(KEYS.logs), []);
  }

  function getAccessRequests() {
    if (!global.localStorage) return [];
    return parse(localStorage.getItem(KEYS.accessRequests), []);
  }

  function saveAccessRequests(list) {
    if (global.localStorage) localStorage.setItem(KEYS.accessRequests, JSON.stringify(list));
  }

  function clearLogs() {
    if (global.localStorage) localStorage.setItem(KEYS.logs, JSON.stringify([]));
    return { ok: true };
  }

  function addLog(action, detail, username) {
    var logs = getLogs();
    logs.unshift({
      id: uid(),
      at: new Date().toISOString(),
      action: action,
      detail: detail || '',
      user: username || 'sistema'
    });
    if (logs.length > 200) logs = logs.slice(0, 200);
    if (global.localStorage) localStorage.setItem(KEYS.logs, JSON.stringify(logs));
  }

  function userExtraPermissions(user) {
    if (!user || !user.extraPermissions) return [];
    return user.extraPermissions;
  }

  function can(role, permission, user) {
    if (user && userExtraPermissions(user).indexOf(permission) >= 0) return true;
    var perms = ROLE_PERMISSIONS[role] || [];
    return perms.indexOf(permission) >= 0;
  }

  function canAccessAdminModal(user) {
    if (!user) return false;
    return can(user.role, 'admin.panel', user) || can(user.role, 'data.import', user);
  }

  function authenticate(username, passwordHash) {
    var user = getUsers().find(function (u) {
      return u.active && u.username.toLowerCase() === String(username).toLowerCase().trim();
    });
    if (!user || user.passwordHash !== passwordHash) return null;
    return normalizeUser(Object.assign({}, user));
  }

  function findUserById(id) {
    return getUsers().find(function (u) { return u.id === id; }) || null;
  }

  function createUser(data) {
    if (data.role === 'administrador') {
      return { ok: false, message: 'Solo existe un administrador del sistema. Registra colaboradores u otros roles.' };
    }
    if (String(data.username || '').toLowerCase() === PRIMARY_ADMIN_USERNAME.toLowerCase()) {
      return { ok: false, message: 'Ese nombre está reservado para el administrador del sistema.' };
    }
    var users = getUsers();
    if (users.some(function (u) { return u.username.toLowerCase() === data.username.toLowerCase(); })) {
      return { ok: false, message: 'El usuario ya existe.' };
    }
    var user = normalizeUser({
      id: uid(),
      username: data.username.trim(),
      name: data.name.trim() || data.username,
      role: data.role,
      passwordHash: data.passwordHash,
      areas: data.areas || [],
      active: data.active !== false,
      extraPermissions: data.extraPermissions || []
    });
    users.push(user);
    saveUsers(users);
    return { ok: true, user: user };
  }

  function updateUser(id, patch) {
    var users = getUsers();
    var idx = users.findIndex(function (u) { return u.id === id; });
    if (idx < 0) return { ok: false, message: 'Usuario no encontrado.' };
    if (isPrimaryAdminUser(users[idx])) {
      if (patch.role && patch.role !== 'administrador') {
        return { ok: false, message: 'No se puede cambiar el rol del administrador principal.' };
      }
      if (patch.username && String(patch.username).toLowerCase() !== PRIMARY_ADMIN_USERNAME.toLowerCase()) {
        return { ok: false, message: 'No se puede cambiar el usuario del administrador principal.' };
      }
      patch = Object.assign({}, patch, {
        role: 'administrador',
        username: PRIMARY_ADMIN_USERNAME,
        isPrimaryAdmin: true
      });
    } else if (patch.role === 'administrador') {
      return { ok: false, message: 'No se pueden crear más administradores.' };
    }
    if (patch.username && users.some(function (u, i) { return i !== idx && u.username.toLowerCase() === patch.username.toLowerCase(); })) {
      return { ok: false, message: 'Nombre de usuario en uso.' };
    }
    Object.assign(users[idx], patch);
    normalizeUser(users[idx]);
    saveUsers(users);
    return { ok: true, user: users[idx] };
  }

  function deleteUser(id) {
    var target = findUserById(id);
    if (target && isPrimaryAdminUser(target)) {
      return { ok: false, message: 'No se puede eliminar al administrador principal.' };
    }
    var users = getUsers().filter(function (u) { return u.id !== id; });
    if (users.length === getUsers().length) return { ok: false };
    if (users.filter(function (u) { return u.role === 'administrador'; }).length === 0) {
      return { ok: false, message: 'Debe existir al menos un administrador.' };
    }
    saveUsers(users);
    return { ok: true };
  }

  function submitAccessRequest(user, permission, reason) {
    if (!user) return { ok: false, message: 'Sesión no válida.' };
    if (!can(user.role, 'access.request', user)) {
      return { ok: false, message: 'No puede enviar solicitudes.' };
    }
    if (can(user.role, permission, user)) {
      return { ok: false, message: 'Ya tiene ese permiso.' };
    }
    var perm = permission || 'config.save';
    var list = getAccessRequests();
    var pending = list.find(function (r) {
      return r.userId === user.id && r.permission === perm && r.status === 'pending';
    });
    if (pending) {
      return { ok: false, message: 'Ya tiene una solicitud pendiente para este acceso.' };
    }
    var req = {
      id: uid(),
      userId: user.id,
      username: user.username,
      name: user.name || user.username,
      permission: perm,
      reason: String(reason || '').trim(),
      status: 'pending',
      at: new Date().toISOString(),
      reviewedBy: null,
      reviewedAt: null,
      reviewNote: ''
    };
    list.unshift(req);
    saveAccessRequests(list);
    addLog('solicitud_acceso', perm + ' — ' + user.username, user.username);
    return { ok: true, request: req };
  }

  function reviewAccessRequest(id, approved, reviewer, note) {
    var list = getAccessRequests();
    var idx = list.findIndex(function (r) { return r.id === id; });
    if (idx < 0) return { ok: false, message: 'Solicitud no encontrada.' };
    if (list[idx].status !== 'pending') {
      return { ok: false, message: 'La solicitud ya fue revisada.' };
    }
    list[idx].status = approved ? 'approved' : 'rejected';
    list[idx].reviewedBy = reviewer || 'admin';
    list[idx].reviewedAt = new Date().toISOString();
    list[idx].reviewNote = String(note || '').trim();
    saveAccessRequests(list);

    if (approved) {
      var target = findUserById(list[idx].userId);
      if (target) {
        var extra = target.extraPermissions ? target.extraPermissions.slice() : [];
        if (extra.indexOf(list[idx].permission) < 0) extra.push(list[idx].permission);
        updateUser(target.id, { extraPermissions: extra });
      }
    }
    addLog(
      approved ? 'solicitud_aprobada' : 'solicitud_rechazada',
      list[idx].username + ' → ' + list[idx].permission,
      reviewer || 'admin'
    );
    return { ok: true, request: list[idx] };
  }

  function getPendingRequestsCount() {
    return getAccessRequests().filter(function (r) { return r.status === 'pending'; }).length;
  }

  function createArea(data) {
    var areas = getAreas();
    if (areas.some(function (a) { return a.name.toLowerCase() === data.name.toLowerCase(); })) {
      return { ok: false, message: 'El área ya existe.' };
    }
    var area = { id: uid(), name: data.name.trim(), description: (data.description || '').trim(), active: true };
    areas.push(area);
    saveAreas(areas);
    return { ok: true, area: area };
  }

  function updateArea(id, patch) {
    var areas = getAreas();
    var idx = areas.findIndex(function (a) { return a.id === id; });
    if (idx < 0) return { ok: false };
    Object.assign(areas[idx], patch);
    saveAreas(areas);
    return { ok: true };
  }

  function deleteArea(id) {
    saveAreas(getAreas().filter(function (a) { return a.id !== id; }));
    return { ok: true };
  }

  global.PlatformAdmin = {
    KEYS: KEYS,
    PERMISSIONS: PERMISSIONS,
    ROLE_PERMISSIONS: ROLE_PERMISSIONS,
    ROLE_LABELS: ROLE_LABELS,
    PRIMARY_ADMIN_USERNAME: PRIMARY_ADMIN_USERNAME,
    getUsers: getUsers,
    getPrimaryAdmin: getPrimaryAdmin,
    getStaffUsers: getStaffUsers,
    isPrimaryAdminUser: isPrimaryAdminUser,
    saveUsers: saveUsers,
    getAreas: getAreas,
    saveAreas: saveAreas,
    getLogs: getLogs,
    getAccessRequests: getAccessRequests,
    saveAccessRequests: saveAccessRequests,
    clearLogs: clearLogs,
    addLog: addLog,
    can: can,
    canAccessAdminModal: canAccessAdminModal,
    authenticate: authenticate,
    findUserById: findUserById,
    createUser: createUser,
    updateUser: updateUser,
    deleteUser: deleteUser,
    submitAccessRequest: submitAccessRequest,
    reviewAccessRequest: reviewAccessRequest,
    getPendingRequestsCount: getPendingRequestsCount,
    createArea: createArea,
    updateArea: updateArea,
    deleteArea: deleteArea,
    uid: uid
  };
})(typeof window !== 'undefined' ? window : this);
