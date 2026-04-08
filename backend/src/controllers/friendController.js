const friendService = require('../services/friendService');

exports.sendRequest = async (req, res, next) => {
  try {
    const senderId = req.user.id;
    const { receiverId } = req.body;

    if (!receiverId) {
      return res.status(400).json({ error: 'receiverId is required' });
    }

    const request = await friendService.sendRequest(senderId, receiverId);
    return res.status(201).json({ request });
  } catch (err) {
    next(err);
  }
};

exports.acceptRequest = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { requestId } = req.body;

    if (!requestId) {
      return res.status(400).json({ error: 'requestId is required' });
    }

    const request = await friendService.acceptRequest(requestId, userId);
    return res.json({ request });
  } catch (err) {
    next(err);
  }
};

exports.rejectRequest = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { requestId } = req.body;

    if (!requestId) {
      return res.status(400).json({ error: 'requestId is required' });
    }

    const request = await friendService.rejectRequest(requestId, userId);
    return res.json({ request });
  } catch (err) {
    next(err);
  }
};

exports.listFriends = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const friends = await friendService.listFriends(userId);
    return res.json({ friends });
  } catch (err) {
    next(err);
  }
};

exports.listPendingRequests = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const requests = await friendService.listPendingRequests(userId);
    return res.json({ requests });
  } catch (err) {
    next(err);
  }
};

exports.listSentRequests = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const requests = await friendService.listSentRequests(userId);
    return res.json({ requests });
  } catch (err) {
    next(err);
  }
};
