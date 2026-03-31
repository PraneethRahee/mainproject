const express = require('express');
const multer = require('multer');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const { FileAsset } = require('../models');
const { requireAuth } = require('../middleware/auth');
const { writeAuditLog, getRequestClientInfo } = require('../middleware/audit');
const { uploadToCloudinary, isCloudinaryConfigured } = require('../cloudinary');

const router = express.Router();

const QUARANTINE_DIR = path.join(__dirname, '..', '..', 'storage', 'quarantine');

const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024; // 50MB

const DENIED_EXTENSIONS = [
  '.exe',
  '.dll',
  '.bat',
  '.cmd',
  '.ps1',
  '.sh',
  '.js',
  '.msi',
  '.apk',
];

const ALLOWED_MIME_PREFIXES = ['image/', 'video/', 'audio/'];

const ALLOWED_MIME_TYPES = [
  'application/pdf',
  // Office docs
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  // Archives / compressed
  'application/zip',
  'application/x-zip-compressed',
  'application/x-7z-compressed',
  'application/x-rar-compressed',
  'application/x-tar',
  'application/gzip',
  // General files
  'application/octet-stream',
  'text/plain',
];

fs.mkdirSync(QUARANTINE_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, QUARANTINE_DIR);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    const randomPart = crypto.randomBytes(16).toString('hex');
    const filename = `${Date.now()}-${randomPart}${ext}`;
    cb(null, filename);
  },
});

const upload = multer({ storage });

async function readMagicBytes(filePath, length = 16) {
  const fd = await fs.promises.open(filePath, 'r');
  try {
    const buffer = Buffer.alloc(length);
    const { bytesRead } = await fd.read(buffer, 0, length, 0);
    return buffer.slice(0, bytesRead);
  } finally {
    await fd.close();
  }
}

function detectMagicType(buffer) {
  if (!buffer || buffer.length < 4) return null;

  // PDF: 25 50 44 46 -> "%PDF"
  if (buffer.slice(0, 4).toString('ascii') === '%PDF') {
    return 'pdf';
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return 'png';
  }

  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'jpeg';
  }

  // GIF: "GIF8"
  if (buffer.slice(0, 4).toString('ascii') === 'GIF8') {
    return 'gif';
  }

  // ZIP / OOXML / many archives: "PK\x03\x04"
  if (buffer[0] === 0x50 && buffer[1] === 0x4b && buffer[2] === 0x03 && buffer[3] === 0x04) {
    return 'zip';
  }

  // MP4: often "....ftyp"
  if (
    buffer.length >= 12 &&
    buffer[4] === 0x66 && // f
    buffer[5] === 0x74 && // t
    buffer[6] === 0x79 && // y
    buffer[7] === 0x70 // p
  ) {
    return 'mp4';
  }

  // Windows executable (PE): "MZ"
  if (buffer[0] === 0x4d && buffer[1] === 0x5a) {
    return 'pe';
  }

  return null;
}

function isAllowedMimeType(mimeType) {
  if (!mimeType) return false;
  if (ALLOWED_MIME_PREFIXES.some((prefix) => mimeType.startsWith(prefix))) {
    return true;
  }
  if (ALLOWED_MIME_TYPES.includes(mimeType)) {
    return true;
  }
  return false;
}

function isMagicCompatible(magicType, { ext, mimeType }) {
  const lowerExt = (ext || '').toLowerCase();
  const lowerMime = (mimeType || '').toLowerCase();

  switch (magicType) {
    case 'pdf':
      return lowerExt === '.pdf' || lowerMime === 'application/pdf';
    case 'png':
      return lowerExt === '.png' || lowerMime === 'image/png';
    case 'jpeg':
      return (
        lowerExt === '.jpg' ||
        lowerExt === '.jpeg' ||
        lowerMime === 'image/jpeg' ||
        lowerMime === 'image/jpg'
      );
    case 'gif':
      return lowerExt === '.gif' || lowerMime === 'image/gif';
    case 'zip':
      // ZIP or OOXML/archives: allow common extensions and MIME types
      return (
        ['.zip', '.docx', '.xlsx', '.pptx', '.jar'].includes(lowerExt) ||
        lowerMime === 'application/zip' ||
        lowerMime === 'application/x-zip-compressed' ||
        lowerMime ===
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
        lowerMime === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
        lowerMime === 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
      );
    case 'mp4':
      return lowerExt === '.mp4' || lowerMime.includes('mp4');
    case 'pe':
      // Executables (PE) should never be allowed
      return false;
    default:
      return true;
  }
}

