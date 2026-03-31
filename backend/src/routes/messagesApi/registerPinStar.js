const mongoose = require('mongoose');
const { ChatMessage, GroupMessage } = require('../../models');
const { requirePinPermission } = require('./helpers');

module.exports = function registerMessagePinStarRoutes(router) {
// POST /messages/:messageId/pin
router.post('/messages/:messageId/pin', async (req, res) => {
  try {
    const userId = req.user.id;
    const messageId = req.params.messageId;
    if (!mongoose.Types.ObjectId.isValid(messageId)) {
      return res.status(400).json({ error: 'Invalid messageId' });
    }

    const [dm, group] = await Promise.all([
      ChatMessage.findById(messageId).select('_id conversationId deleted deletedFor').lean().exec(),
      GroupMessage.findById(messageId).select('_id groupId deleted').lean().exec(),
    ]);
    const target = dm || group;
    if (!target) return res.status(404).json({ error: 'Message not found' });
    const channelType = dm ? 'dm' : 'group';
    const conversationId = dm ? String(dm.conversationId) : String(group.groupId);
    if (dm && (dm.deleted || (dm.deletedFor || []).map(String).includes(String(userId)))) {
      return res.status(404).json({ error: 'Message not found' });
    }
    if (group && group.deleted) {
      return res.status(404).json({ error: 'Message not found' });
    }

    const allowed = await requirePinPermission({ conversationId, userId, channelType });
    if (!allowed) {
      return res.status(403).json({ error: channelType === 'group' ? 'Only group admins can pin messages' : 'Not allowed to pin this message' });
    }

    if (dm) await ChatMessage.updateOne({ _id: dm._id }, { $set: { isPinned: true } }).exec();
    if (group) await GroupMessage.updateOne({ _id: group._id }, { $set: { isPinned: true } }).exec();
    return res.status(200).json({ ok: true, messageId, isPinned: true });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to pin message' });
  }
});

router.post('/messages/:messageId/unpin', async (req, res) => {
  try {
    const userId = req.user.id;
    const messageId = req.params.messageId;
    if (!mongoose.Types.ObjectId.isValid(messageId)) {
      return res.status(400).json({ error: 'Invalid messageId' });
    }
    const [dm, group] = await Promise.all([
      ChatMessage.findById(messageId).select('_id conversationId deleted deletedFor').lean().exec(),
      GroupMessage.findById(messageId).select('_id groupId deleted').lean().exec(),
    ]);
    const target = dm || group;
    if (!target) return res.status(404).json({ error: 'Message not found' });
    const channelType = dm ? 'dm' : 'group';
    const conversationId = dm ? String(dm.conversationId) : String(group.groupId);
    const allowed = await requirePinPermission({ conversationId, userId, channelType });
    if (!allowed) {
      return res.status(403).json({ error: channelType === 'group' ? 'Only group admins can unpin messages' : 'Not allowed to unpin this message' });
    }
    if (dm) await ChatMessage.updateOne({ _id: dm._id }, { $set: { isPinned: false } }).exec();
    if (group) await GroupMessage.updateOne({ _id: group._id }, { $set: { isPinned: false } }).exec();
    return res.status(200).json({ ok: true, messageId, isPinned: false });
  } catch {
    return res.status(500).json({ error: 'Failed to unpin message' });
  }
});

router.post('/messages/:messageId/star', async (req, res) => {
  try {
    const userId = req.user.id;
    const messageId = req.params.messageId;
    if (!mongoose.Types.ObjectId.isValid(messageId)) {
      return res.status(400).json({ error: 'Invalid messageId' });
    }
    const [dm, group] = await Promise.all([
      ChatMessage.findById(messageId).select('_id conversationId deleted deletedFor').lean().exec(),
      GroupMessage.findById(messageId).select('_id groupId deleted').lean().exec(),
    ]);
    if (!dm && !group) return res.status(404).json({ error: 'Message not found' });
    const conversationId = dm ? String(dm.conversationId) : String(group.groupId);
    const membership = await ChannelMember.findOne({ channel: conversationId, user: userId }).select('_id').lean().exec();
    if (!membership) return res.status(403).json({ error: 'Not a member of this conversation' });
    if (dm) await ChatMessage.updateOne({ _id: dm._id }, { $addToSet: { isStarredBy: userId } }).exec();
    if (group) await GroupMessage.updateOne({ _id: group._id }, { $addToSet: { isStarredBy: userId } }).exec();
    return res.status(200).json({ ok: true, messageId, isStarred: true });
  } catch {
    return res.status(500).json({ error: 'Failed to star message' });
  }
});

router.post('/messages/:messageId/unstar', async (req, res) => {
  try {
    const userId = req.user.id;
    const messageId = req.params.messageId;
    if (!mongoose.Types.ObjectId.isValid(messageId)) {
      return res.status(400).json({ error: 'Invalid messageId' });
    }
    const [dm, group] = await Promise.all([
      ChatMessage.findById(messageId).select('_id conversationId').lean().exec(),
      GroupMessage.findById(messageId).select('_id groupId').lean().exec(),
    ]);
    if (!dm && !group) return res.status(404).json({ error: 'Message not found' });
    if (dm) await ChatMessage.updateOne({ _id: dm._id }, { $pull: { isStarredBy: userId } }).exec();
    if (group) await GroupMessage.updateOne({ _id: group._id }, { $pull: { isStarredBy: userId } }).exec();
    return res.status(200).json({ ok: true, messageId, isStarred: false });
  } catch {
    return res.status(500).json({ error: 'Failed to unstar message' });
  }
});
};
