const VALID_ROLES = ['admin', 'member', 'guest'];

/**
 * RBAC middleware: require request to have req.user.role in allowed roles.
 * Must be used after requireAuth. Sends 403 Forbidden if role not allowed.
 *
 * @param {string|string[]} allowedRoles - e.g. 'admin' or ['admin', 'member']
 */
function requireRole(allowedRoles) {
  const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];

  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const userRole = req.user.role;
    if (!VALID_ROLES.includes(userRole)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    if (!roles.includes(userRole)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    next();
  };
}

module.exports = {
  requireRole,
  VALID_ROLES,
};

