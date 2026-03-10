const express = require('express');
const { User } = require('../models');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.use(requireAuth);

// GET /users/me - current user profile and role
router.get('/me', async (req, res) => {
  try {
    const user = await User.findById(req.user.id)
      .select('-passwordHash -mfaSecret')
      .lean()
      .exec();

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    return res.status(200).json({
      id: user._id.toString(),
      email: user.email,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      role: user.role,
      mfaEnabled: user.mfaEnabled,
      profile: user.profile,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    });
  } catch (err) {
    console.error('GET /users/me error', err);
    return res.status(500).json({ error: 'Failed to fetch user' });
  }
});

// GET /users/search?query=
router.get('/search', async (req, res) => {
  try {
    const { query } = req.query;
    if (!query || typeof query !== 'string' || !query.trim()) {
      return res.status(400).json({ error: 'query is required' });
    }

    const q = query.trim();

    const users = await User.find({
      $or: [
        { email: { $regex: q, $options: 'i' } },
        { displayName: { $regex: q, $options: 'i' } },
      ],
    })
      .select('_id email displayName avatarUrl role')
      .limit(20)
      .lean()
      .exec();

    return res.status(200).json({ users });
  } catch (err) {
    console.error('GET /users/search error', err);
    return res.status(500).json({ error: 'Failed to search users' });
  }
});

module.exports = router;
