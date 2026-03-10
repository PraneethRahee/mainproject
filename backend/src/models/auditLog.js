const mongoose = require('mongoose');

const AUDIT_RESULTS = ['success', 'failure'];

const auditLogSchema = new mongoose.Schema(
  {
    actor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: false,
      index: true,
    },
    action: {
      type: String,
      required: true,
      index: true,
    },
    targetType: {
      type: String,
      required: true,
    },
    targetId: {
      type: String,
      required: false,
    },
    result: {
      type: String,
      enum: AUDIT_RESULTS,
      required: true,
    },
    ip: {
      type: String,
    },
    userAgent: {
      type: String,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
);

auditLogSchema.index({ actor: 1, createdAt: -1 });
auditLogSchema.index({ targetType: 1, targetId: 1, createdAt: -1 });
auditLogSchema.index({ action: 1, createdAt: -1 });

const AuditLog =
  mongoose.models.AuditLog || mongoose.model('AuditLog', auditLogSchema);

module.exports = {
  AuditLog,
  AUDIT_RESULTS,
};

