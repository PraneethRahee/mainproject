const express = require('express');
const mongoose = require('mongoose');
const crypto = require('crypto');
const { UserE2EKeys, User, UserE2EVerification } = require('../models');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

function asTrimmedString(v, max = 8192) {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  if (!s) return null;
  return s.length > max ? s.slice(0, max) : s;
}

function asInt(v) {
  const n = typeof v === 'number' ? v : parseInt(String(v), 10);
  return Number.isFinite(n) ? n : null;
}

function computeSafetyCode(identityKeyPublic) {
  const hash = crypto.createHash('sha256').update(String(identityKeyPublic)).digest();
  // 8 digits, stable between peers.
  const digits = Array.from(hash.slice(0, 8)).map((b) => String(b % 10)).join('');
  return `${digits.slice(0, 4)} ${digits.slice(4, 8)}`;
}

function safetyCodeHash(identityKeyPublic) {
  return crypto.createHash('sha256').update(String(identityKeyPublic)).digest('hex');
}

// PUT /e2e/keys
// Publish/rotate public Signal-style bundle (public keys only).
router.put('/keys', async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      deviceId,
      identityKeyPublic,
      signedPreKeyId,
      signedPreKeyPublic,
      signedPreKeySignature,
      oneTimePreKeys,
    } = req.body || {};

    const cleanDeviceId = asTrimmedString(deviceId, 64) || 'web:1';
    const ik = asTrimmedString(identityKeyPublic);
    const spkId = asInt(signedPreKeyId);
    const spk = asTrimmedString(signedPreKeyPublic);
    const spkSig = asTrimmedString(signedPreKeySignature);

    if (!ik || spkId === null || !spk || !spkSig) {
      return res.status(400).json({ error: 'identityKeyPublic, signedPreKeyId, signedPreKeyPublic, signedPreKeySignature are required' });
    }

    const prekeys = Array.isArray(oneTimePreKeys) ? oneTimePreKeys : [];
    const normalizedPrekeys = prekeys
      .map((pk) => ({
        keyId: asInt(pk && pk.keyId),
        publicKey: asTrimmedString(pk && pk.publicKey),
      }))
      .filter((pk) => pk.keyId !== null && pk.publicKey);

    // de-duplicate by keyId
    const seen = new Set();
    const deduped = [];
    for (const pk of normalizedPrekeys) {
      if (seen.has(pk.keyId)) continue;
      seen.add(pk.keyId);
      deduped.push({ ...pk, claimedAt: null });
    }

    await UserE2EKeys.updateOne(
      { userId, deviceId: cleanDeviceId },
      {
        $set: {
          userId,
          deviceId: cleanDeviceId,
          identityKeyPublic: ik,
          signedPreKeyId: spkId,
          signedPreKeyPublic: spk,
          signedPreKeySignature: spkSig,
        },
        ...(deduped.length > 0 ? { $push: { oneTimePreKeys: { $each: deduped } } } : {}),
      },
      { upsert: true },
    ).exec();

    return res.status(200).json({ ok: true });
  } catch (err) {
    // Likely duplicate keyId insert; client can retry with fresh batch.
    if (err && err.code === 11000) {
      return res.status(409).json({ error: 'Duplicate key id' });
    }
    console.error('PUT /e2e/keys error', err);
    return res.status(500).json({ error: 'Failed to publish keys' });
  }
});

// POST /e2e/keys/prekeys
// Refill one-time prekeys only.
router.post('/keys/prekeys', async (req, res) => {
  try {
    const userId = req.user.id;
    const { deviceId, oneTimePreKeys } = req.body || {};
    const cleanDeviceId = asTrimmedString(deviceId, 64) || 'web:1';

    const prekeys = Array.isArray(oneTimePreKeys) ? oneTimePreKeys : [];
    const normalizedPrekeys = prekeys
      .map((pk) => ({
        keyId: asInt(pk && pk.keyId),
        publicKey: asTrimmedString(pk && pk.publicKey),
      }))
      .filter((pk) => pk.keyId !== null && pk.publicKey);

    if (normalizedPrekeys.length === 0) {
      return res.status(400).json({ error: 'oneTimePreKeys is required' });
    }

    const seen = new Set();
    const deduped = [];
    for (const pk of normalizedPrekeys) {
      if (seen.has(pk.keyId)) continue;
      seen.add(pk.keyId);
      deduped.push({ ...pk, claimedAt: null });
    }

    const update = await UserE2EKeys.updateOne(
      { userId, deviceId: cleanDeviceId },
      { $push: { oneTimePreKeys: { $each: deduped } } },
      { upsert: true },
    ).exec();

    return res.status(200).json({ ok: true, modified: update.modifiedCount ?? update.nModified ?? 0 });
  } catch (err) {
    if (err && err.code === 11000) {
      return res.status(409).json({ error: 'Duplicate key id' });
    }
    console.error('POST /e2e/keys/prekeys error', err);
    return res.status(500).json({ error: 'Failed to add prekeys' });
  }
});

