const mongoose = require('mongoose');

const sessionSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    refreshTokenHash: {
      type: String,
      required: true,
      index: true,
    },
    userAgent: {
      type: String,
    },
    ip: {
      type: String,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
    revokedAt: {
      type: Date,
    },
    revokedReason: {
      type: String,
    },
    tokenFamilyId: {
      type: String,
      required: true,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

sessionSchema.index({ user: 1, expiresAt: -1 });
sessionSchema.index({ expiresAt: 1 });

const Session = mongoose.models.Session || mongoose.model('Session', sessionSchema);

module.exports = {
  Session,
};

