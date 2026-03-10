const { verifyToken } = require('../auth/jwt');

/**
 * Helper for Socket.IO or other non-Express use: verify token and return user payload or null.
 * Use in socket middleware/handlers to enforce auth and RBAC (check .role against allowed roles).
 */
function getUserFromToken(token) {
  if (!token) return null;
  try {
    const decoded = verifyToken(token);
    if (decoded.mfaPending) return null;
    return {
      id: decoded.sub,
      role: decoded.role || 'guest',
      mfaEnabled: !!decoded.mfaEnabled,
    };
  } catch {
    return null;
  }
}

/**
 * Auth middleware: extract Bearer token, verify JWT, attach req.user.
 * Use on protected routes. Sends 401 if missing/invalid/expired or if token is MFA-pending only.
 */
function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'Authorization required' });
  }

  let decoded;
  try {
    decoded = verifyToken(token);
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  // MFA-pending tokens are for /auth/mfa/verify only; do not allow access to protected resources
  if (decoded.mfaPending) {
    return res.status(401).json({ error: 'Complete MFA verification first' });
  }

  const sub = decoded.sub;
  const role = decoded.role || 'guest';

  req.user = {
    id: sub,
    role,
    mfaEnabled: !!decoded.mfaEnabled,
  };

  next();
}

module.exports = {
  requireAuth,
  getUserFromToken,
};
