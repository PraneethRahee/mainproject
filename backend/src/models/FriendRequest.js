const mongoose = require('mongoose');

const friendRequestSchema = new mongoose.Schema({
  senderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  receiverId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  status: {
    type: String,
    enum: ['pending', 'accepted', 'rejected'],
    default: 'pending',
    index: true,
  },
}, { timestamps: true, versionKey: false });

// Prevent duplicate requests (same pair, either direction)
friendRequestSchema.index(
  { senderId: 1, receiverId: 1 },
  { unique: true, partialFilterExpression: { status: 'pending' } }
);

// Fast lookup: incoming requests
friendRequestSchema.index({ receiverId: 1, status: 1 });
friendRequestSchema.index({ senderId: 1, status: 1 });

const FriendRequest = mongoose.models.FriendRequest || 
  mongoose.model('FriendRequest', friendRequestSchema);

module.exports = { FriendRequest };
