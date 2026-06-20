/**
 * Autenticación — Control Patio · Recepción de contenedores
 */
(function (global) {
  'use strict';

  var ROLE_LABELS = {
    registrador: 'Registro patio',
    validador: 'Validación y entrada'
  };

  var LEGACY_USERS = [
    {
      id: 'r1',
      username: 'recepcion',
      name: 'Coordinador recepción',
      role: 'registrador',
      passwordHash: 'bc94e593460eb3d9601b27509c484088def83c9572f57d7bd3a703c32853b33a',
      active: true
    },
    {
      id: 'r2',
      username: 'validador.rec',
      name: 'Validador recepción',
      role: 'validador',
      passwordHash: '436fd78d0e9c9b19dcbd24b853b01f06032da2239b9d590424b87549a91c68da',
      active: true
    }
  ];

  function getDisplayName(user) {
    if (!user) return '';
    return String(user.name || user.username || '').trim();
  }

  function getRoleLabel(user) {
    if (!user) return '';
    return ROLE_LABELS[user.role] || user.role;
  }

  function mapWmsToRecepcionRole(wmsUser, preferredArea) {
    if (!global.PlatformAdmin) return null;
    if (!global.PlatformAdmin.can(wmsUser.role, 'recepcion.use', wmsUser)) return null;
    if (preferredArea === 'validador' &&
        global.PlatformAdmin.can(wmsUser.role, 'recepcion.validate', wmsUser)) {
      return 'validador';
    }
    if (preferredArea === 'registrador') return 'registrador';
    if (global.PlatformAdmin.can(wmsUser.role, 'recepcion.validate', wmsUser)) return 'validador';
    return 'registrador';
  }

  function sessionFromWmsUser(wmsUser, preferredArea) {
    var role = mapWmsToRecepcionRole(wmsUser, preferredArea);
    if (!role) return null;
    return {
      id: wmsUser.id,
      username: wmsUser.username,
      name: getDisplayName(wmsUser),
      role: role,
      registeredRole: wmsUser.role,
      isPrimaryAdmin: wmsUser.isPrimaryAdmin
    };
  }

  function authenticateWms(username, passwordHash, preferredArea) {
    if (!global.PlatformAdmin) return null;
    var wmsUser = global.PlatformAdmin.authenticate(username, passwordHash);
    if (!wmsUser) return null;
    return sessionFromWmsUser(wmsUser, preferredArea);
  }

  function authenticateLegacy(username, passwordHash, preferredArea) {
    var u = resolveUsername(username);
    var i;
    for (i = 0; i < LEGACY_USERS.length; i++) {
      var leg = LEGACY_USERS[i];
      if (resolveUsername(leg.username) !== u) continue;
      if (leg.passwordHash !== passwordHash || leg.active === false) return null;
      if (preferredArea === 'validador' && leg.role !== 'validador') return null;
      if (preferredArea === 'registrador' && leg.role !== 'registrador') return null;
      return {
        id: leg.id,
        username: leg.username,
        name: leg.name,
        role: leg.role,
        registeredRole: leg.role,
        isPrimaryAdmin: false
      };
    }
    return null;
  }

  function resolveUsername(username) {
    return String(username || '').toLowerCase().trim();
  }

  function authenticate(username, passwordHash, preferredArea) {
    preferredArea = preferredArea === 'validador' ? 'validador' : 'registrador';
    return authenticateWms(username, passwordHash, preferredArea) ||
      authenticateLegacy(username, passwordHash, preferredArea);
  }

  function canValidate(user) {
    return user && user.role === 'validador';
  }

  function canRegister(user) {
    return user && user.role === 'registrador';
  }

  global.PlatformRecepcionAuth = {
    ROLE_LABELS: ROLE_LABELS,
    authenticate: authenticate,
    getDisplayName: getDisplayName,
    getRoleLabel: getRoleLabel,
    canValidate: canValidate,
    canRegister: canRegister
  };
})(typeof window !== 'undefined' ? window : this);
