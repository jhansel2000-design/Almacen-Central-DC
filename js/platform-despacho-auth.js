/**
 * Autenticación independiente — Portal Despacho (sesión separada del WMS)
 */
(function (global) {
  'use strict';

  var ROLE_LABELS = {
    preparador: 'Preparador',
    validador: 'Validador'
  };

  var USERS = [
    {
      id: 'd1',
      username: 'preparador',
      name: 'Preparador de pedidos',
      role: 'preparador',
      passwordHash: 'bc94e593460eb3d9601b27509c484088def83c9572f57d7bd3a703c32853b33a',
      active: true
    },
    {
      id: 'd2',
      username: 'validador',
      name: 'Validador de despacho',
      role: 'validador',
      passwordHash: '436fd78d0e9c9b19dcbd24b853b01f06032da2239b9d590424b87549a91c68da',
      active: true
    }
  ];

  function getUsers() {
    return USERS.slice();
  }

  var USER_ALIASES = {
    operador: 'preparador',
    supervisor: 'validador'
  };

  function resolveUsername(username) {
    var key = String(username || '').toLowerCase().trim();
    return USER_ALIASES[key] || key;
  }

  function authenticate(username, passwordHash) {
    var resolved = resolveUsername(username);
    var user = USERS.find(function (u) {
      return u.active && u.username.toLowerCase() === resolved;
    });
    if (!user || user.passwordHash !== passwordHash) return null;
    return {
      id: user.id,
      username: user.username,
      name: user.name,
      role: user.role
    };
  }

  function getUserById(id) {
    var user = USERS.find(function (u) { return u.id === id && u.active; });
    if (!user) return null;
    return {
      id: user.id,
      username: user.username,
      name: user.name,
      role: user.role
    };
  }

  function canValidate(role) {
    return role === 'validador';
  }

  global.PlatformDespachoAuth = {
    ROLE_LABELS: ROLE_LABELS,
    getUsers: getUsers,
    authenticate: authenticate,
    getUserById: getUserById,
    canValidate: canValidate
  };
})(typeof window !== 'undefined' ? window : this);
