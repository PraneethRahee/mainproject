const mongoose = require('mongoose');

const FILE_SCAN_STATUS = ['uploaded', 'quarantined', 'scanned_clean', 'scanned_blocked'];

const fileAssetSchema = new mongoose.Schema(
  {
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    storageKey: {
      type: String,
      required: true,
      unique: true,
    },
    hash: {
      type: String,
      required: true,
    },
    mimeType: {
      type: String,
      required: true,
    },
    extension: {
      type: String,
    },
    sizeBytes: {
      type: Number,
      required: true,
    },
    scanStatus: {
      type: String,
      enum: FILE_SCAN_STATUS,
      default: 'uploaded',
      index: true,
    },
    originalName: {
      type: String,
    },
    scannedAt: {
      type: Date,
    },
    cloudinaryPublicId: {
      type: String,
    },
    cloudinaryUrl: {
      type: String,
    },
    cloudinarySecureUrl: {
      type: String,
    },
  },
  {
    timestamps: true,
  }
);

fileAssetSchema.index({ owner: 1, createdAt: -1 });

const FileAsset = mongoose.models.FileAsset || mongoose.model('FileAsset', fileAssetSchema);

module.exports = {
  FileAsset,
  FILE_SCAN_STATUS,
};