async function validateUploadedFile({ absolutePath, size, mimeType, extension }) {
  const ext = (extension || '').toLowerCase();

  if (DENIED_EXTENSIONS.includes(ext)) {
    return `Disallowed file type: ${ext}`;
  }

  if (!Number.isFinite(size) || size <= 0) {
    return 'File size must be greater than 0 bytes';
  }

  if (size > MAX_FILE_SIZE_BYTES) {
    return 'File too large: maximum size is 50MB';
  }

  if (!isAllowedMimeType(mimeType)) {
    return `Disallowed MIME type: ${mimeType || 'unknown'}`;
  }

  let magicBuffer;
  try {
    magicBuffer = await readMagicBytes(absolutePath, 16);
  } catch (err) {
    console.error('Failed to read magic bytes', err);
    // If we cannot read magic bytes, be conservative and reject
    return 'Failed to inspect file contents';
  }

  const magicType = detectMagicType(magicBuffer);

  if (!isMagicCompatible(magicType, { ext, mimeType })) {
    return 'File signature does not match declared type';
  }

  return null;
}

async function computeFileHash(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);

    stream.on('error', (err) => reject(err));
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

router.post('/upload', requireAuth, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'file is required' });
    }

    const userId = req.user.id;
    const { filename, mimetype, size } = req.file;
    const ext = path.extname(filename || '').toLowerCase();
    const storageKey = path.join('quarantine', filename);
    const absolutePath = path.join(QUARANTINE_DIR, filename);

    const validationError = await validateUploadedFile({
      absolutePath,
      size,
      mimeType: mimetype,
      extension: ext,
    });

    if (validationError) {
      // Best-effort cleanup of the stored file; ignore errors
      fs.promises
        .unlink(absolutePath)
        .catch((err) => console.error('Failed to remove rejected upload', err));

      const { ip, userAgent } = getRequestClientInfo(req);
      await writeAuditLog({
        actorId: userId,
        action: 'file.upload',
        targetType: 'file',
        targetId: null,
        result: 'failure',
        ip,
        userAgent,
        metadata: {
          reason: validationError,
          mimeType: mimetype,
          extension: ext,
          sizeBytes: size,
        },
      });

      return res.status(400).json({ error: validationError });
    }

    let hash;
    try {
      hash = await computeFileHash(absolutePath);
    } catch (err) {
      console.error('Failed to compute file hash', err);
      return res.status(500).json({ error: 'Failed to process uploaded file' });
    }

    let cloudinaryResult = null;
    if (isCloudinaryConfigured) {
      try {
        // Use hash as a deterministic Cloudinary public_id so re-uploads reuse the same asset.
        cloudinaryResult = await uploadToCloudinary(absolutePath, {
          publicId: `chatapp/${hash}`,
          folder: 'chatapp',
          resourceType: 'auto',
        });
      } catch (err) {
        console.error('Cloudinary upload failed (continuing without Cloudinary URL)', err);
        cloudinaryResult = null;
      }
    }

    let fileAsset;
    try {
      fileAsset = await FileAsset.create({
        owner: userId,
        storageKey,
        hash,
        mimeType: mimetype,
        extension: ext || undefined,
        sizeBytes: size,
        scanStatus: 'quarantined',
        originalName: req.file.originalname || undefined,
        cloudinaryPublicId: cloudinaryResult?.publicId,
        cloudinaryUrl: cloudinaryResult?.url,
        cloudinarySecureUrl: cloudinaryResult?.secureUrl,
      });
    } catch (err) {
      // If a unique index exists on `hash`, re-uploading the same file content can fail.
      // As a best-effort, reuse the already-stored FileAsset when it belongs to the same user.
      if (err && err.code === 11000) {
        try {
          const existing = await FileAsset.findOne({ hash }).select('_id owner scanStatus').lean().exec();
          if (existing && String(existing.owner) === String(userId)) {
            return res.status(201).json({ id: String(existing._id) });
          }
        } catch (lookupErr) {
          console.error('Failed to lookup duplicate FileAsset', lookupErr);
        }
      }

      console.error('Failed to create FileAsset', err);
      return res.status(500).json({ error: 'Failed to store file metadata' });
    }

    const { ip, userAgent } = getRequestClientInfo(req);
    await writeAuditLog({
      actorId: userId,
      action: 'file.upload',
      targetType: 'file',
      targetId: String(fileAsset._id),
      result: 'success',
      ip,
      userAgent,
      metadata: {
        storageKey,
        mimeType: mimetype,
        extension: ext,
        sizeBytes: size,
      },
    });

    return res.status(201).json({ id: String(fileAsset._id) });
  } catch (err) {
    console.error('POST /files/upload error', err);
    return res.status(500).json({ error: 'Failed to upload file' });
  }
});

