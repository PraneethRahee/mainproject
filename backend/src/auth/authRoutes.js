const express = require('express');
const bcrypt = require('bcryptjs');
const speakeasy = require('speakeasy');
const { User, Session } = require('../models');
const { AuditLog } = require('../models');
const {
  generateAccessToken,
  generateRefreshToken,
  verifyToken,
  hashToken,
  generateTokenFamilyId,
  REFRESH_TOKEN_TTL_SECONDS,
} = require('./jwt');
const { checkRateLimit } = require('../redis');
const { config } = require('../config');

const router = express.Router();

const REFRESH_COOKIE_NAME = 'refreshToken';

async function logAuthEvent({ actorId, action, targetId, result, ip, userAgent, metadata }) {
  try {
    await AuditLog.create({
      actor: actorId || null,
      action,
      targetType: 'auth',
      targetId: targetId || null,
      result,
      ip,
      userAgent,
      metadata,
    });
  } catch (err) {
    console.error('Failed to write auth audit log', err);
  }
}

function getClientInfo(req) {
  return {
    ip: req.ip,
    userAgent: req.get('user-agent') || '',
  };
}

async function applyRateLimitOrThrow(req, keySuffix, limit, windowSeconds) {
  const ip = req.ip || 'unknown-ip';
  const key = `${keySuffix}:${ip}`;

  const result = await checkRateLimit({ key, limit, windowSeconds });
  if (!result.allowed) {
    const error = new Error('Too many requests');
    error.status = 429;
    throw error;
  }
}

// POST /auth/mfa/setup
router.post('/mfa/setup', async (req, res) => {
  try {
    const { accessToken } = req.body || {};
    if (!accessToken) {
      return res.status(400).json({ error: 'accessToken is required' });
    }

    let decoded;
    try {
      decoded = verifyToken(accessToken);
    } catch {
      return res.status(401).json({ error: 'Invalid access token' });
    }

    const userId = decoded.sub;
    if (!userId) {
      return res.status(401).json({ error: 'Invalid user' });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const secret = speakeasy.generateSecret({
      length: 20,
      name: `Antigravity Chat (${user.email})`,
      issuer: 'Antigravity Chat',
    });

    user.mfaSecret = secret.base32;
    user.mfaEnabled = false;
    await user.save();

    await logAuthEvent({
      actorId: user._id,
      action: 'auth.mfa.setup',
      targetId: String(user._id),
      result: 'success',
      ip: null,
      userAgent: null,
      metadata: {},
    });

    return res.status(200).json({
      otpauthUrl: secret.otpauth_url,
      secret: secret.base32,
    });
  } catch (err) {
    console.error('MFA setup error', err);
    const status = err.status || 500;
    return res.status(status).json({ error: 'MFA setup failed' });
  }
});

// POST /auth/mfa/verify
router.post('/mfa/verify', async (req, res) => {
  try {
    await applyRateLimitOrThrow(req, 'auth:mfa_verify', 10, 60);

    const { tempToken, code } = req.body || {};

    if (!tempToken || !code) {
      return res.status(400).json({ error: 'tempToken and code are required' });
    }

    let decoded;
    try {
      decoded = verifyToken(tempToken);
    } catch {
      return res.status(401).json({ error: 'Invalid or expired temp token' });
    }

    if (!decoded.mfaPending || !decoded.sub) {
      return res.status(400).json({ error: 'Invalid MFA challenge token' });
    }

    const user = await User.findById(decoded.sub).select('+mfaSecret');
    if (!user || !user.mfaSecret) {
      return res.status(400).json({ error: 'MFA not configured for user' });
    }

    const verified = speakeasy.totp.verify({
      secret: user.mfaSecret,
      encoding: 'base32',
      token: String(code),
      window: 1,
    });

    const { ip, userAgent } = getClientInfo(req);

    if (!verified) {
      await logAuthEvent({
        actorId: user._id,
        action: 'auth.mfa.verify',
        targetId: String(user._id),
        result: 'failure',
        ip,
        userAgent,
        metadata: { reason: 'invalid_code' },
      });

      return res.status(401).json({ error: 'Invalid or expired code' });
    }

    if (!user.mfaEnabled) {
      user.mfaEnabled = true;
      await user.save();
    }

    const tokens = await createSessionAndTokens(user.toObject(), { ip, userAgent });

    await logAuthEvent({
      actorId: user._id,
      action: 'auth.mfa.verify',
      targetId: String(tokens.sessionId),
      result: 'success',
      ip,
      userAgent,
      metadata: {},
    });

    return res.status(200).json({
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    });
  } catch (err) {
    console.error('MFA verify error', err);
    const status = err.status || 500;
    return res.status(status).json({ error: 'MFA verification failed' });
  }
});

// POST /auth/register
router.post('/register', async (req, res) => {
  try {
    await applyRateLimitOrThrow(req, 'auth:register', 10, 60);

    const { email, password, name } = req.body || {};

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) {
      return res.status(409).json({ error: 'User with this email already exists' });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const user = await User.create({
      email: email.toLowerCase(),
      displayName: name || email.split('@')[0],
      role: 'member',
      profile: {},
      passwordHash,
    });

    const { ip, userAgent } = getClientInfo(req);
    await logAuthEvent({
      actorId: user._id,
      action: 'auth.register',
      targetId: String(user._id),
      result: 'success',
      ip,
      userAgent,
      metadata: {},
    });

    return res.status(201).json({ success: true });
  } catch (err) {
    console.error('Register error', err);
    const status = err.status || 500;
    return res.status(status).json({ error: 'Registration failed' });
  }
});

// helper to get stored password hash
async function getUserWithPassword(email) {
  const user = await User.findOne({ email: email.toLowerCase() }).select('+passwordHash').lean();
  if (!user) return null;
  return user;
}

// Creates a session and tokens
async function createSessionAndTokens(user, clientInfo) {
  const tokenFamilyId = generateTokenFamilyId();

  const accessToken = generateAccessToken({
    sub: String(user._id),
    role: user.role,
    mfaEnabled: user.mfaEnabled,
  });

  const refreshTokenPayload = {
    sub: String(user._id),
    fam: tokenFamilyId,
    typ: 'refresh',
  };

  const refreshToken = generateRefreshToken(refreshTokenPayload);
  const refreshTokenHash = hashToken(refreshToken);

  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000);

  const session = await Session.create({
    user: user._id,
    refreshTokenHash,
    tokenFamilyId,
    userAgent: clientInfo.userAgent,
    ip: clientInfo.ip,
    expiresAt,
  });

  return {
    accessToken,
    refreshToken,
    sessionId: session._id,
    tokenFamilyId,
  };
}

