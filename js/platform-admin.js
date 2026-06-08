/**
 * Administración: usuarios, áreas, permisos, logs
 */
(function (global) {
  'use strict';

  var KEYS = {
    users: 'almacen_users',
    areas: 'almacen_areas',
    logs: 'almacen_logs'
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
    'admin.panel': 'Panel administración',
    'export.data': 'Exportar datos',
    'despacho.use': 'Módulo Despacho (preparador)',
    'despacho.validate': 'Validador de despacho'
  };

  var ROLE_PERMISSIONS = {
    administrador: Object.keys(PERMISSIONS),
    supervisor: ['dashboard.view', 'filter.apply', 'data.import', 'export.data', 'logs.view', 'ai.use', 'tv.mode', 'admin.panel', 'config.save', 'despacho.use', 'despacho.validate'],
    operador: ['dashboard.view', 'tv.mode', 'despacho.use']
  };

  var ROLE_LABELS = {
    administrador: 'Administrador',
    supervisor: 'Supervisor',
    operador: 'Operador'
  };

  var DEFAULT_USERS = [
    { id: 'u1', username: 'admin', name: 'Administrador', role: 'administrador', passwordHash: '449e3a3f84a49db5dffa682fc37613d6916da3a74dfe43c071bbdb9d2113e4bf', areas: [], active: true },
    { id: 'u2', username: 'supervisor', name: 'Supervisor', role: 'supervisor', passwordHash: '436fd78d0e9c9b19dcbd24b853b01f06032da2239b9d590424b87549a91c68da', areas: [], active: true },
    { id: 'u3', username: 'operador', name: 'Operador', role: 'operador', passwordHash: 'bc94e593460eb3d9601b27509c484088def83c9572f57d7bd3a703c32853b33a', areas: [], active: true }
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

  function getUsers() {
    if (!global.localStorage) return DEFAULT_USERS.slice();
    var list = parse(localStorage.getItem(KEYS.users), null);
    if (!list || !list.length) {
      saveUsers(DEFAULT_USERS);
      return DEFAULT_USERS.slice();
    }
    return list;
  }

  function saveUsers(users) {
    if (global.localStorage) localStorage.setItem(KEYS.users, JSON.stringify(users));
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

  function can(role, permission) {
    var perms = ROLE_PERMISSIONS[role] || [];
    return perms.indexOf(permission) >= 0;
  }

  function authenticate(username, passwordHash) {
    var user = getUsers().find(function (u) {
      return u.active && u.username.toLowerCase() === String(username).toLowerCase().trim();
    });
    if (!user || user.passwordHash !== passwordHash) return null;
    return user;
  }

  function createUser(data) {
    var users = getUsers();
    if (users.some(function (u) { return u.username.toLowerCase() === data.username.toLowerCase(); })) {
      return { ok: false, message: 'El usuario ya existe.' };
    }
    var user = {
      id: uid(),
      username: data.username.trim(),
      name: data.name.trim() || data.username,
      role: data.role,
      passwordHash: data.passwordHash,
      areas: data.areas || [],
      active: true
    };
    users.push(user);
    saveUsers(users);
    return { ok: true, user: user };
  }

  function updateUser(id, patch) {
    var users = getUsers();
    var idx = users.findIndex(function (u) { return u.id === id; });
    if (idx < 0) return { ok: false, message: 'Usuario no encontrado.' };
    if (patch.username && users.some(function (u, i) { return i !== idx && u.username.toLowerCase() === patch.username.toLowerCase(); })) {
      return { ok: false, message: 'Nombre de usuario en uso.' };
    }
    Object.assign(users[idx], patch);
    saveUsers(users);
    return { ok: true, user: users[idx] };
  }

  function deleteUser(id) {
    var users = getUsers().filter(function (u) { return u.id !== id; });
    if (users.length === getUsers().length) return { ok: false };
    if (users.filter(function (u) { return u.role === 'administrador'; }).length === 0) {
      return { ok: false, message: 'Debe existir al menos un administrador.' };
    }
    saveUsers(users);
    return { ok: true };
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
    getUsers: getUsers,
    saveUsers: saveUsers,
    getAreas: getAreas,
    saveAreas: saveAreas,
    getLogs: getLogs,
    clearLogs: clearLogs,
    addLog: addLog,
    can: can,
    authenticate: authenticate,
    createUser: createUser,
    updateUser: updateUser,
    deleteUser: deleteUser,
    createArea: createArea,
    updateArea: updateArea,
    deleteArea: deleteArea,
    uid: uid
  };
})(typeof window !== 'undefined' ? window : this);
