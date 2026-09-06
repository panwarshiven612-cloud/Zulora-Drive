'use strict';

/**
 * Zulora Drive API
 * Enterprise cloud storage backend with Firebase Authentication,
 * Firestore real-time quota tracking, and Vercel serverless support.
 */
require('dotenv').config();

const crypto = require('crypto');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const multer = require('multer');
const admin = require('firebase-admin');
const { cert, getApps, initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { FieldValue, getFirestore } = require('firebase-admin/firestore');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');

// Ensure admin.apps getter is defined across all firebase-admin SDK versions
if (!admin.apps) {
  Object.defineProperty(admin, 'apps', {
    get: () => (typeof getApps === 'function' ? getApps() : (admin.getApps ? admin.getApps() : []))
  });
}

const app = express();
const PORT = Number(process.env.PORT || 5000);
const ADMIN_EMAIL = 'zulora.help@gmail.com';
const PAYMENT_UPI_ID = 'shivenpanwar@fam';
const GIB = 1024 ** 3;
const DEFAULT_STORAGE_LIMIT_BYTES = 10 * GIB; // 10 GB default
const MAX_FILE_SIZE = Number(process.env.MAX_FILE_SIZE_BYTES || 500 * 1024 * 1024);
const UPLOAD_ROOT = path.resolve(
  process.env.UPLOAD_DIR || (process.env.VERCEL ? path.join('/tmp', 'uploads') : path.join(__dirname, 'uploads'))
);
const FRONTEND_ROOT = path.resolve(__dirname, '..', 'frontend');

// Monthly data packages as specified
const PLANS = Object.freeze({
  free: {
    key: 'free',
    label: 'Starter Free',
    price: 0,
    storageLimitBytes: 10 * GIB,
    storageLimitGb: 10,
    features: ['10 GB Cloud Storage', 'Full Encryption', 'Mobile & Desktop Access', 'Realtime Sync']
  },
  plan_50gb: {
    key: 'plan_50gb',
    label: '50 GB Lite',
    price: 70,
    storageLimitBytes: 50 * GIB,
    storageLimitGb: 50,
    features: ['50 GB High-Speed Storage', 'Priority Sync', 'Zero Compression', 'Direct WhatsApp Support']
  },
  plan_100gb: {
    key: 'plan_100gb',
    label: '100 GB Pro',
    price: 130,
    storageLimitBytes: 100 * GIB,
    storageLimitGb: 100,
    features: ['100 GB High-Speed Storage', 'Advanced Sharing', 'Instant Upload Speeds', 'VIP Support']
  },
  plan_200gb: {
    key: 'plan_200gb',
    label: '200 GB Business',
    price: 250,
    storageLimitBytes: 200 * GIB,
    storageLimitGb: 200,
    features: ['200 GB High-Speed Storage', 'Multi-device Realtime Sync', 'Audit History', 'Priority Support']
  },
  plan_500gb: {
    key: 'plan_500gb',
    label: '500 GB Ultra',
    price: 700,
    storageLimitBytes: 500 * GIB,
    storageLimitGb: 500,
    features: ['500 GB Ultra Storage', 'Enterprise Encryption', 'Dedicated Bandwidth', '24/7 Dedicated Support']
  }
});

class ApiError extends Error {
  constructor(status, message, code = 'REQUEST_FAILED') {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function asSafeSegment(value) {
  const safe = String(value || '').replace(/[^a-zA-Z0-9_-]/g, '_');
  return safe || crypto.createHash('sha256').update(String(value || '')).digest('hex');
}

function userDirectory(uid) {
  const directory = path.resolve(UPLOAD_ROOT, asSafeSegment(uid));
  if (!directory.startsWith(`${UPLOAD_ROOT}${path.sep}`) && directory !== UPLOAD_ROOT) {
    throw new ApiError(400, 'Invalid user storage path.', 'INVALID_STORAGE_PATH');
  }
  return directory;
}

function safeOriginalName(name) {
  const baseName = path.basename(String(name || 'file'));
  const cleaned = baseName
    .replace(/[\u0000-\u001f<>:"/\\|?*]/g, '_')
    .replace(/^\.+$/, 'file')
    .trim();
  return (cleaned || 'file').slice(0, 180);
}

function contentDispositionName(name) {
  return safeOriginalName(name).replace(/["\\]/g, '_');
}

function timestampToIso(value) {
  if (!value) return null;
  if (typeof value.toDate === 'function') return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  return typeof value === 'string' ? value : null;
}

function extractStorageLimit(data) {
  if (!data) return DEFAULT_STORAGE_LIMIT_BYTES;
  if (data.storageLimitBytes !== undefined && data.storageLimitBytes !== null) {
    const n = Number(data.storageLimitBytes);
    if (!isNaN(n) && n > 0) return n;
  }
  if (data.storageLimit !== undefined && data.storageLimit !== null) {
    const n = Number(data.storageLimit);
    if (!isNaN(n) && n > 0) return n;
  }
  return DEFAULT_STORAGE_LIMIT_BYTES;
}

function extractStorageUsed(data) {
  if (!data) return 0;
  if (data.usedStorageBytes !== undefined && data.usedStorageBytes !== null) {
    const n = Number(data.usedStorageBytes);
    if (!isNaN(n) && n >= 0) return n;
  }
  if (data.storageUsed !== undefined && data.storageUsed !== null) {
    const n = Number(data.storageUsed);
    if (!isNaN(n) && n >= 0) return n;
  }
  return 0;
}

function profileForClient(profile) {
  const storageLimit = extractStorageLimit(profile);
  const storageUsed = extractStorageUsed(profile);
  const planType = profile.planType || (storageLimit > DEFAULT_STORAGE_LIMIT_BYTES ? 'Pro' : 'Free');
  const tier = profile.tier || (storageLimit > DEFAULT_STORAGE_LIMIT_BYTES ? 'pro' : 'free');

  return {
    uid: profile.uid,
    accountId: profile.accountId,
    email: profile.email,
    displayName: profile.displayName || '',
    photoURL: profile.photoURL || '',
    storageLimitBytes: storageLimit,
    usedStorageBytes: storageUsed,
    storageLimit: storageLimit,
    storageUsed: storageUsed,
    planType,
    tier,
    isAdmin: normalizeEmail(profile.email) === ADMIN_EMAIL,
    createdAt: timestampToIso(profile.createdAt),
    updatedAt: timestampToIso(profile.updatedAt)
  };
}

function fileForClient(id, file) {
  return {
    id,
    originalName: file.originalName,
    size: Number(file.size || 0),
    mimetype: file.mimetype || 'application/octet-stream',
    isStarred: Boolean(file.isStarred),
    uploadedAt: timestampToIso(file.uploadedAt),
    updatedAt: timestampToIso(file.updatedAt)
  };
}

function planFromKey(key) {
  const norm = String(key || '').toLowerCase().replace(/[- ]/g, '_');
  const plan = PLANS[norm] || PLANS[`plan_${norm}`];
  if (!plan) throw new ApiError(400, 'Select a valid storage plan.', 'INVALID_PLAN');
  return plan;
}

// Firebase Admin initialization
let db;
let firebaseReady = false;

function getServiceAccountCredentials() {
  const envRaw = process.env.FIREBASE_SERVICE_ACCOUNT
    || process.env.FIREBASE_SERVICE_ACCOUNT_KEY
    || process.env.FIREBASE_CREDENTIALS;

  if (envRaw) {
    let raw = envRaw;
    if (typeof raw === 'string') {
      let trimmed = raw.trim();
      if (trimmed.startsWith("'") && trimmed.endsWith("'")) {
        trimmed = trimmed.slice(1, -1).trim();
      }
      try {
        return JSON.parse(trimmed);
      } catch (parseError) {
        try {
          return JSON.parse(Buffer.from(trimmed, 'base64').toString('utf8'));
        } catch {
          console.warn('Failed to parse FIREBASE_SERVICE_ACCOUNT as JSON string:', parseError.message);
        }
      }
    } else if (typeof raw === 'object' && raw !== null) {
      return raw;
    }
  }

  // Fallback to local service account file candidates
  const candidatePaths = [
    path.resolve(__dirname, 'serviceAccountKey.json'),
    path.resolve(__dirname, 'serviceaccountkey.json'),
    path.resolve(process.cwd(), 'serviceAccountKey.json'),
    '/etc/secrets/serviceAccountKey.json',
    '/etc/secrets/serviceaccountkey.json'
  ];

  for (const filePath of candidatePaths) {
    if (fs.existsSync(filePath)) {
      try {
        const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        console.info(`Loaded Firebase credentials from ${filePath}`);
        return parsed;
      } catch (fileErr) {
        console.warn(`Could not read ${filePath}:`, fileErr.message);
      }
    }
  }
  return null;
}

try {
  const serviceAccount = getServiceAccountCredentials();
  if (serviceAccount) {
    if (typeof serviceAccount.private_key === 'string') {
      serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
    }
    const credential = cert(serviceAccount);
    if (!admin.apps.length) {
      initializeApp({
        credential,
        storageBucket: process.env.FIREBASE_STORAGE_BUCKET || 'zulora-drive.firebasestorage.app'
      });
    }
    db = getFirestore();
    firebaseReady = true;
    console.info('Firebase Admin Initialized Successfully!');
  } else {
    console.warn('Firebase Admin credentials not found. Set FIREBASE_SERVICE_ACCOUNT in environment or provide serviceAccountKey.json.');
  }
} catch (error) {
  console.warn(`Firebase Admin unavailable: ${error.message}`);
}

try {
  fs.mkdirSync(UPLOAD_ROOT, { recursive: true });
} catch (dirErr) {
  console.warn(`Could not create UPLOAD_ROOT (${UPLOAD_ROOT}):`, dirErr.message);
}

// Security headers
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
  contentSecurityPolicy: false // Handled cleanly by frontend meta
}));

const CORS_ALLOWED_ORIGINS = [
  'https://drive.zulora.in',
  'https://zulora.in',
  'https://zulora-drive.vercel.app',
  'http://localhost:3000',
  'http://localhost:5000',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:5500'
];

app.use(cors({
  origin(origin, callback) {
    if (!origin) return callback(null, true);
    const normalized = origin.replace(/\/$/, '').toLowerCase();
    if (
      CORS_ALLOWED_ORIGINS.includes(normalized) ||
      normalized.endsWith('.zulora.in') ||
      normalized.endsWith('.vercel.app')
    ) {
      return callback(null, true);
    }
    return callback(null, true); // Permissive fallback for seamless client interactions
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Authorization', 'Content-Type', 'Bypass-Tunnel-Reminder'],
  maxAge: 86400
}));

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// Serverless URL normalization
app.use((req, res, next) => {
  if (req.url && !req.url.startsWith('/api') && !req.url.startsWith('/frontend')) {
    req.url = '/api' + (req.url.startsWith('/') ? req.url : '/' + req.url);
  }
  next();
});

function requireFirebase(req, res, next) {
  const isConfigured = Boolean((admin.apps && admin.apps.length > 0) || firebaseReady);
  if (!isConfigured) {
    return next(new ApiError(503, 'Server authentication is not configured. Add Firebase Admin credentials.', 'FIREBASE_NOT_CONFIGURED'));
  }
  return next();
}

async function authenticate(req, res, next) {
  try {
    const match = (req.get('authorization') || '').match(/^Bearer\s+(.+)$/i);
    if (!match) throw new ApiError(401, 'A Firebase ID token is required.', 'AUTH_REQUIRED');
    const token = await getAuth().verifyIdToken(match[1], true);
    if (!token.uid || !token.email) throw new ApiError(401, 'A verified email address is required.', 'EMAIL_REQUIRED');
    req.user = {
      uid: token.uid,
      email: normalizeEmail(token.email),
      name: token.name || '',
      picture: token.picture || ''
    };
    return next();
  } catch (error) {
    return next(error instanceof ApiError ? error : new ApiError(401, 'Your session has expired. Please sign in again.', 'INVALID_TOKEN'));
  }
}

function requireAdmin(req, res, next) {
  return normalizeEmail(req.user?.email) === ADMIN_EMAIL
    ? next()
    : next(new ApiError(403, 'Administrator access is required.', 'ADMIN_REQUIRED'));
}

async function bootstrapProfile(user, input = {}) {
  const userRef = db.collection('users').doc(user.uid);
  const requestedName = String(input.displayName || user.name || user.email.split('@')[0]).trim().slice(0, 80);
  const requestedPhoto = String(input.photoURL || user.picture || '').trim().slice(0, 1000);

  for (let attempt = 0; attempt < 12; attempt += 1) {
    const accountId = `ZUL-${crypto.randomInt(100000, 1000000)}`;
    const accountRef = db.collection('accountIds').doc(accountId);
    const now = new Date();
    const profile = await db.runTransaction(async (transaction) => {
      const existing = await transaction.get(userRef);
      if (existing.exists) {
        const current = existing.data();
        const updates = { updatedAt: FieldValue.serverTimestamp() };
        if (input.displayName && requestedName) updates.displayName = requestedName;
        if (input.photoURL && requestedPhoto) updates.photoURL = requestedPhoto;
        if (Object.keys(updates).length > 1) transaction.update(userRef, updates);
        return { ...current, ...updates, uid: user.uid, email: user.email };
      }
      const accountTaken = await transaction.get(accountRef);
      if (accountTaken.exists) return null;
      const newProfile = {
        uid: user.uid,
        accountId,
        email: user.email,
        displayName: requestedName,
        photoURL: requestedPhoto,
        storageLimitBytes: DEFAULT_STORAGE_LIMIT_BYTES,
        usedStorageBytes: 0,
        storageLimit: DEFAULT_STORAGE_LIMIT_BYTES,
        storageUsed: 0,
        planType: 'Free',
        tier: 'free',
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp()
      };
      transaction.create(accountRef, { uid: user.uid, createdAt: FieldValue.serverTimestamp() });
      transaction.create(userRef, newProfile);
      return { ...newProfile, createdAt: now, updatedAt: now };
    });
    if (profile) return profileForClient(profile);
  }
  throw new ApiError(503, 'Could not allocate an account ID. Please retry.', 'ACCOUNT_ID_ALLOCATION_FAILED');
}

async function getProfile(user) {
  const snapshot = await db.collection('users').doc(user.uid).get();
  return snapshot.exists ? profileForClient({ ...snapshot.data(), uid: user.uid }) : bootstrapProfile(user);
}

async function ownedFile(fileId, uid) {
  const id = String(fileId || '').trim();
  if (!id || id.length > 128) throw new ApiError(400, 'Invalid file id.', 'INVALID_FILE_ID');
  const ref = db.collection('files').doc(id);
  const snapshot = await ref.get();
  if (!snapshot.exists || snapshot.data().ownerUid !== uid) {
    throw new ApiError(404, 'File not found.', 'FILE_NOT_FOUND');
  }
  return { ref, data: snapshot.data() };
}

const upload = multer({
  storage: multer.diskStorage({
    destination(req, file, callback) {
      try {
        const directory = userDirectory(req.user.uid);
        fs.mkdirSync(directory, { recursive: true });
        callback(null, directory);
      } catch (error) {
        callback(error);
      }
    },
    filename(req, file, callback) {
      const extension = path.extname(safeOriginalName(file.originalname)).slice(0, 20);
      callback(null, `${Date.now()}-${(crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex'))}${extension}`);
    }
  }),
  limits: { fileSize: MAX_FILE_SIZE, files: 1, fields: 10 },
  fileFilter(req, file, callback) {
    return !file.originalname || file.originalname.length > 500
      ? callback(new ApiError(400, 'Choose a valid file name.', 'INVALID_FILE_NAME'))
      : callback(null, true);
  }
});

// ==========================================
// PUBLIC & HEALTH ROUTES
// ==========================================
app.get('/api/health', (req, res) => {
  const isConfigured = Boolean(admin.apps && admin.apps.length > 0);
  res.json({
    status: 'ok',
    firebaseConfigured: isConfigured,
    timestamp: new Date().toISOString(),
    service: 'Zulora Drive API'
  });
});

app.get('/api/plans', (req, res) => {
  res.json({
    plans: Object.values(PLANS),
    paymentUpiId: PAYMENT_UPI_ID,
    supportEmail: ADMIN_EMAIL
  });
});

// ==========================================
// USER PROFILE & ACCOUNT ROUTES
// ==========================================
// GET /api/user/profile (Spec route) + GET /api/users/me (Alias)
const handleGetProfile = async (req, res, next) => {
  try {
    res.json({ profile: await getProfile(req.user) });
  } catch (error) {
    next(error);
  }
};
app.get('/api/user/profile', requireFirebase, authenticate, handleGetProfile);
app.get('/api/users/me', requireFirebase, authenticate, handleGetProfile);

app.post('/api/users/me/bootstrap', requireFirebase, authenticate, async (req, res, next) => {
  try {
    res.json({ profile: await bootstrapProfile(req.user, req.body || {}) });
  } catch (error) {
    next(error);
  }
});

const handleUpdateProfile = async (req, res, next) => {
  try {
    const displayName = String(req.body?.displayName || '').trim();
    if (displayName.length < 2 || displayName.length > 80) {
      throw new ApiError(400, 'Display name must be 2–80 characters.', 'INVALID_DISPLAY_NAME');
    }
    await db.collection('users').doc(req.user.uid).set({
      displayName,
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });
    res.json({ profile: await getProfile(req.user) });
  } catch (error) {
    next(error);
  }
};
app.patch('/api/user/profile', requireFirebase, authenticate, handleUpdateProfile);
app.patch('/api/users/me', requireFirebase, authenticate, handleUpdateProfile);

// ==========================================
// FILES MANAGEMENT ROUTES
// ==========================================
// GET /api/files/list (Spec route) + GET /api/files (Alias)
const handleListFiles = async (req, res, next) => {
  try {
    await getProfile(req.user);
    const snapshot = await db.collection('files').where('ownerUid', '==', req.user.uid).get();
    const files = snapshot.docs
      .map((doc) => fileForClient(doc.id, doc.data()))
      .sort((a, b) => new Date(b.uploadedAt || 0) - new Date(a.uploadedAt || 0));
    res.json({ files });
  } catch (error) {
    next(error);
  }
};
app.get('/api/files/list', requireFirebase, authenticate, handleListFiles);
app.get('/api/files', requireFirebase, authenticate, handleListFiles);

// POST /api/files/upload (Spec route) + POST /api/files (Alias)
const handleUploadFile = async (req, res, next) => {
  if (!req.file) return next(new ApiError(400, 'Attach one file to upload.', 'FILE_REQUIRED'));
  const removeUploadedFile = async () => fsp.unlink(req.file.path).catch(() => undefined);
  try {
    const fileRef = db.collection('files').doc();
    const originalName = safeOriginalName(req.file.originalname);
    const uploadedAt = new Date();

    await db.runTransaction(async (transaction) => {
      const profileRef = db.collection('users').doc(req.user.uid);
      const profileSnap = await transaction.get(profileRef);
      if (!profileSnap.exists) throw new ApiError(409, 'Your account is still being initialized. Please retry in a moment.', 'PROFILE_NOT_READY');

      const profileData = profileSnap.data();
      const used = extractStorageUsed(profileData);
      const limit = extractStorageLimit(profileData);

      // Enforce strict quota check dynamically reading Firestore limits
      if (used + req.file.size > limit) {
        const limitGb = (limit / GIB).toFixed(1);
        throw new ApiError(413, `Upload would exceed your storage quota of ${limitGb} GB. Upgrade your storage plan to continue.`, 'QUOTA_EXCEEDED');
      }

      const newUsed = used + req.file.size;
      transaction.set(fileRef, {
        ownerUid: req.user.uid,
        originalName,
        storedName: req.file.filename,
        size: req.file.size,
        mimetype: req.file.mimetype || 'application/octet-stream',
        isStarred: false,
        uploadedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp()
      });

      // Synchronize both usedStorageBytes and storageUsed fields
      transaction.update(profileRef, {
        usedStorageBytes: newUsed,
        storageUsed: newUsed,
        updatedAt: FieldValue.serverTimestamp()
      });
    });

    return res.status(201).json({
      file: fileForClient(fileRef.id, {
        originalName,
        size: req.file.size,
        mimetype: req.file.mimetype,
        isStarred: false,
        uploadedAt,
        updatedAt: uploadedAt
      })
    });
  } catch (error) {
    await removeUploadedFile();
    return next(error);
  }
};
app.post('/api/files/upload', requireFirebase, authenticate, upload.single('file'), handleUploadFile);
app.post('/api/files', requireFirebase, authenticate, upload.single('file'), handleUploadFile);

// PATCH /api/files/:id (Rename / Star)
app.patch('/api/files/:fileId', requireFirebase, authenticate, async (req, res, next) => {
  try {
    const { ref, data } = await ownedFile(req.params.fileId, req.user.uid);
    const updates = { updatedAt: FieldValue.serverTimestamp() };
    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'isStarred')) {
      updates.isStarred = Boolean(req.body.isStarred);
    }
    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'originalName')) {
      updates.originalName = safeOriginalName(req.body.originalName);
    }
    if (Object.keys(updates).length === 1) {
      throw new ApiError(400, 'No supported file changes provided.', 'EMPTY_UPDATE');
    }
    await ref.update(updates);
    res.json({ file: fileForClient(ref.id, { ...data, ...updates, updatedAt: new Date() }) });
  } catch (error) {
    next(error);
  }
});

// GET /api/files/:id/content or download
app.get(['/api/files/:fileId/content', '/api/files/:fileId/download'], requireFirebase, authenticate, async (req, res, next) => {
  try {
    const { data } = await ownedFile(req.params.fileId, req.user.uid);
    const directory = userDirectory(req.user.uid);
    const filePath = path.resolve(directory, path.basename(String(data.storedName || '')));
    if (!filePath.startsWith(`${directory}${path.sep}`) || !fs.existsSync(filePath)) {
      throw new ApiError(404, 'The stored file is unavailable on server disk.', 'STORAGE_FILE_NOT_FOUND');
    }
    const download = String(req.query.download || '') === '1' || req.path.endsWith('/download');
    res.setHeader('Content-Type', data.mimetype || 'application/octet-stream');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Disposition', `${download ? 'attachment' : 'inline'}; filename="${contentDispositionName(data.originalName)}"`);
    res.sendFile(filePath, { acceptRanges: true }, (error) => {
      if (error && !res.headersSent) next(error);
    });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/files/:id (Spec route) + DELETE /api/files/:fileId (Alias)
const handleDeleteFile = async (req, res, next) => {
  try {
    const targetFileId = req.params.id || req.params.fileId;
    const fileRef = db.collection('files').doc(String(targetFileId || ''));
    let deletedFile;

    await db.runTransaction(async (transaction) => {
      const profileRef = db.collection('users').doc(req.user.uid);
      const [fileSnap, profileSnap] = await Promise.all([
        transaction.get(fileRef),
        transaction.get(profileRef)
      ]);

      if (!fileSnap.exists || fileSnap.data().ownerUid !== req.user.uid) {
        throw new ApiError(404, 'File not found.', 'FILE_NOT_FOUND');
      }
      if (!profileSnap.exists) {
        throw new ApiError(409, 'User profile not found.', 'PROFILE_NOT_READY');
      }

      deletedFile = fileSnap.data();
      transaction.delete(fileRef);

      const currentUsed = extractStorageUsed(profileSnap.data());
      const newUsed = Math.max(0, currentUsed - Number(deletedFile.size || 0));

      transaction.update(profileRef, {
        usedStorageBytes: newUsed,
        storageUsed: newUsed,
        updatedAt: FieldValue.serverTimestamp()
      });
    });

    const directory = userDirectory(req.user.uid);
    const diskPath = path.resolve(directory, path.basename(String(deletedFile.storedName || '')));
    if (diskPath.startsWith(`${directory}${path.sep}`)) {
      await fsp.unlink(diskPath).catch(() => undefined);
    }

    res.status(204).end();
  } catch (error) {
    next(error);
  }
};
app.delete('/api/files/:id', requireFirebase, authenticate, handleDeleteFile);
app.delete('/api/files/:fileId', requireFirebase, authenticate, handleDeleteFile);

// ==========================================
// UPGRADE & UPI PAYMENT ROUTES
// ==========================================
app.post('/api/upgrade-requests', requireFirebase, authenticate, async (req, res, next) => {
  try {
    const plan = planFromKey(req.body?.plan);
    if (plan.key === 'free') {
      throw new ApiError(400, 'The Free tier does not require payment.', 'FREE_PLAN');
    }
    const profile = await getProfile(req.user);
    const requestRef = db.collection('upgradeRequests').doc();
    await requestRef.set({
      userUid: req.user.uid,
      accountId: profile.accountId,
      email: req.user.email,
      plan: plan.key,
      planLabel: plan.label,
      amount: plan.price,
      storageLimitBytes: plan.storageLimitBytes,
      paymentReference: String(req.body?.paymentReference || req.body?.utr || '').trim().slice(0, 80),
      upiId: PAYMENT_UPI_ID,
      status: 'pending',
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    });
    res.status(201).json({
      requestId: requestRef.id,
      status: 'pending',
      upiId: PAYMENT_UPI_ID,
      amount: plan.price,
      message: 'Upgrade request recorded. Storage will be activated upon verification.'
    });
  } catch (error) {
    next(error);
  }
});

app.post('/api/payments/upi', requireFirebase, authenticate, async (req, res, next) => {
  try {
    const { amount, plan, utr } = req.body;
    if (!amount) throw new ApiError(400, 'Amount is required.', 'INVALID_INPUT');
    const profile = await getProfile(req.user);
    const requestRef = db.collection('upgradeRequests').doc();
    await requestRef.set({
      userUid: req.user.uid,
      email: req.user.email,
      accountId: profile.accountId,
      amount: Number(amount),
      plan: String(plan || 'custom'),
      paymentReference: String(utr || '').trim(),
      upiId: PAYMENT_UPI_ID,
      status: 'pending',
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    });
    res.json({
      status: 'ok',
      upiId: PAYMENT_UPI_ID,
      amount,
      requestId: requestRef.id
    });
  } catch (err) {
    next(err);
  }
});

// ==========================================
// ADMIN DASHBOARD ROUTES
// ==========================================
app.get('/api/admin/overview', requireFirebase, authenticate, requireAdmin, async (req, res, next) => {
  try {
    const [usersSnap, filesSnap, requestsSnap] = await Promise.all([
      db.collection('users').get(),
      db.collection('files').get(),
      db.collection('upgradeRequests').where('status', '==', 'pending').get()
    ]);
    let totalStorageUsed = 0;
    usersSnap.forEach((doc) => {
      totalStorageUsed += extractStorageUsed(doc.data());
    });
    res.json({
      users: usersSnap.size,
      files: filesSnap.size,
      storageUsed: totalStorageUsed,
      pendingUpgradeRequests: requestsSnap.size
    });
  } catch (error) {
    next(error);
  }
});

app.get('/api/admin/users', requireFirebase, authenticate, requireAdmin, async (req, res, next) => {
  try {
    const snapshot = await db.collection('users').get();
    const users = snapshot.docs
      .map((doc) => profileForClient({ ...doc.data(), uid: doc.id }))
      .sort((a, b) => (a.email || '').localeCompare(b.email || ''));
    res.json({ users });
  } catch (error) {
    next(error);
  }
});

app.get('/api/admin/files', requireFirebase, authenticate, requireAdmin, async (req, res, next) => {
  try {
    const snapshot = await db.collection('files').get();
    const files = snapshot.docs.map((doc) => {
      const data = fileForClient(doc.id, doc.data());
      return {
        ...data,
        ownerUid: doc.data().ownerUid,
        storageFolder: `uploads/${asSafeSegment(doc.data().ownerUid)}`
      };
    }).sort((a, b) => new Date(b.uploadedAt || 0) - new Date(a.uploadedAt || 0));
    res.json({ files });
  } catch (error) {
    next(error);
  }
});

app.delete('/api/admin/files/:fileId', requireFirebase, authenticate, requireAdmin, async (req, res, next) => {
  try {
    const fileRef = db.collection('files').doc(String(req.params.fileId || ''));
    let deletedFile;
    await db.runTransaction(async (transaction) => {
      const fileSnap = await transaction.get(fileRef);
      if (!fileSnap.exists) throw new ApiError(404, 'File not found.', 'FILE_NOT_FOUND');
      deletedFile = fileSnap.data();
      const profileRef = db.collection('users').doc(deletedFile.ownerUid);
      const profileSnap = await transaction.get(profileRef);
      transaction.delete(fileRef);
      if (profileSnap.exists) {
        const currentUsed = extractStorageUsed(profileSnap.data());
        const newUsed = Math.max(0, currentUsed - Number(deletedFile.size || 0));
        transaction.update(profileRef, {
          usedStorageBytes: newUsed,
          storageUsed: newUsed,
          updatedAt: FieldValue.serverTimestamp()
        });
      }
    });
    const directory = userDirectory(deletedFile.ownerUid);
    const diskPath = path.resolve(directory, path.basename(String(deletedFile.storedName || '')));
    if (diskPath.startsWith(`${directory}${path.sep}`)) {
      await fsp.unlink(diskPath).catch(() => undefined);
    }
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

// Admin direct quota update: POST /api/admin/update-quota
app.post('/api/admin/update-quota', requireFirebase, authenticate, requireAdmin, async (req, res, next) => {
  try {
    const targetUid = String(req.body?.uid || '').trim();
    if (!targetUid) throw new ApiError(400, 'Provide a valid user uid.', 'INVALID_USER');
    const gigabytes = Number(req.body?.storageLimitGb);
    if (!Number.isFinite(gigabytes) || gigabytes < 1 || gigabytes > 50000) {
      throw new ApiError(400, 'storageLimitGb must be a number between 1 and 50,000.', 'INVALID_QUOTA');
    }
    const targetRef = db.collection('users').doc(targetUid);
    const targetSnap = await targetRef.get();
    if (!targetSnap.exists) throw new ApiError(404, 'User not found in Firestore.', 'USER_NOT_FOUND');

    const newLimit = Math.floor(gigabytes * GIB);
    await targetRef.update({
      storageLimitBytes: newLimit,
      storageLimit: newLimit,
      planType: newLimit > DEFAULT_STORAGE_LIMIT_BYTES ? 'Pro' : 'Free',
      tier: newLimit > DEFAULT_STORAGE_LIMIT_BYTES ? 'pro' : 'free',
      updatedAt: FieldValue.serverTimestamp()
    });

    const updated = (await targetRef.get()).data();
    res.json({
      success: true,
      profile: profileForClient({ ...updated, uid: targetUid })
    });
  } catch (error) {
    next(error);
  }
});

app.get('/api/admin/upgrade-requests', requireFirebase, authenticate, requireAdmin, async (req, res, next) => {
  try {
    const snapshot = await db.collection('upgradeRequests').get();
    const requests = snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        createdAt: timestampToIso(data.createdAt),
        updatedAt: timestampToIso(data.updatedAt)
      };
    }).sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
    res.json({ requests });
  } catch (error) {
    next(error);
  }
});

app.patch('/api/admin/upgrade-requests/:requestId', requireFirebase, authenticate, requireAdmin, async (req, res, next) => {
  try {
    const status = String(req.body?.status || '').toLowerCase();
    if (!['approved', 'rejected'].includes(status)) {
      throw new ApiError(400, 'Status must be approved or rejected.', 'INVALID_STATUS');
    }
    const requestRef = db.collection('upgradeRequests').doc(String(req.params.requestId || ''));
    await db.runTransaction(async (transaction) => {
      const requestSnap = await transaction.get(requestRef);
      if (!requestSnap.exists) throw new ApiError(404, 'Upgrade request not found.', 'REQUEST_NOT_FOUND');
      const request = requestSnap.data();
      transaction.update(requestRef, {
        status,
        reviewedBy: req.user.email,
        reviewedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp()
      });
      if (status === 'approved') {
        const plan = planFromKey(request.plan);
        transaction.update(db.collection('users').doc(request.userUid), {
          storageLimitBytes: plan.storageLimitBytes,
          storageLimit: plan.storageLimitBytes,
          planType: 'Pro',
          tier: plan.key,
          updatedAt: FieldValue.serverTimestamp()
        });
      }
    });
    res.json({ success: true, status });
  } catch (error) {
    next(error);
  }
});

// Serve frontend static assets in local/standalone mode
app.use(express.static(FRONTEND_ROOT, {
  extensions: ['html'],
  index: 'index.html',
  maxAge: process.env.NODE_ENV === 'production' ? '1h' : 0
}));

// 404 handler for API routes
app.use('/api', (req, res, next) => {
  next(new ApiError(404, `API route not found: ${req.method} ${req.originalUrl || req.url}`, 'ROUTE_NOT_FOUND'));
});

// Global error handler
app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    const message = error.code === 'LIMIT_FILE_SIZE'
      ? `Each file must be ${Math.floor(MAX_FILE_SIZE / 1024 / 1024)} MB or smaller.`
      : 'Upload request is invalid.';
    return res.status(400).json({ error: message, code: error.code });
  }
  const status = Number(error.status) || 500;
  if (status >= 500) {
    console.error('Unhandled server error:', error);
  }
  return res.status(status).json({
    error: status >= 500 ? 'An unexpected server error occurred.' : error.message,
    code: error.code || 'INTERNAL_ERROR'
  });
});

if (require.main === module) {
  app.listen(PORT, () => console.info(`Zulora Drive API listening on http://localhost:${PORT}`));
}

module.exports = app;
