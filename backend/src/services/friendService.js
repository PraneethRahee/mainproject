const { FriendRequest } = require('../models/FriendRequest');
const { Friendship } = require('../models/Friendship');
const { UserBlock } = require('../models/UserBlock');
const { Conversation } = require('../models/Conversation');
const { Channel } = require('../models/Channel');
const { ChannelMember } = require('../models/ChannelMember');
const mongoose = require('mongoose');

class FriendService {
  /**
   * Send a friend request.
   */
  async sendRequest(senderId, receiverId) {
    // Guard: no self-request
    if (senderId.toString() === receiverId.toString()) {
      const err = new Error('Cannot send a friend request to yourself');
      err.status = 400;
      throw err;
    }

    // Guard: no blocking relationship
    const blockExists = await UserBlock.findOne({
      $or: [
        { blockerId: senderId, blockedId: receiverId },
        { blockerId: receiverId, blockedId: senderId },
      ],
    }).lean().exec();
    if (blockExists) {
      const err = new Error('Cannot send request to a blocked user');
      err.status = 403;
      throw err;
    }

    // Guard: no existing friendship
    const { userId1, userId2 } = Friendship.normalize(senderId, receiverId);
    const existingFriendship = await Friendship.findOne({ userId1, userId2 }).lean().exec();
    if (existingFriendship) {
      const err = new Error('Already friends with this user');
      err.status = 409;
      throw err;
    }

    // Guard: no pending or accepted request in either direction
    const existingRequest = await FriendRequest.findOne({
      $or: [
        { senderId, receiverId },
        { senderId: receiverId, receiverId: senderId },
      ],
      status: { $in: ['pending', 'accepted'] },
    }).lean().exec();
    if (existingRequest) {
      const err = new Error('A pending or accepted request already exists between these users');
      err.status = 409;
      throw err;
    }

    const request = await FriendRequest.create({ senderId, receiverId, status: 'pending' });
    return request;
  }

  /**
   * Accept a friend request.
   * Creates Friendship + ensures DM conversation exists.
   */
  async acceptRequest(requestId, userId) {
    const request = await FriendRequest.findById(requestId);
    if (!request) {
      const err = new Error('Request not found');
      err.status = 404;
      throw err;
    }

    // Guard: only receiver can accept
    if (request.receiverId.toString() !== userId.toString()) {
      const err = new Error('Not authorized to accept this request');
      err.status = 403;
      throw err;
    }

    if (request.status !== 'pending') {
      const err = new Error('Request already processed');
      err.status = 400;
      throw err;
    }

    // Update request status
    request.status = 'accepted';
    await request.save();

    // Create friendship
    const { userId1, userId2 } = Friendship.normalize(request.senderId, request.receiverId);
    await Friendship.findOneAndUpdate(
      { userId1, userId2 },
      { userId1, userId2 },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    // Ensure DM conversation exists (reuse existing /conversations/dm logic)
    const participantsHash = `${userId1}:${userId2}`;
    let conversation = await Conversation.findOne({ kind: 'dm', participantsHash });
    
    if (!conversation) {
      // Create DM channel
      const channel = await Channel.create({
        name: 'dm',
        description: '',
        type: 'dm',
        createdBy: request.senderId,
        metadata: {},
      });

      await ChannelMember.create({
        channel: channel._id,
        user: userId1,
        isAdmin: false,
        canPost: true,
        canManageMembers: false,
      });

      await ChannelMember.create({
        channel: channel._id,
        user: userId2,
        isAdmin: false,
        canPost: true,
        canManageMembers: false,
      });

      // Create Conversation record
      conversation = await Conversation.create({
        kind: 'dm',
        channel: channel._id,
        participants: [userId1, userId2],
        participantsHash,
        createdBy: request.senderId,
      });
    }

    return request;
  }

  /**
   * Reject a friend request.
   */
  async rejectRequest(requestId, userId) {
    const request = await FriendRequest.findById(requestId);
    if (!request) {
      const err = new Error('Request not found');
      err.status = 404;
      throw err;
    }

    if (request.receiverId.toString() !== userId.toString()) {
      const err = new Error('Not authorized to reject this request');
      err.status = 403;
      throw err;
    }

    if (request.status !== 'pending') {
      const err = new Error('Request already processed');
      err.status = 400;
      throw err;
    }

    request.status = 'rejected';
    await request.save();

    return request;
  }

  /**
   * List all friends of a user.
   */
  async listFriends(userId) {
    const friendships = await Friendship.find({
      $or: [{ userId1: userId }, { userId2: userId }],
    }).lean().exec();

    const friendIds = friendships.map((f) =>
      f.userId1.toString() === userId.toString() ? f.userId2 : f.userId1
    );

    // Populate user details for each friend.
    const User = mongoose.model('User');
    const users = await User.find({ _id: { $in: friendIds } })
      .select('_id displayName email')
      .lean()
      .exec();

    return users.map((u) => ({
      id: String(u._id),
      name: u.displayName || u.email || String(u._id),
      email: u.email || '',
    }));
  }

  /**
   * List incoming pending requests.
   */
  async listPendingRequests(userId) {
    return FriendRequest.find({ receiverId: userId, status: 'pending' })
      .populate('senderId', 'displayName email')
      .sort({ createdAt: -1 })
      .lean()
      .exec();
  }

  /**
   * List sent requests.
   */
  async listSentRequests(userId) {
    return FriendRequest.find({ senderId: userId, status: 'pending' })
      .populate('receiverId', 'displayName email')
      .sort({ createdAt: -1 })
      .lean()
      .exec();
  }
}

module.exports = new FriendService();
