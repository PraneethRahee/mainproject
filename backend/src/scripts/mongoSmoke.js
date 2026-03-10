const { connectMongo } = require('../db');
const {
  User,
  Session,
  Channel,
  ChannelMember,
  Message,
  FileAsset,
  AuditLog,
} = require('../models');

async function run() {
  await connectMongo();

  // User
  const user = await User.create({
    email: `smoke-${Date.now()}@example.com`,
    displayName: 'Smoke User',
    role: 'member',
  });

  // Session
  const session = await Session.create({
    user: user._id,
    refreshTokenHash: 'hash',
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    userAgent: 'smoke-test',
  });

  // Channel
  const channel = await Channel.create({
    name: 'smoke-channel',
    description: 'Smoke test channel',
    type: 'group',
    createdBy: user._id,
  });

  // ChannelMember
  const member = await ChannelMember.create({
    channel: channel._id,
    user: user._id,
    isAdmin: true,
  });

  // FileAsset
  const file = await FileAsset.create({
    owner: user._id,
    storageKey: `smoke/${Date.now()}`,
    hash: `hash-${Date.now()}`,
    mimeType: 'application/octet-stream',
    extension: 'bin',
    sizeBytes: 1234,
  });

  // Message
  const message = await Message.create({
    channel: channel._id,
    sender: user._id,
    content: 'Smoke message',
    attachments: [file._id],
  });

  // AuditLog
  const audit = await AuditLog.create({
    actor: user._id,
    action: 'smoke:test',
    targetType: 'message',
    targetId: String(message._id),
    result: 'success',
    metadata: { sessionId: String(session._id) },
  });

  // Simple read/update/delete to exercise CRUD
  await User.findById(user._id);
  await Session.findByIdAndUpdate(session._id, { userAgent: 'smoke-test-updated' });
  await Message.deleteOne({ _id: message._id });

  console.log('Mongo CRUD smoke test completed', {
    user: user._id,
    session: session._id,
    channel: channel._id,
    member: member._id,
    file: file._id,
    audit: audit._id,
  });

  process.exit(0);
}

run().catch((err) => {
  console.error('Mongo CRUD smoke test failed', err);
  process.exit(1);
});

