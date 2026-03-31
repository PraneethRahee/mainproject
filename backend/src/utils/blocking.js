const { UserBlock } = require('../models');

async function getBlockedUserIds(viewerId) {
  const [byMe, byThem] = await Promise.all([
    UserBlock.find({ blockerId: viewerId }).select('blockedId').lean().exec(),
    UserBlock.find({ blockedId: viewerId }).select('blockerId').lean().exec(),
  ]);

  const set = new Set();
  for (const d of byMe) if (d.blockedId) set.add(String(d.blockedId));
  for (const d of byThem) if (d.blockerId) set.add(String(d.blockerId));
  return Array.from(set);
}

async function isBlockedPair(userA, userB) {
  if (!userA || !userB) return false;
  const blocked = await UserBlock.findOne({
    $or: [
      { blockerId: userA, blockedId: userB },
      { blockerId: userB, blockedId: userA },
    ],
  })
    .select('_id')
    .lean()
    .exec();

  return Boolean(blocked);
}

module.exports = {
  getBlockedUserIds,
  isBlockedPair,
};

