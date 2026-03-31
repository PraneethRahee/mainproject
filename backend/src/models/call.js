const mongoose = require('mongoose');

const CALL_TYPES = ['audio', 'video'];
const CALL_STATUSES = ['ringing', 'connecting', 'in-call', 'missed', 'ended'];

const callSchema = new mongoose.Schema(
  {
    callerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    calleeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    conversationId: {
      // For DM calls this matches the private conversation/channel.
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Channel',
      index: true,
      default: null,
    },

    callType: {
      type: String,
      enum: CALL_TYPES,
      required: true,
      index: true,
    },

    status: {
      type: String,
      enum: CALL_STATUSES,
      default: 'ringing',
      index: true,
    },

    // For WebRTC we store offer/answer/ICE in-memory normally; for now keep generic metadata only.
    offer: {
      // Store caller's SDP offer so a callee that was offline can still establish the call
      // when they reconnect.
      // Expected shape: RTCSessionDescriptionInit (or similar).
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },

    endedReason: {
      type: String,
      default: null,
    },

    startedAt: {
      type: Date,
      default: null,
    },

    endedAt: {
      type: Date,
      default: null,
    },

    endedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  { timestamps: true, versionKey: false },
);

callSchema.index({ callerId: 1, calleeId: 1, createdAt: -1 });

const Call = mongoose.models.Call || mongoose.model('Call', callSchema);

module.exports = {
  Call,
  CALL_TYPES,
  CALL_STATUSES,
};

