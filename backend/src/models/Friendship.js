const mongoose = require('mongoose');

const friendshipSchema = new mongoose.Schema({
  userId1: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  userId2: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
}, { timestamps: true, versionKey: false });

// Unique friendship per pair (userId1 < userId2 always)
friendshipSchema.index({ userId1: 1, userId2: 1 }, { unique: true });
friendshipSchema.index({ userId1: 1 });
friendshipSchema.index({ userId2: 1 });

/**
 * Normalize ordering: userId1 < userId2 always
 */
friendshipSchema.statics.normalize = function(idA, idB) {
  const a = String(idA);
  const b = String(idB);
  return a < b ? { userId1: a, userId2: b } : { userId1: b, userId2: a };
};

const Friendship = mongoose.models.Friendship || 
  mongoose.model('Friendship', friendshipSchema);

module.exports = { Friendship };
