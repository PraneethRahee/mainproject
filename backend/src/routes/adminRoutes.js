const express = require('express');
const { AuditLog } = require('../models');
const { requireAuth } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const { writeAuditLog, getRequestClientInfo } = require('../middleware/audit');

const router = express.Router();

// All admin routes require authentication and admin role
router.use(requireAuth);
router.use(requireRole('admin'));

// GET /admin/audit-logs - admin only
router.get('/audit-logs', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 100);
    const skip = parseInt(req.query.skip, 10) || 0;

    const logs = await AuditLog.find()
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean()
      .exec();

    const total = await AuditLog.countDocuments();

    const { ip, userAgent } = getRequestClientInfo(req);
    await writeAuditLog({
      actorId: req.user.id,
      action: 'admin.audit_logs.view',
      targetType: 'admin',
      targetId: null,
      result: 'success',
      ip,
      userAgent,
      metadata: { limit, skip },
    });

    return res.status(200).json({
      logs,
      total,
      limit,
      skip,
    });
  } catch (err) {
    console.error('Audit logs error', err);
    return res.status(500).json({ error: 'Failed to fetch audit logs' });
  }
});

module.exports = router;
