const { v2: cloudinary } = require('cloudinary');

function getEnv(name) {
  return process.env[name] || process.env[`CLOUDINARY_${name}`] || null;
}

const CLOUDINARY_CLOUD_NAME = getEnv('CLOUD_NAME') || process.env.CLOUDINARY_CLOUD_NAME || null;
const CLOUDINARY_API_KEY = process.env.CLOUDINARY_API_KEY || null;
const CLOUDINARY_API_SECRET = process.env.CLOUDINARY_API_SECRET || null;

const isCloudinaryConfigured = Boolean(CLOUDINARY_CLOUD_NAME && CLOUDINARY_API_KEY && CLOUDINARY_API_SECRET);

if (isCloudinaryConfigured) {
  cloudinary.config({
    cloud_name: CLOUDINARY_CLOUD_NAME,
    api_key: CLOUDINARY_API_KEY,
    api_secret: CLOUDINARY_API_SECRET,
  });
}

function assertConfigured() {
  if (!isCloudinaryConfigured) {
    const missing = [
      !CLOUDINARY_CLOUD_NAME ? 'CLOUDINARY_CLOUD_NAME' : null,
      !CLOUDINARY_API_KEY ? 'CLOUDINARY_API_KEY' : null,
      !CLOUDINARY_API_SECRET ? 'CLOUDINARY_API_SECRET' : null,
    ].filter(Boolean);
    const err = new Error(`Cloudinary not configured. Missing: ${missing.join(', ')}`);
    err.code = 'CLOUDINARY_NOT_CONFIGURED';
    throw err;
  }
}

async function uploadToCloudinary(filePath, { publicId, folder, resourceType } = {}) {
  assertConfigured();

  // Cloudinary SDK returns a promise from `upload`.
  const result = await cloudinary.uploader.upload(filePath, {
    resource_type: resourceType || 'auto',
    folder: folder || 'chatapp',
    public_id: publicId,
    overwrite: true,
  });

  return {
    publicId: result.public_id,
    secureUrl: result.secure_url,
    url: result.url,
  };
}

module.exports = {
  isCloudinaryConfigured,
  uploadToCloudinary,
};