// POST /auth/login
router.post('/login', async (req, res) => {
  try {
    await applyRateLimitOrThrow(req, 'auth:login', 20, 60);

    const { email, password } = req.body || {};

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const user = await getUserWithPassword(email);
    if (!user || !user.passwordHash) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const passwordMatch = await bcrypt.compare(password, user.passwordHash);
    if (!passwordMatch) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const clientInfo = getClientInfo(req);

    if (user.mfaEnabled) {
      const tempToken = generateAccessToken({
        sub: String(user._id),
        role: user.role,
        mfaPending: true,
      });

      await logAuthEvent({
        actorId: user._id,
        action: 'auth.login.mfa_challenge',
        targetId: String(user._id),
        result: 'success',
        ip: clientInfo.ip,
        userAgent: clientInfo.userAgent,
        metadata: {},
      });

      return res.status(200).json({
        requiresMfa: true,
        tempToken,
      });
    }

    const tokens = await createSessionAndTokens(user, clientInfo);

    await logAuthEvent({
      actorId: user._id,
      action: 'auth.login',
      targetId: String(tokens.sessionId),
      result: 'success',
      ip: clientInfo.ip,
      userAgent: clientInfo.userAgent,
      metadata: {},
    });

    return res.status(200).json({
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    });
  } catch (err) {
    console.error('Login error', err);
    const status = err.status || 500;
    return res.status(status).json({ error: 'Login failed' });
  }
});

// POST /auth/logout
router.post('/logout', async (req, res) => {
  try {
    const { refreshToken } = req.body || {};
    if (!refreshToken) {
      return res.status(400).json({ error: 'refreshToken is required' });
    }

    let decoded;
    try {
      decoded = verifyToken(refreshToken);
    } catch {
      return res.status(400).json({ error: 'Invalid refresh token' });
    }

    const refreshHash = hashToken(refreshToken);
    const session = await Session.findOne({ refreshTokenHash: refreshHash });

    const { ip, userAgent } = getClientInfo(req);

    if (session) {
      session.revokedAt = new Date();
      session.revokedReason = 'logout';
      await session.save();

      await logAuthEvent({
        actorId: session.user,
        action: 'auth.logout',
        targetId: String(session._id),
        result: 'success',
        ip,
        userAgent,
        metadata: {},
      });
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('Logout error', err);
    const status = err.status || 500;
    return res.status(status).json({ error: 'Logout failed' });
  }
});

// POST /auth/refresh
router.post('/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body || {};
    if (!refreshToken) {
      return res.status(400).json({ error: 'refreshToken is required' });
    }

    let decoded;
    try {
      decoded = verifyToken(refreshToken);
    } catch (err) {
      console.error('Refresh token verify failed', err);
      return res.status(401).json({ error: 'Invalid refresh token' });
    }

    if (decoded.typ !== 'refresh') {
      return res.status(400).json({ error: 'Invalid token type' });
    }

    const refreshHash = hashToken(refreshToken);
    const session = await Session.findOne({ refreshTokenHash: refreshHash });

    const { ip, userAgent } = getClientInfo(req);

    if (!session || session.revokedAt || session.expiresAt < new Date()) {
      if (decoded.fam) {
        await Session.updateMany(
          { tokenFamilyId: decoded.fam, revokedAt: { $exists: false } },
          { $set: { revokedAt: new Date(), revokedReason: 'refresh_replay' } }
        );
      }

      await logAuthEvent({
        actorId: decoded.sub,
        action: 'auth.refresh',
        targetId: decoded.fam || null,
        result: 'failure',
        ip,
        userAgent,
        metadata: { reason: 'replay_or_expired' },
      });

      return res.status(401).json({ error: 'Refresh token invalid or expired' });
    }

    const user = await User.findById(session.user).lean();
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    session.revokedAt = new Date();
    session.revokedReason = 'rotated';
    await session.save();

    const tokens = await createSessionAndTokens(user, { ip, userAgent });

    await logAuthEvent({
      actorId: user._id,
      action: 'auth.refresh',
      targetId: String(tokens.sessionId),
      result: 'success',
      ip,
      userAgent,
      metadata: { previousSessionId: String(session._id) },
    });

    return res.status(200).json({
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    });
  } catch (err) {
    console.error('Refresh error', err);
    const status = err.status || 500;
    return res.status(status).json({ error: 'Refresh failed' });
  }
});

module.exports = router;