// GET /files/:id/status
router.get('/:id/status', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'Invalid file id' });
    }

    const file = await FileAsset.findById(id).select('scanStatus scannedAt owner').lean().exec();
    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }

    // Basic owner check; can be relaxed to channel membership in future subtasks
    if (String(file.owner) !== req.user.id) {
      return res.status(403).json({ error: 'Not allowed to view this file' });
    }

    return res.status(200).json({
      id: String(id),
      status: file.scanStatus,
      scannedAt: file.scannedAt || null,
    });
  } catch (err) {
    console.error('GET /files/:id/status error', err);
    return res.status(500).json({ error: 'Failed to fetch file status' });
  }
});

// GET /files/:id/download
router.get('/:id/download', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'Invalid file id' });
    }

    const file = await FileAsset.findById(id)
      .select('scanStatus storageKey owner mimeType sizeBytes cloudinarySecureUrl cloudinaryUrl')
      .lean()
      .exec();

    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }

    if (String(file.owner) !== req.user.id) {
      return res.status(403).json({ error: 'Not allowed to download this file' });
    }

    if (file.scanStatus !== 'scanned_clean') {
      return res.status(403).json({ error: 'File is not available for download' });
    }

    // Prefer Cloudinary links for asset delivery.
    if (file.cloudinarySecureUrl || file.cloudinaryUrl) {
      const url = file.cloudinarySecureUrl || file.cloudinaryUrl;

      const { ip, userAgent } = getRequestClientInfo(req);
      await writeAuditLog({
        actorId: req.user.id,
        action: 'file.download',
        targetType: 'file',
        targetId: String(id),
        result: 'success',
        ip,
        userAgent,
        metadata: {
          mimeType: file.mimeType,
          sizeBytes: file.sizeBytes,
          via: 'cloudinary',
        },
      });

      res.redirect(url);
      return;
    }

    const storageKey = file.storageKey || '';
    const absolutePath = path.join(__dirname, '..', '..', 'storage', storageKey);

    try {
      await fs.promises.access(absolutePath, fs.constants.R_OK);
    } catch {
      return res.status(404).json({ error: 'File content not found' });
    }

    const fileName = path.basename(storageKey);

    const { ip, userAgent } = getRequestClientInfo(req);
    await writeAuditLog({
      actorId: req.user.id,
      action: 'file.download',
      targetType: 'file',
      targetId: String(id),
      result: 'success',
      ip,
      userAgent,
      metadata: {
        storageKey,
        mimeType: file.mimeType,
        sizeBytes: file.sizeBytes,
      },
    });

    res.setHeader('Content-Type', file.mimeType || 'application/octet-stream');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(fileName)}"`,
    );

    const stream = fs.createReadStream(absolutePath);
    stream.on('error', (err) => {
      console.error('Error streaming file', err);
      if (!res.headersSent) {
        res.status(500).end();
      } else {
        res.end();
      }
    });
    stream.pipe(res);
  } catch (err) {
    console.error('GET /files/:id/download error', err);
    if (!res.headersSent) {
      return res.status(500).json({ error: 'Failed to download file' });
    }
  }
});

module.exports = router;

