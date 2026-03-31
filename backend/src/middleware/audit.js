const { AuditLog } = require('../models');

async function writeAuditLog({
  actorId,
  action,
  targetType,
  targetId,
  result,
  ip,
  userAgent,
  metadata,
}) {
  try {
    await AuditLog.create({
      actor: actorId || null,
      action,
      targetType,
      targetId: targetId || null,
      result,
      ip: ip || null,
      userAgent: userAgent || null,
      metadata: metadata || {},
    });
  } catch (err) {
    // Audit failures must not break main flows
    console.error('Failed to write audit log', err);
  }
}

function getRequestClientInfo(req) {
  return {
    ip: req.ip || req.headers['x-forwarded-for'] || null,
    userAgent: req.get('user-agent') || '',
  };
}

module.exports = {
  writeAuditLog,
  getRequestClientInfo,
};

