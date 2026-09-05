'use strict';

/**
 * Zulora Drive API
 * Firebase Authentication establishes identity; Firestore stores metadata and
 * quotas; the local uploads/<firebase uid> tree stores file bytes. Uploads are
 * intentionally never exposed as a public static directory.
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

// Ensure admin.apps getter is defined across all firebase-admin SDK versions
if (!admin.apps) {
  Object.defineProperty(admin, 'apps', {
    get: () => (typeof getApps === 'function' ? getApps() : (admin.getApps ? admin.getApps() : []))
  });
}
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');

const app = express();
const PORT = Number(process.env.PORT || 5000);
const ADMIN_EMAIL = 'zulora.help@gmail.com';
const PAYMENT_UPI_ID = 'shivenpanwar@fam';
const GIB = 1024 ** 3;
const MAX_FILE_SIZE = Number(process.env.MAX_FILE_SIZE_BYTES || 500 * 1024 * 1024);
const UPLOAD_ROOT = path.resolve(process.env.UPLOAD_DIR || (process.env.VERCEL ? path.join('/tmp', 'uploads') : path.join(__dirname, 'uploads')));
const FRONTEND_ROOT = path.resolve(__dirname, '..', 'frontend');

const PLANS = Object.freeze({
  starter: { key: 'starter', label: 'Starter', price: 0, storageLimit: 10 * GIB },
  storage_lite: { key: 'storage_lite', label: 'Storage Lite', price: 70, storageLimit: 50 * GIB },
  business_pro: { key: 'business_pro', label: 'Business Pro', price: 140, storageLimit: 100 * GIB },
  ultra_max: { key: 'ultra_max', label: 'Ultra Max', price: 240, storageLimit: 200 * GIB }
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
  if (!directory.startsWith(`${UPLOAD_ROOT}${path.sep}`)) {
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

function profileForClient(profile) {
  return {
    uid: profile.uid,
    accountId: profile.accountId,
    email: profile.email,
    displayName: profile.displayName || '',
    photoURL: profile.photoURL || '',
    tier: profile.tier || PLANS.starter.key,
    storageUsed: Number(profile.storageUsed || 0),
    storageLimit: Number(profile.storageLimit || PLANS.starter.storageLimit),
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
  const plan = PLANS[String(key || '').toLowerCase()];
  if (!plan) throw new ApiError(400, 'Select a valid storage plan.', 'INVALID_PLAN');
  return plan;
}

// Firebase Admin is deliberately required for authenticated API endpoints.
let db;
let firebaseReady = false;

function getServiceAccountCredentials() {
  let serviceAccount = null;

  // 1. Check for process.env.FIREBASE_SERVICE_ACCOUNT (and common aliases)
  const envRaw = process.env.FIREBASE_SERVICE_ACCOUNT
    || process.env.FIREBASE_SERVICE_ACCOUNT_KEY
    || process.env.FIREBASE_CREDENTIALS;

  if (envRaw) {
    let raw = envRaw;
    // 2. Parse it cleanly using JSON.parse() if it's a string
    if (typeof raw === 'string') {
      let trimmed = raw.trim();
      // Handle edge case if wrapped in single quotes
      if (trimmed.startsWith("'") && trimmed.endsWith("'")) {
        trimmed = trimmed.slice(1, -1).trim();
      }
      try {
        serviceAccount = JSON.parse(trimmed);
      } catch (parseError) {
        // Fallback: try base64 decode if env var is base64-encoded
        try {
          serviceAccount = JSON.parse(Buffer.from(trimmed, 'base64').toString('utf8'));
        } catch {
          console.warn('Failed to parse FIREBASE_SERVICE_ACCOUNT as JSON string:', parseError.message);
        }
      }
    } else if (typeof raw === 'object' && raw !== null) {
      serviceAccount = raw;
    }
  }

  // 3. If environment variable is missing, fallback safely to ./serviceAccountKey.json
  if (!serviceAccount) {
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
          serviceAccount = JSON.parse(fs.readFileSync(filePath, 'utf8'));
          console.info(`Loaded Firebase credentials from ${filePath}`);
          break;
        } catch (fileErr) {
          console.warn(`Could not read ${filePath}:`, fileErr.message);
        }
      }
    }
  }

  // Sanitize private key escaped newlines if present (\n -> actual newline)
  if (serviceAccount && typeof serviceAccount.private_key === 'string') {
    serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
  }

  return serviceAccount;
}

try {
  const serviceAccount = getServiceAccountCredentials();
  if (serviceAccount) {
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

app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"], baseUri: ["'self'"], objectSrc: ["'none'"],
      scriptSrc: ["'self'", 'https://www.gstatic.com', 'https://cdnjs.cloudflare.com'],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com', 'https://cdnjs.cloudflare.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com', 'https://cdnjs.cloudflare.com', 'data:'],
      imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
      connectSrc: ["'self'", 'https://identitytoolkit.googleapis.com', 'https://securetoken.googleapis.com', 'https://www.googleapis.com', 'https://firestore.googleapis.com'],
      frameSrc: ["'self'", 'https://accounts.google.com']
    }
  }
}));
const CORS_ALLOWED_ORIGINS = [
  'https://drive.zulora.in',
  'https://zulora.in',
  'https://zulora-drive.vercel.app',
  'http://localhost:3000',
  'http://localhost:5000',
  'http://127.0.0.1:3000'
];
app.use(cors({
  origin(origin, callback) {
    // Allow requests with no origin (server-to-server, curl, mobile apps).
    if (!origin) return callback(null, true);
    const normalized = origin.replace(/\/$/, '').toLowerCase();
    if (
      CORS_ALLOWED_ORIGINS.includes(normalized) ||
      normalized.endsWith('.zulora.in') ||
      normalized.endsWith('.vercel.app')
    ) {
      return callback(null, true);
    }
    return callback(new ApiError(403, `Origin ${origin} is not allowed by CORS policy.`, 'CORS_BLOCKED'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Authorization', 'Content-Type', 'Bypass-Tunnel-Reminder'],
  maxAge: 86400
}));
app.use(express.json({ limit: '100kb' }));
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

function requireFirebase(req, res, next) {
  const isConfigured = Boolean((admin.apps && admin.apps.length > 0) || firebaseReady);
  if (!isConfigured) {
    return next(new ApiError(503, 'Server authentication is not configured. Add Firebase Admin credentials before using the API.', 'FIREBASE_NOT_CONFIGURED'));
  }
  return next();
}

async function authenticate(req, res, next) {
  try {
    const match = (req.get('authorization') || '').match(/^Bearer\s+(.+)$/i);
    if (!match) throw new ApiError(401, 'A Firebase ID token is required.', 'AUTH_REQUIRED');
    const token = await getAuth().verifyIdToken(match[1], true);
    if (!token.uid || !token.email) throw new ApiError(401, 'A verified email address is required.', 'EMAIL_REQUIRED');
    req.user = { uid: token.uid, email: normalizeEmail(token.email), name: token.name || '', picture: token.picture || '' };
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
        uid: user.uid, accountId, email: user.email, displayName: requestedName, photoURL: requestedPhoto,
        tier: PLANS.starter.key, storageUsed: 0, storageLimit: PLANS.starter.storageLimit,
        createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp()
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
  return snapshot.exists ? profileForClient(snapshot.data()) : bootstrapProfile(user);
}

async function ownedFile(fileId, uid) {
  const id = String(fileId || '').trim();
  if (!id || id.length > 128) throw new ApiError(400, 'Invalid file id.', 'INVALID_FILE_ID');
  const ref = db.collection('files').doc(id);
  const snapshot = await ref.get();
  if (!snapshot.exists || snapshot.data().ownerUid !== uid) throw new ApiError(404, 'File not found.', 'FILE_NOT_FOUND');
  return { ref, data: snapshot.data() };
}

const upload = multer({
  storage: multer.diskStorage({
    destination(req, file, callback) {
      try {
        const directory = userDirectory(req.user.uid);
        fs.mkdirSync(directory, { recursive: true });
        callback(null, directory);
      } catch (error) { callback(error); }
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

app.use((req, res, next) => {
  if (process.env.VERCEL && req.url && !req.url.startsWith('/api')) {
    req.url = '/api' + (req.url.startsWith('/') ? req.url : '/' + req.url);
  }
  next();
});

app.get('/api/health', (req, res) => {
  const isConfigured = Boolean(admin.apps && admin.apps.length > 0);
  res.json({
    status: 'ok',
    firebaseConfigured: isConfigured,
    timestamp: new Date().toISOString()
  });
});
app.get('/api/plans', (req, res) => res.json({
  plans: Object.values(PLANS).map((plan) => ({ ...plan, storageLimitGb: plan.storageLimit / GIB })), paymentUpiId: PAYMENT_UPI_ID
}));

app.post('/api/users/me/bootstrap', requireFirebase, authenticate, async (req, res, next) => {
  try { res.json({ profile: await bootstrapProfile(req.user, req.body || {}) }); } catch (error) { next(error); }
});
app.get('/api/users/me', requireFirebase, authenticate, async (req, res, next) => {
  try { res.json({ profile: await getProfile(req.user) }); } catch (error) { next(error); }
});
app.patch('/api/users/me', requireFirebase, authenticate, async (req, res, next) => {
  try {
    const displayName = String(req.body?.displayName || '').trim();
    if (displayName.length < 2 || displayName.length > 80) throw new ApiError(400, 'Display name must be 2–80 characters.', 'INVALID_DISPLAY_NAME');
    await db.collection('users').doc(req.user.uid).set({ displayName, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    res.json({ profile: await getProfile(req.user) });
  } catch (error) { next(error); }
});

app.get('/api/files', requireFirebase, authenticate, async (req, res, next) => {
  try {
    await getProfile(req.user);
    const snapshot = await db.collection('files').where('ownerUid', '==', req.user.uid).get();
    const files = snapshot.docs.map((doc) => fileForClient(doc.id, doc.data()))
      .sort((a, b) => new Date(b.uploadedAt || 0) - new Date(a.uploadedAt || 0));
    res.json({ files });
  } catch (error) { next(error); }
});

app.post('/api/files', requireFirebase, authenticate, upload.single('file'), async (req, res, next) => {
  if (!req.file) return next(new ApiError(400, 'Attach one file to upload.', 'FILE_REQUIRED'));
  const removeUploadedFile = async () => fsp.unlink(req.file.path).catch(() => undefined);
  try {
    const fileRef = db.collection('files').doc();
    const originalName = safeOriginalName(req.file.originalname);
    const uploadedAt = new Date();
    await db.runTransaction(async (transaction) => {
      const profileRef = db.collection('users').doc(req.user.uid);
      const profileSnap = await transaction.get(profileRef);
      if (!profileSnap.exists) throw new ApiError(409, 'Your account is still being set up. Retry the upload.', 'PROFILE_NOT_READY');
      const profile = profileSnap.data();
      const used = Number(profile.storageUsed || 0);
      const limit = Number(profile.storageLimit || PLANS.starter.storageLimit);
      if (used + req.file.size > limit) throw new ApiError(413, 'This upload would exceed your storage quota. Upgrade your plan to continue.', 'QUOTA_EXCEEDED');
      transaction.set(fileRef, {
        ownerUid: req.user.uid, originalName, storedName: req.file.filename, size: req.file.size,
        mimetype: req.file.mimetype || 'application/octet-stream', isStarred: false,
        uploadedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp()
      });
      transaction.update(profileRef, { storageUsed: used + req.file.size, updatedAt: FieldValue.serverTimestamp() });
    });
    return res.status(201).json({ file: fileForClient(fileRef.id, {
      originalName, size: req.file.size, mimetype: req.file.mimetype, isStarred: false, uploadedAt, updatedAt: uploadedAt
    }) });
  } catch (error) {
    await removeUploadedFile();
    return next(error);
  }
});

app.patch('/api/files/:fileId', requireFirebase, authenticate, async (req, res, next) => {
  try {
    const { ref, data } = await ownedFile(req.params.fileId, req.user.uid);
    const updates = { updatedAt: FieldValue.serverTimestamp() };
    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'isStarred')) updates.isStarred = Boolean(req.body.isStarred);
    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'originalName')) updates.originalName = safeOriginalName(req.body.originalName);
    if (Object.keys(updates).length === 1) throw new ApiError(400, 'No supported file changes were provided.', 'EMPTY_UPDATE');
    await ref.update(updates);
    res.json({ file: fileForClient(ref.id, { ...data, ...updates, updatedAt: new Date() }) });
  } catch (error) { next(error); }
});

app.get('/api/files/:fileId/content', requireFirebase, authenticate, async (req, res, next) => {
  try {
    const { data } = await ownedFile(req.params.fileId, req.user.uid);
    const directory = userDirectory(req.user.uid);
    const filePath = path.resolve(directory, path.basename(String(data.storedName || '')));
    if (!filePath.startsWith(`${directory}${path.sep}`) || !fs.existsSync(filePath)) throw new ApiError(404, 'The stored file is unavailable.', 'STORAGE_FILE_NOT_FOUND');
    const download = String(req.query.download || '') === '1';
    res.setHeader('Content-Type', data.mimetype || 'application/octet-stream');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Disposition', `${download ? 'attachment' : 'inline'}; filename="${contentDispositionName(data.originalName)}"`);
    res.sendFile(filePath, { acceptRanges: true }, (error) => { if (error && !res.headersSent) next(error); });
  } catch (error) { next(error); }
});

app.delete('/api/files/:fileId', requireFirebase, authenticate, async (req, res, next) => {
  try {
    const fileRef = db.collection('files').doc(String(req.params.fileId || ''));
    let deletedFile;
    await db.runTransaction(async (transaction) => {
      const profileRef = db.collection('users').doc(req.user.uid);
      const [fileSnap, profileSnap] = await Promise.all([transaction.get(fileRef), transaction.get(profileRef)]);
      if (!fileSnap.exists || fileSnap.data().ownerUid !== req.user.uid) throw new ApiError(404, 'File not found.', 'FILE_NOT_FOUND');
      if (!profileSnap.exists) throw new ApiError(409, 'User profile not found.', 'PROFILE_NOT_READY');
      deletedFile = fileSnap.data();
      transaction.delete(fileRef);
      transaction.update(profileRef, {
        storageUsed: Math.max(0, Number(profileSnap.data().storageUsed || 0) - Number(deletedFile.size || 0)),
        updatedAt: FieldValue.serverTimestamp()
      });
    });
    const directory = userDirectory(req.user.uid);
    const diskPath = path.resolve(directory, path.basename(String(deletedFile.storedName || '')));
    if (diskPath.startsWith(`${directory}${path.sep}`)) await fsp.unlink(diskPath).catch(() => undefined);
    res.status(204).end();
  } catch (error) { next(error); }
});

app.post('/api/upgrade-requests', requireFirebase, authenticate, async (req, res, next) => {
  try {
    const plan = planFromKey(req.body?.plan);
    if (plan.key === PLANS.starter.key) throw new ApiError(400, 'The Starter plan does not require a payment request.', 'FREE_PLAN');
    const profile = await getProfile(req.user);
    const requestRef = db.collection('upgradeRequests').doc();
    await requestRef.set({
      userUid: req.user.uid, accountId: profile.accountId, email: req.user.email, plan: plan.key, amount: plan.price,
      paymentReference: String(req.body?.paymentReference || '').trim().slice(0, 80), status: 'pending',
      createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp()
    });
    res.status(201).json({ requestId: requestRef.id, status: 'pending' });
  } catch (error) { next(error); }
});

app.get('/api/admin/overview', requireFirebase, authenticate, requireAdmin, async (req, res, next) => {
  try {
    const [users, files, requests] = await Promise.all([
      db.collection('users').get(), db.collection('files').get(), db.collection('upgradeRequests').where('status', '==', 'pending').get()
    ]);
    let storageUsed = 0;
    users.forEach((doc) => { storageUsed += Number(doc.data().storageUsed || 0); });
    res.json({ users: users.size, files: files.size, storageUsed, pendingUpgradeRequests: requests.size });
  } catch (error) { next(error); }
});

app.get('/api/admin/users', requireFirebase, authenticate, requireAdmin, async (req, res, next) => {
  try {
    const snapshot = await db.collection('users').get();
    const users = snapshot.docs.map((doc) => profileForClient(doc.data())).sort((a, b) => (a.email || '').localeCompare(b.email || ''));
    res.json({ users });
  } catch (error) { next(error); }
});

// This is an authenticated, logical view of the local storage tree. Raw files
// are still only streamed through the owner-authorized content endpoint.
app.get('/api/admin/files', requireFirebase, authenticate, requireAdmin, async (req, res, next) => {
  try {
    const snapshot = await db.collection('files').get();
    const files = snapshot.docs.map((doc) => {
      const data = fileForClient(doc.id, doc.data());
      return { ...data, ownerUid: doc.data().ownerUid, storageFolder: `uploads/${asSafeSegment(doc.data().ownerUid)}` };
    }).sort((a, b) => new Date(b.uploadedAt || 0) - new Date(a.uploadedAt || 0));
    res.json({ files });
  } catch (error) { next(error); }
});

app.get('/api/admin/files/:fileId/content', requireFirebase, authenticate, requireAdmin, async (req, res, next) => {
  try {
    const fileRef = db.collection('files').doc(String(req.params.fileId || ''));
    const fileSnap = await fileRef.get();
    if (!fileSnap.exists) throw new ApiError(404, 'File not found.', 'FILE_NOT_FOUND');
    const data = fileSnap.data();
    const directory = userDirectory(data.ownerUid);
    const filePath = path.resolve(directory, path.basename(String(data.storedName || '')));
    if (!filePath.startsWith(`${directory}${path.sep}`) || !fs.existsSync(filePath)) {
      throw new ApiError(404, 'The stored file is unavailable.', 'STORAGE_FILE_NOT_FOUND');
    }
    const download = String(req.query.download || '') === '1';
    res.setHeader('Content-Type', data.mimetype || 'application/octet-stream');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Disposition', `${download ? 'attachment' : 'inline'}; filename="${contentDispositionName(data.originalName)}"`);
    res.sendFile(filePath, { acceptRanges: true }, (error) => { if (error && !res.headersSent) next(error); });
  } catch (error) { next(error); }
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
        transaction.update(profileRef, {
          storageUsed: Math.max(0, Number(profileSnap.data().storageUsed || 0) - Number(deletedFile.size || 0)),
          updatedAt: FieldValue.serverTimestamp()
        });
      }
    });
    const directory = userDirectory(deletedFile.ownerUid);
    const diskPath = path.resolve(directory, path.basename(String(deletedFile.storedName || '')));
    if (diskPath.startsWith(`${directory}${path.sep}`)) await fsp.unlink(diskPath).catch(() => undefined);
    res.status(204).end();
  } catch (error) { next(error); }
});

app.patch('/api/admin/users/:uid', requireFirebase, authenticate, requireAdmin, async (req, res, next) => {
  try {
    const targetUid = String(req.params.uid || '').trim();
    if (!targetUid || targetUid.length > 256) throw new ApiError(400, 'Invalid target user.', 'INVALID_USER');
    const targetRef = db.collection('users').doc(targetUid);
    if (!(await targetRef.get()).exists) throw new ApiError(404, 'User not found.', 'USER_NOT_FOUND');
    const updates = { updatedAt: FieldValue.serverTimestamp() };
    if (req.body?.plan) {
      const plan = planFromKey(req.body.plan);
      updates.tier = plan.key;
      updates.storageLimit = plan.storageLimit;
    }
    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'storageLimitGb')) {
      const gigabytes = Number(req.body.storageLimitGb);
      if (!Number.isFinite(gigabytes) || gigabytes < 10 || gigabytes > 5000) throw new ApiError(400, 'Storage quota must be between 10 and 5,000 GB.', 'INVALID_QUOTA');
      updates.storageLimit = Math.floor(gigabytes * GIB);
      if (!req.body?.plan) updates.tier = 'custom';
    }
    if (Object.keys(updates).length === 1) throw new ApiError(400, 'Provide a plan or storage quota.', 'EMPTY_UPDATE');
    await targetRef.update(updates);
    res.json({ profile: profileForClient((await targetRef.get()).data()) });
  } catch (error) { next(error); }
});

// Dedicated quota-update endpoint per spec: POST /api/admin/update-quota
// Accepts { uid, storageLimitGb } — allows admin to set any user's quota directly.
app.post('/api/admin/update-quota', requireFirebase, authenticate, requireAdmin, async (req, res, next) => {
  try {
    const targetUid = String(req.body?.uid || '').trim();
    if (!targetUid || targetUid.length > 256) throw new ApiError(400, 'Provide a valid user uid.', 'INVALID_USER');
    const gigabytes = Number(req.body?.storageLimitGb);
    if (!Number.isFinite(gigabytes) || gigabytes < 1 || gigabytes > 5000) {
      throw new ApiError(400, 'storageLimitGb must be a number between 1 and 5,000.', 'INVALID_QUOTA');
    }
    const targetRef = db.collection('users').doc(targetUid);
    const targetSnap = await targetRef.get();
    if (!targetSnap.exists) throw new ApiError(404, 'User not found.', 'USER_NOT_FOUND');
    const newLimit = Math.floor(gigabytes * GIB);
    await targetRef.update({
      storageLimit: newLimit,
      tier: 'custom',
      updatedAt: FieldValue.serverTimestamp()
    });
    const updated = (await targetRef.get()).data();
    res.json({
      success: true,
      profile: profileForClient({ ...updated, uid: targetUid })
    });
  } catch (error) { next(error); }
});

app.get('/api/admin/upgrade-requests', requireFirebase, authenticate, requireAdmin, async (req, res, next) => {
  try {
    const snapshot = await db.collection('upgradeRequests').get();
    const requests = snapshot.docs.map((doc) => {
      const data = doc.data();
      return { id: doc.id, ...data, createdAt: timestampToIso(data.createdAt), updatedAt: timestampToIso(data.updatedAt) };
    }).sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
    res.json({ requests });
  } catch (error) { next(error); }
});

app.patch('/api/admin/upgrade-requests/:requestId', requireFirebase, authenticate, requireAdmin, async (req, res, next) => {
  try {
    const status = String(req.body?.status || '').toLowerCase();
    if (!['approved', 'rejected'].includes(status)) throw new ApiError(400, 'Status must be approved or rejected.', 'INVALID_STATUS');
    const requestRef = db.collection('upgradeRequests').doc(String(req.params.requestId || ''));
    await db.runTransaction(async (transaction) => {
      const requestSnap = await transaction.get(requestRef);
      if (!requestSnap.exists) throw new ApiError(404, 'Upgrade request not found.', 'REQUEST_NOT_FOUND');
      const request = requestSnap.data();
      transaction.update(requestRef, {
        status, reviewedBy: req.user.email, reviewedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp()
      });
      if (status === 'approved') {
        const plan = planFromKey(request.plan);
        transaction.update(db.collection('users').doc(request.userUid), {
          tier: plan.key, storageLimit: plan.storageLimit, updatedAt: FieldValue.serverTimestamp()
        });
      }
    });
    res.json({ success: true, status });
  } catch (error) { next(error); }
});

// Serve the client application, but never the uploads tree.
app.use(express.static(FRONTEND_ROOT, {
  extensions: ['html'], index: 'index.html', maxAge: process.env.NODE_ENV === 'production' ? '1h' : 0
}));
app.use('/api', (req, res, next) => next(new ApiError(404, 'API route not found.', 'ROUTE_NOT_FOUND')));

app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    const message = error.code === 'LIMIT_FILE_SIZE' ? `Each file must be ${Math.floor(MAX_FILE_SIZE / 1024 / 1024)} MB or smaller.` : 'Upload request is invalid.';
    return res.status(400).json({ error: message, code: error.code });
  }
  const status = Number(error.status) || 500;
  if (status >= 500) console.error(error);
  return res.status(status).json({ error: status >= 500 ? 'An unexpected server error occurred.' : error.message, code: error.code || 'INTERNAL_ERROR' });
});

if (require.main === module) app.listen(PORT, () => console.info(`Zulora Drive API listening on http://localhost:${PORT}`));
module.exports = app;
