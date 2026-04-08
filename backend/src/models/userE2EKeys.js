const mongoose = require('mongoose');

const oneTimePreKeySchema = new mongoose.Schema(
  {
    keyId: { type: Number, required: true },
    publicKey: { type: String, required: true, trim: true },
    claimedAt: { type: Date, default: null, index: true },
  },
  { _id: false, versionKey: false },
);

// Public-only key bundle for Signal-style session setup.
// Private keys MUST remain on the client.
const userE2EKeysSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true,
    },
    deviceId: {
      // Single-device for now; keep field for future multi-device.
      type: String,
      default: 'web:1',
      trim: true,
      index: true,
    },
    identityKeyPublic: { type: String, required: true, trim: true },
    signedPreKeyId: { type: Number, required: true },
    signedPreKeyPublic: { type: String, required: true, trim: true },
    signedPreKeySignature: { type: String, required: true, trim: true },
    oneTimePreKeys: { type: [oneTimePreKeySchema], default: [] },
    // Encrypted private key bundle for cross-browser restore (encrypted client-side with user PIN).
    keyBackupBundle: { type: String, default: null },
  },
  { timestamps: true, versionKey: false },
);

userE2EKeysSchema.index({ userId: 1 }, { unique: true });
userE2EKeysSchema.index({ userId: 1, deviceId: 1 }, { unique: true });

const UserE2EKeys =
  mongoose.models.UserE2EKeys || mongoose.model('UserE2EKeys', userE2EKeysSchema);

module.exports = {
  UserE2EKeys,
};

