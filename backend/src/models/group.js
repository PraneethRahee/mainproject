const mongoose = require('mongoose');

const groupSchema = new mongoose.Schema(
  {
    groupName: {
      type: String,
      required: true,
      trim: true,
    },
    members: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true,
      },
    ],
    admins: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true,
      },
    ],
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

groupSchema.index({ members: 1 });
groupSchema.index({ admins: 1 });

const Group = mongoose.models.Group || mongoose.model('Group', groupSchema);

module.exports = {
  Group,
};

