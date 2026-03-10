const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { config } = require('../config');

const ACCESS_TOKEN_TTL_SECONDS = 15 * 60; // 15 minutes
const REFRESH_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days

function generateAccessToken(payload) {
  return jwt.sign(payload, config.jwtSecret, {
    algorithm: 'HS256',
    expiresIn: ACCESS_TOKEN_TTL_SECONDS,
  });
}

function generateRefreshToken(payload) {
  // Use a separate JWT so we can include a token family ID and session ID
  return jwt.sign(payload, config.jwtSecret, {
    algorithm: 'HS256',
    expiresIn: REFRESH_TOKEN_TTL_SECONDS,
  });
}

function verifyToken(token) {
  return jwt.verify(token, config.jwtSecret);
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function generateTokenFamilyId() {
  return crypto.randomBytes(16).toString('hex');
}

module.exports = {
  ACCESS_TOKEN_TTL_SECONDS,
  REFRESH_TOKEN_TTL_SECONDS,
  generateAccessToken,
  generateRefreshToken,
  verifyToken,
  hashToken,
  generateTokenFamilyId,
};

