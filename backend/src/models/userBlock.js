const mongoose = require('mongoose');

const userBlockSchema = new mongoose.Schema(
  {
    blockerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    blockedId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    reason: {
      type: String,
      default: '',
      trim: true,
    },
  },
  { timestamps: true, versionKey: false },
);

userBlockSchema.index({ blockerId: 1, blockedId: 1 }, { unique: true });

const UserBlock = mongoose.models.UserBlock || mongoose.model('UserBlock', userBlockSchema);

module.exports = {
  UserBlock,
};