// GET /e2e/keys/:userId
// Fetch recipient bundle and atomically claim one available one-time prekey.
router.get('/keys/:userId', async (req, res) => {
  try {
    const targetUserId = req.params.userId;
    const deviceId = asTrimmedString(req.query.deviceId, 64) || 'web:1';

    if (!mongoose.Types.ObjectId.isValid(targetUserId)) {
      return res.status(400).json({ error: 'Invalid userId' });
    }

    const user = await User.findById(targetUserId).select('_id').lean().exec();
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Atomically pick one unclaimed prekey and mark claimedAt.
    const now = new Date();
    const doc = await UserE2EKeys.findOneAndUpdate(
      { userId: targetUserId, deviceId, 'oneTimePreKeys.claimedAt': null },
      { $set: { 'oneTimePreKeys.$.claimedAt': now } },
      { new: true, projection: { userId: 1, deviceId: 1, identityKeyPublic: 1, signedPreKeyId: 1, signedPreKeyPublic: 1, signedPreKeySignature: 1, oneTimePreKeys: 1 } },
    )
      .lean()
      .exec();

    if (!doc) {
      // Still return the long-lived + signed prekey even if no one-time prekey is available.
      const fallback = await UserE2EKeys.findOne({ userId: targetUserId, deviceId })
        .select('userId deviceId identityKeyPublic signedPreKeyId signedPreKeyPublic signedPreKeySignature')
        .lean()
        .exec();
      if (!fallback) return res.status(404).json({ error: 'Keys not published for this user' });

      return res.status(200).json({
        userId: String(fallback.userId),
        deviceId: fallback.deviceId,
        identityKeyPublic: fallback.identityKeyPublic,
        signedPreKey: {
          keyId: fallback.signedPreKeyId,
          publicKey: fallback.signedPreKeyPublic,
          signature: fallback.signedPreKeySignature,
        },
        oneTimePreKey: null,
      });
    }

    const claimed = (doc.oneTimePreKeys || []).find((pk) => pk && pk.claimedAt && pk.claimedAt.getTime() === now.getTime());
    // If multiple updates happened in the same millisecond, fall back to any claimedAt==now.
    const claimedKey = claimed || (doc.oneTimePreKeys || []).find((pk) => pk && pk.claimedAt && +pk.claimedAt === +now) || null;

    return res.status(200).json({
      userId: String(doc.userId),
      deviceId: doc.deviceId,
      identityKeyPublic: doc.identityKeyPublic,
      signedPreKey: {
        keyId: doc.signedPreKeyId,
        publicKey: doc.signedPreKeyPublic,
        signature: doc.signedPreKeySignature,
      },
      oneTimePreKey: claimedKey
        ? {
            keyId: claimedKey.keyId,
            publicKey: claimedKey.publicKey,
          }
        : null,
    });
  } catch (err) {
    console.error('GET /e2e/keys/:userId error', err);
    return res.status(500).json({ error: 'Failed to fetch keys' });
  }
});

// GET /e2e/verification/:otherUserId?deviceId=web:1
// Returns the peer safety code and whether the current user has marked them as verified.
router.get('/verification/:otherUserId', async (req, res) => {
  try {
    const meId = req.user.id;
    const otherUserId = req.params.otherUserId;
    const deviceId = asTrimmedString(req.query.deviceId, 64) || 'web:1';

    if (!mongoose.Types.ObjectId.isValid(otherUserId)) return res.status(400).json({ error: 'Invalid otherUserId' });

    const [meKeys, otherKeys] = await Promise.all([
      UserE2EKeys.findOne({ userId: meId, deviceId }).lean().exec(),
      UserE2EKeys.findOne({ userId: otherUserId, deviceId }).lean().exec(),
    ]);

    if (!meKeys || !otherKeys) return res.status(404).json({ error: 'E2E keys not published yet' });

    const safetyCodeMe = computeSafetyCode(meKeys.identityKeyPublic);
    const safetyCodeOther = computeSafetyCode(otherKeys.identityKeyPublic);

    const expectedOtherHash = safetyCodeHash(otherKeys.identityKeyPublic);
    const verification = await UserE2EVerification.findOne({
      verifierUserId: meId,
      verifiedUserId: otherUserId,
      deviceId,
      safetyCodeHash: expectedOtherHash,
    })
      .lean()
      .exec();

    return res.status(200).json({
      ok: true,
      otherUserId: String(otherUserId),
      deviceId,
      safetyCodeMe,
      safetyCodeOther,
      verified: Boolean(verification),
      verifiedAt: verification?.verifiedAt || null,
    });
  } catch (err) {
    console.error('GET /e2e/verification error', err);
    return res.status(500).json({ error: 'Failed to load verification state' });
  }
});

// POST /e2e/verification/:otherUserId
// Body: { code, deviceId? }
router.post('/verification/:otherUserId', async (req, res) => {
  try {
    const meId = req.user.id;
    const otherUserId = req.params.otherUserId;
    const deviceId = asTrimmedString(req.body?.deviceId, 64) || 'web:1';
    const code = asTrimmedString(req.body?.code, 32);

    if (!mongoose.Types.ObjectId.isValid(otherUserId)) return res.status(400).json({ error: 'Invalid otherUserId' });
    if (!code) return res.status(400).json({ error: 'code is required' });

    const otherKeys = await UserE2EKeys.findOne({ userId: otherUserId, deviceId }).lean().exec();
    if (!otherKeys) return res.status(404).json({ error: 'Peer E2E keys not published yet' });

    const expected = computeSafetyCode(otherKeys.identityKeyPublic);
    if (String(code).trim() !== expected) {
      return res.status(400).json({ error: 'Safety code mismatch' });
    }

    const safetyHash = safetyCodeHash(otherKeys.identityKeyPublic);
    const verified = await UserE2EVerification.findOneAndUpdate(
      { verifierUserId: meId, verifiedUserId: otherUserId, deviceId },
      {
        $set: {
          verifierUserId: meId,
          verifiedUserId: otherUserId,
          deviceId,
          safetyCodeHash: safetyHash,
          verifiedAt: new Date(),
        },
      },
      { upsert: true, new: true },
    ).lean().exec();

    return res.status(200).json({ ok: true, verified: true, verifiedAt: verified?.verifiedAt || null });
  } catch (err) {
    console.error('POST /e2e/verification error', err);
    return res.status(500).json({ error: 'Failed to mark verified' });
  }
});

module.exports = router;

