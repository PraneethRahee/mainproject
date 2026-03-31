const mongoose = require('mongoose');

const e2eVerificationSchema = new mongoose.Schema(
  {
    verifierUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    verifiedUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    deviceId: {
      type: String,
      default: 'web:1',
      index: true,
    },
    safetyCodeHash: {
      type: String,
      required: true,
      index: true,
    },
    verifiedAt: {
      type: Date,
      default: Date.now,
      required: true,
      index: true,
    },
  },
  { timestamps: false, versionKey: false },
);

e2eVerificationSchema.index({ verifierUserId: 1, verifiedUserId: 1, deviceId: 1 }, { unique: true });

const UserE2EVerification =
  mongoose.models.UserE2EVerification || mongoose.model('UserE2EVerification', e2eVerificationSchema);

module.exports = {
  UserE2EVerification,
};

