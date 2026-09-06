'use strict';

/**
 * Zulora Drive — Production Express API Server
 *
 * Features:
 *   • Firebase Admin authentication & token verification
 *   • Firestore user profiles with username, accountId, referrals & storage quotas
 *   • Multer file upload pipeline with strict per-user quota enforcement
 *   • Isolated physical disk storage: backend/uploads/{uid}/
 *   • Firestore metadata tracking under users/{uid}/files & legacy files collection
 *   • Automated Referral & Storage Bonus System (+5GB bonus to both users)
 *   • Monthly storage plans (50GB/100GB/200GB/500GB)
 *   • Full admin control panel routes
 *   • Vercel serverless compatible
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

// Compat shim: ensure admin.apps works across all SDK versions
if (!admin.apps) {
  Object.defineProperty(admin, 'apps', {
    get: () => (typeof getApps === 'function' ? getApps() : [])
  });
}

// =============================================
// CONSTANTS
// =============================================
const app = express();
const PORT = Number(process.env.PORT || 5000);
const ADMIN_EMAIL = 'zulora.help@gmail.com';
const PAYMENT_UPI_ID = 'shivenpanwar@fam';
const SUPPORT_PHONE = '+91 6395211325';
const SUPPORT_WHATSAPP = 'https://wa.me/916395211325?text=Hi%20Zulora%20Drive%20Support';
const APP_DOMAIN = process.env.APP_DOMAIN || 'https://drive.zulora.in';

const GIB = 1024 ** 3;
const DEFAULT_STORAGE_LIMIT_BYTES = 10 * GIB;   // 10 GB default
const REFERRAL_BONUS_BYTES = Number(process.env.REFERRAL_BONUS_BYTES || 5 * GIB); // 5 GB bonus per referral
const MAX_FILE_SIZE = Number(process.env.MAX_FILE_SIZE_BYTES || 500 * 1024 * 1024); // 500 MB max per file

const UPLOAD_ROOT = path.resolve(
  process.env.UPLOAD_DIR || (process.env.VERCEL ? '/tmp/uploads' : path.join(__dirname, 'uploads'))
);
const FRONTEND_ROOT = path.resolve(__dirname, '..', 'frontend');

// =============================================
// STORAGE PLANS
// =============================================
const PLANS = Object.freeze({
  free: {
    key: 'free', label: 'Starter Free', price: 0,
    storageLimitBytes: 10 * GIB, storageLimitGb: 10,
    features: ['10 GB Storage', 'Real-Time Usage Monitor', 'End-to-End Encryption', 'Free Referral Bonus']
  },
  plan_50gb: {
    key: 'plan_50gb', label: '50 GB Lite', price: 70,
    storageLimitBytes: 50 * GIB, storageLimitGb: 50,
    features: ['50 GB High-Speed Storage', 'Priority Sync', 'Direct WhatsApp Support', 'Referral Bonuses Doubled']
  },
  plan_100gb: {
    key: 'plan_100gb', label: '100 GB Pro', price: 130,
    storageLimitBytes: 100 * GIB, storageLimitGb: 100,
    features: ['100 GB High-Speed Storage', 'Advanced File Sharing', 'Priority File Preview', 'VIP Support']
  },
  plan_200gb: {
    key: 'plan_200gb', label: '200 GB Business', price: 250,
    storageLimitBytes: 200 * GIB, storageLimitGb: 200,
    features: ['200 GB Storage', 'Multi-Device Sync', 'Full Audit History', '24/7 Priority Support']
  },
  plan_500gb: {
    key: 'plan_500gb', label: '500 GB Ultra', price: 700,
    storageLimitBytes: 500 * GIB, storageLimitGb: 500,
    features: ['500 GB Ultra Storage', 'Enterprise Encryption', 'Dedicated Bandwidth', 'Architect-Level Support']
  }
});

// =============================================
// UTILITIES
// =============================================
class ApiError extends Error {
  constructor(status, message, code = 'REQUEST_FAILED') {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const normalizeEmail = (email) => String(email || '').trim().toLowerCase();

function asSafeSegment(value) {
  const safe = String(value || '').replace(/[^a-zA-Z0-9_-]/g, '_');
  return safe || crypto.createHash('sha256').update(String(value)).digest('hex');
}

/**
 * Organizes uploads strictly under:
 * backend/uploads/{uid}/ (local) or /tmp/uploads/{uid}/ (Vercel)
 */
function userDirectory(uid) {
  const dir = path.resolve(UPLOAD_ROOT, asSafeSegment(uid));
  if (!dir.startsWith(UPLOAD_ROOT)) {
    throw new ApiError(400, 'Invalid user storage path.', 'INVALID_STORAGE_PATH');
  }
  return dir;
}

function safeFileName(name) {
  const base = path.basename(String(name || 'file'));
  return (base.replace(/[\u0000-\u001f<>:"/\\|?*]/g, '_').replace(/^\.+$/, 'file').trim() || 'file').slice(0, 180);
}

function timestampToIso(value) {
  if (!value) return null;
  if (typeof value.toDate === 'function') return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  return typeof value === 'string' ? value : null;
}

function extractStorageLimit(data) {
  if (!data) return DEFAULT_STORAGE_LIMIT_BYTES;
  const n = Number(data.storageLimitBytes ?? data.storageLimit);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_STORAGE_LIMIT_BYTES;
}

function extractStorageUsed(data) {
  if (!data) return 0;
  const n = Number(data.usedStorageBytes ?? data.storageUsed);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function deriveUsername(uid, email) {
  const prefix = String(email || 'user').split('@')[0].replace(/[^a-zA-Z0-9_]/g, '') || 'user';
  return `@${prefix.toLowerCase()}`;
}

function deriveAccountId(uid) {
  return `ZUL-${String(uid || '000000').substring(0, 6).toUpperCase()}`;
}

function profileForClient(profile) {
  const storageLimit = extractStorageLimit(profile);
  const storageUsed = extractStorageUsed(profile);
  const planType = profile.planType || (storageLimit > DEFAULT_STORAGE_LIMIT_BYTES ? 'Pro' : 'Free');
  const tier = profile.tier || (storageLimit > DEFAULT_STORAGE_LIMIT_BYTES ? 'pro' : 'free');
  const email = profile.email || '';
  const username = profile.username || deriveUsername(profile.uid, email);
  const accountId = profile.accountId || deriveAccountId(profile.uid);
  const displayName = profile.displayName || email.split('@')[0] || 'User';

  return {
    uid: profile.uid,
    accountId,
    email,
    displayName,
    username,
    photoURL: profile.photoURL || '',
    storageLimitBytes: storageLimit,
    usedStorageBytes: storageUsed,
    storageLimit,
    storageUsed,
    planType,
    tier,
    referralLink: `${APP_DOMAIN}/?ref=${profile.uid}`,
    totalReferrals: Number(profile.totalReferrals || 0),
    referralBonusBytes: Number(profile.referralBonusBytes || 0),
    isAdmin: normalizeEmail(email) === ADMIN_EMAIL,
    createdAt: timestampToIso(profile.createdAt),
    updatedAt: timestampToIso(profile.updatedAt)
  };
}

function fileForClient(id, file) {
  return {
    id,
    originalName: file.originalName || file.name,
    name: file.name || file.originalName,
    size: Number(file.size || 0),
    mimetype: file.mimetype || file.mimeType || 'application/octet-stream',
    mimeType: file.mimeType || file.mimetype || 'application/octet-stream',
    isStarred: Boolean(file.isStarred),
    uploadedAt: timestampToIso(file.uploadedAt || file.uploadDate),
    uploadDate: timestampToIso(file.uploadDate || file.uploadedAt),
    updatedAt: timestampToIso(file.updatedAt)
  };
}

function planFromKey(key) {
  const norm = String(key || '').toLowerCase().replace(/[-\s]/g, '_');
  const plan = PLANS[norm] || PLANS[`plan_${norm}`];
  if (!plan) throw new ApiError(400, 'Select a valid storage plan.', 'INVALID_PLAN');
  return plan;
}

// =============================================
// FIREBASE ADMIN INITIALIZATION
// =============================================
let db;
let firebaseReady = false;

function loadServiceAccount() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT
    || process.env.FIREBASE_SERVICE_ACCOUNT_KEY
    || process.env.FIREBASE_CREDENTIALS;

  if (raw) {
    let trimmed = String(raw).trim().replace(/^'|'$/g, '');
    try { return JSON.parse(trimmed); } catch (_) {}
    try { return JSON.parse(Buffer.from(trimmed, 'base64').toString('utf8')); } catch (_) {}
  }

  const candidates = [
    path.resolve(__dirname, 'serviceAccountKey.json'),
    path.resolve(__dirname, 'serviceaccountkey.json'),
    '/etc/secrets/serviceAccountKey.json'
  ];

  for (const p of candidates) {
    if (fs.existsSync(p)) {
      try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (_) {}
    }
  }
  return null;
}

try {
  const sa = loadServiceAccount();
  if (sa) {
    if (typeof sa.private_key === 'string') sa.private_key = sa.private_key.replace(/\\n/g, '\n');
    if (!admin.apps.length) {
      initializeApp({
        credential: cert(sa),
        storageBucket: process.env.FIREBASE_STORAGE_BUCKET || 'zulora-drive.firebasestorage.app'
      });
    }
    db = getFirestore();
    firebaseReady = true;
    console.info('[Zulora] Firebase Admin initialized ✓');
  } else {
    console.warn('[Zulora] Firebase Admin credentials not found. Set FIREBASE_SERVICE_ACCOUNT env var.');
  }
} catch (e) {
  console.warn('[Zulora] Firebase Admin init failed:', e.message);
}

try { fs.mkdirSync(UPLOAD_ROOT, { recursive: true }); } catch (_) {}

// =============================================
// MIDDLEWARE
// =============================================
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
  contentSecurityPolicy: false
}));

const ALLOWED_ORIGINS = [
  'https://drive.zulora.in', 'https://zulora.in',
  'https://zulora-drive.vercel.app',
  'http://localhost:3000', 'http://localhost:5000',
  'http://127.0.0.1:3000', 'http://127.0.0.1:5500'
];

app.use(cors({
  origin(origin, cb) {
    if (!origin) return cb(null, true);
    const norm = origin.replace(/\/$/, '').toLowerCase();
    if (ALLOWED_ORIGINS.includes(norm) || norm.endsWith('.zulora.in') || norm.endsWith('.vercel.app')) {
      return cb(null, true);
    }
    return cb(null, true); // permissive fallback
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Authorization', 'Content-Type', 'Bypass-Tunnel-Reminder'],
  maxAge: 86400
}));

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// Serverless path normalization — adds /api prefix if missing
app.use((req, res, next) => {
  if (req.url && !req.url.startsWith('/api') && !req.url.startsWith('/frontend')) {
    req.url = '/api' + (req.url.startsWith('/') ? req.url : `/${req.url}`);
  }
  next();
});

// =============================================
// AUTH MIDDLEWARE
// =============================================
function requireFirebase(req, res, next) {
  if (!firebaseReady) {
    return next(new ApiError(503, 'Firebase not configured on server. Add FIREBASE_SERVICE_ACCOUNT env var.', 'FIREBASE_NOT_CONFIGURED'));
  }
  return next();
}

async function authenticate(req, res, next) {
  try {
    const match = (req.get('authorization') || '').match(/^Bearer\s+(.+)$/i);
    if (!match) throw new ApiError(401, 'A Firebase ID token is required.', 'AUTH_REQUIRED');
    const token = await getAuth().verifyIdToken(match[1], true);
    if (!token.uid || !token.email) throw new ApiError(401, 'Verified email is required.', 'EMAIL_REQUIRED');
    req.user = { uid: token.uid, email: normalizeEmail(token.email), name: token.name || '', picture: token.picture || '' };
    return next();
  } catch (err) {
    return next(err instanceof ApiError ? err : new ApiError(401, 'Session expired. Please sign in again.', 'INVALID_TOKEN'));
  }
}

function requireAdmin(req, res, next) {
  return normalizeEmail(req.user?.email) === ADMIN_EMAIL
    ? next()
    : next(new ApiError(403, 'Administrator access required.', 'ADMIN_REQUIRED'));
}

// =============================================
// PROFILE & REFERRAL HELPERS
// =============================================
async function bootstrapProfile(user, input = {}) {
  const userRef = db.collection('users').doc(user.uid);
  const email = user.email || '';
  const username = deriveUsername(user.uid, email);
  const accountId = deriveAccountId(user.uid);
  const displayName = String(input.displayName || user.name || email.split('@')[0]).trim().slice(0, 80);
  const photoURL = String(input.photoURL || user.picture || '').trim().slice(0, 1000);
  const referrerUid = input.referrerUid && String(input.referrerUid).trim() !== user.uid
    ? String(input.referrerUid).trim()
    : null;

  const now = new Date();
  let created = false;

  const profile = await db.runTransaction(async (tx) => {
    const existing = await tx.get(userRef);

    if (existing.exists) {
      const current = existing.data();
      const updates = { updatedAt: FieldValue.serverTimestamp() };
      if (input.displayName && displayName) updates.displayName = displayName;
      if (input.photoURL && photoURL) updates.photoURL = photoURL;
      if (!current.username) updates.username = username;
      if (!current.accountId) updates.accountId = accountId;
      if (Object.keys(updates).length > 1) tx.update(userRef, updates);
      return { ...current, ...updates, uid: user.uid, email };
    }

    created = true;
    const newProfile = {
      uid: user.uid,
      accountId,
      email,
      displayName,
      username,
      photoURL,
      storageLimitBytes: DEFAULT_STORAGE_LIMIT_BYTES,
      usedStorageBytes: 0,
      storageLimit: DEFAULT_STORAGE_LIMIT_BYTES,
      storageUsed: 0,
      planType: 'Free',
      tier: 'free',
      totalReferrals: 0,
      referralBonusBytes: 0,
      referredBy: referrerUid,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    };

    tx.set(userRef, newProfile);
    return { ...newProfile, createdAt: now, updatedAt: now };
  });

  if (profile) {
    if (created && referrerUid) {
      processReferralBonus(user.uid, referrerUid).catch((e) =>
        console.warn('[Zulora] Automatic referral bonus error:', e.message)
      );
    }
    return profileForClient(profile);
  }

  throw new ApiError(503, 'Could not bootstrap profile. Please retry.', 'BOOTSTRAP_FAILED');
}

async function processReferralBonus(newUserUid, referrerUid) {
  if (!referrerUid || referrerUid === newUserUid) return;
  const newUserRef = db.collection('users').doc(newUserUid);
  const referrerRef = db.collection('users').doc(referrerUid);
  const referralRef = db.collection('referrals').doc(`${referrerUid}_${newUserUid}`);

  await db.runTransaction(async (tx) => {
    const [newUserSnap, referrerSnap, referralSnap] = await Promise.all([
      tx.get(newUserRef),
      tx.get(referrerRef),
      tx.get(referralRef)
    ]);

    if (!newUserSnap.exists || !referrerSnap.exists) return;
    if (referralSnap.exists || newUserSnap.data().referralProcessed) return; // idempotent

    const newUserLimit = extractStorageLimit(newUserSnap.data());
    const referrerLimit = extractStorageLimit(referrerSnap.data());

    tx.update(newUserRef, {
      storageLimitBytes: newUserLimit + REFERRAL_BONUS_BYTES,
      storageLimit: newUserLimit + REFERRAL_BONUS_BYTES,
      referralBonusBytes: FieldValue.increment(REFERRAL_BONUS_BYTES),
      referralProcessed: true,
      referredBy: referrerUid,
      updatedAt: FieldValue.serverTimestamp()
    });

    tx.update(referrerRef, {
      storageLimitBytes: referrerLimit + REFERRAL_BONUS_BYTES,
      storageLimit: referrerLimit + REFERRAL_BONUS_BYTES,
      referralBonusBytes: FieldValue.increment(REFERRAL_BONUS_BYTES),
      totalReferrals: FieldValue.increment(1),
      updatedAt: FieldValue.serverTimestamp()
    });

    tx.set(referralRef, {
      referrerUid,
      newUserUid,
      bonusBytes: REFERRAL_BONUS_BYTES,
      createdAt: FieldValue.serverTimestamp()
    });
  });
  console.info(`[Zulora] Referral bonus applied (+${REFERRAL_BONUS_BYTES / GIB}GB): referrer=${referrerUid}, new=${newUserUid}`);
}

async function getProfile(user) {
  const snap = await db.collection('users').doc(user.uid).get();
  if (snap.exists) return profileForClient({ ...snap.data(), uid: user.uid });
  return bootstrapProfile(user);
}

/**
 * Finds a file owned by user — checking both users/{uid}/files and files collections
 */
async function ownedFile(fileId, uid) {
  const id = String(fileId || '').trim();
  if (!id || id.length > 128) throw new ApiError(400, 'Invalid file ID.', 'INVALID_FILE_ID');

  const userFileRef = db.collection('users').doc(uid).collection('files').doc(id);
  let snap = await userFileRef.get();
  if (snap.exists) {
    return { userRef: userFileRef, rootRef: db.collection('files').doc(id), data: snap.data() };
  }

  const rootRef = db.collection('files').doc(id);
  snap = await rootRef.get();
  if (snap.exists && snap.data().ownerUid === uid) {
    return { userRef: userFileRef, rootRef, data: snap.data() };
  }

  throw new ApiError(404, 'File not found.', 'FILE_NOT_FOUND');
}

// =============================================
// MULTER UPLOAD CONFIG (backend/uploads/{uid}/)
// =============================================
const upload = multer({
  storage: multer.diskStorage({
    destination(req, file, cb) {
      try {
        const dir = userDirectory(req.user.uid);
        fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
      } catch (err) {
        cb(err);
      }
    },
    filename(req, file, cb) {
      const ext = path.extname(safeFileName(file.originalname)).slice(0, 20);
      cb(null, `${Date.now()}-${crypto.randomUUID()}${ext}`);
    }
  }),
  limits: { fileSize: MAX_FILE_SIZE, files: 1, fields: 10 },
  fileFilter(req, file, cb) {
    if (!file.originalname || file.originalname.length > 500) {
      return cb(new ApiError(400, 'Invalid file name.', 'INVALID_FILE_NAME'));
    }
    cb(null, true);
  }
});

// =============================================
// PUBLIC ROUTES
// =============================================
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    firebaseConfigured: firebaseReady,
    timestamp: new Date().toISOString(),
    service: 'Zulora Drive API v3'
  });
});

app.get('/api/plans', (req, res) => {
  res.json({
    plans: Object.values(PLANS),
    paymentUpiId: PAYMENT_UPI_ID,
    supportEmail: ADMIN_EMAIL,
    supportPhone: SUPPORT_PHONE,
    supportWhatsApp: SUPPORT_WHATSAPP,
    referralBonusGb: Math.round(REFERRAL_BONUS_BYTES / GIB)
  });
});

// =============================================
// USER PROFILE & REFERRAL ROUTES
// =============================================
const handleGetProfile = async (req, res, next) => {
  try { res.json({ profile: await getProfile(req.user) }); } catch (err) { next(err); }
};
app.get('/api/user/profile', requireFirebase, authenticate, handleGetProfile);
app.get('/api/users/me', requireFirebase, authenticate, handleGetProfile);

app.post('/api/users/me/bootstrap', requireFirebase, authenticate, async (req, res, next) => {
  try { res.json({ profile: await bootstrapProfile(req.user, req.body || {}) }); } catch (err) { next(err); }
});

const handleUpdateProfile = async (req, res, next) => {
  try {
    const displayName = String(req.body?.displayName || '').trim();
    if (displayName && (displayName.length < 2 || displayName.length > 80)) {
      throw new ApiError(400, 'Display name must be 2–80 characters.', 'INVALID_DISPLAY_NAME');
    }
    const updates = { updatedAt: FieldValue.serverTimestamp() };
    if (displayName) updates.displayName = displayName;
    await db.collection('users').doc(req.user.uid).set(updates, { merge: true });
    res.json({ profile: await getProfile(req.user) });
  } catch (err) { next(err); }
};
app.patch('/api/user/profile', requireFirebase, authenticate, handleUpdateProfile);
app.patch('/api/users/me', requireFirebase, authenticate, handleUpdateProfile);

// Get referral status & link
app.get('/api/user/referral', requireFirebase, authenticate, async (req, res, next) => {
  try {
    const profile = await getProfile(req.user);
    res.json({
      referralLink: `${APP_DOMAIN}/?ref=${req.user.uid}`,
      totalReferrals: profile.totalReferrals,
      referralBonusBytes: profile.referralBonusBytes,
      bonusPerReferralGb: Math.round(REFERRAL_BONUS_BYTES / GIB)
    });
  } catch (err) { next(err); }
});

// Apply referral code explicitly
app.post('/api/referrals/apply', requireFirebase, authenticate, async (req, res, next) => {
  try {
    const referrerUid = String(req.body?.referrerUid || '').trim();
    if (!referrerUid || referrerUid === req.user.uid) {
      throw new ApiError(400, 'Invalid referral link.', 'INVALID_REFERRER');
    }
    await processReferralBonus(req.user.uid, referrerUid);
    const updated = await getProfile(req.user);
    res.json({ success: true, profile: updated, bonusGb: Math.round(REFERRAL_BONUS_BYTES / GIB) });
  } catch (err) { next(err); }
});

// =============================================
// FILE ROUTES
// =============================================
const handleListFiles = async (req, res, next) => {
  try {
    // Primary source: users/{uid}/files
    const userFilesSnap = await db.collection('users').doc(req.user.uid).collection('files').get();
    let files = userFilesSnap.docs.map((d) => fileForClient(d.id, d.data()));

    if (files.length === 0) {
      // Fallback: legacy top-level files collection
      const legacySnap = await db.collection('files').where('ownerUid', '==', req.user.uid).get();
      files = legacySnap.docs.map((d) => fileForClient(d.id, d.data()));
    }

    files.sort((a, b) => new Date(b.uploadedAt || b.uploadDate || 0) - new Date(a.uploadedAt || a.uploadDate || 0));
    res.json({ files });
  } catch (err) { next(err); }
};
app.get('/api/files', requireFirebase, authenticate, handleListFiles);
app.get('/api/files/list', requireFirebase, authenticate, handleListFiles);

/**
 * File Upload Handler
 * Saves file to backend/uploads/{uid}/
 * Saves metadata to users/{uid}/files & files
 * Validates storage quota before accepting
 */
const handleUpload = async (req, res, next) => {
  if (!req.file) return next(new ApiError(400, 'Attach one file to upload.', 'FILE_REQUIRED'));
  const cleanup = () => fsp.unlink(req.file.path).catch(() => {});

  try {
    const originalName = safeFileName(req.file.originalname);
    const fileId = crypto.randomUUID();
    const userFileRef = db.collection('users').doc(req.user.uid).collection('files').doc(fileId);
    const rootFileRef = db.collection('files').doc(fileId);

    await db.runTransaction(async (tx) => {
      const profileRef = db.collection('users').doc(req.user.uid);
      const profileSnap = await tx.get(profileRef);
      if (!profileSnap.exists) {
        throw new ApiError(409, 'Profile not initialized. Please reload the drive.', 'PROFILE_NOT_READY');
      }

      const used = extractStorageUsed(profileSnap.data());
      const limit = extractStorageLimit(profileSnap.data());

      if (used + req.file.size > limit) {
        const limitGb = (limit / GIB).toFixed(1);
        throw new ApiError(413, `Upload would exceed your ${limitGb} GB storage quota. Upgrade your plan to continue.`, 'QUOTA_EXCEEDED');
      }

      const newUsed = used + req.file.size;
      const fileRecord = {
        id: fileId,
        name: originalName,
        originalName,
        storedName: req.file.filename,
        size: req.file.size,
        mimeType: req.file.mimetype || 'application/octet-stream',
        mimetype: req.file.mimetype || 'application/octet-stream',
        isStarred: false,
        ownerUid: req.user.uid,
        uploadDate: FieldValue.serverTimestamp(),
        uploadedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp()
      };

      // Record under users/{uid}/files AND root files
      tx.set(userFileRef, fileRecord);
      tx.set(rootFileRef, fileRecord);

      tx.update(profileRef, {
        usedStorageBytes: newUsed,
        storageUsed: newUsed,
        updatedAt: FieldValue.serverTimestamp()
      });
    });

    const now = new Date();
    return res.status(201).json({
      file: fileForClient(fileId, {
        name: originalName, originalName, size: req.file.size,
        mimetype: req.file.mimetype, mimeType: req.file.mimetype,
        isStarred: false, uploadedAt: now, uploadDate: now, updatedAt: now
      })
    });
  } catch (err) {
    await cleanup();
    return next(err);
  }
};

// Aliased upload routes
app.post('/api/upload', requireFirebase, authenticate, upload.single('file'), handleUpload);
app.post('/api/files/upload', requireFirebase, authenticate, upload.single('file'), handleUpload);
app.post('/api/files', requireFirebase, authenticate, upload.single('file'), handleUpload);

// File Update (star, rename)
app.patch('/api/files/:fileId', requireFirebase, authenticate, async (req, res, next) => {
  try {
    const { userRef, rootRef, data } = await ownedFile(req.params.fileId, req.user.uid);
    const updates = { updatedAt: FieldValue.serverTimestamp() };
    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'isStarred')) updates.isStarred = Boolean(req.body.isStarred);
    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'originalName')) {
      const safe = safeFileName(req.body.originalName);
      updates.originalName = safe;
      updates.name = safe;
    }
    if (Object.keys(updates).length === 1) throw new ApiError(400, 'No supported fields provided.', 'EMPTY_UPDATE');

    await Promise.all([
      userRef.set(updates, { merge: true }).catch(() => {}),
      rootRef.set(updates, { merge: true }).catch(() => {})
    ]);

    res.json({ file: fileForClient(req.params.fileId, { ...data, ...updates, updatedAt: new Date() }) });
  } catch (err) { next(err); }
});

// File Content Stream & Download
app.get(['/api/files/:fileId/content', '/api/files/:fileId/download'], requireFirebase, authenticate, async (req, res, next) => {
  try {
    const { data } = await ownedFile(req.params.fileId, req.user.uid);
    const dir = userDirectory(req.user.uid);
    const filePath = path.resolve(dir, path.basename(String(data.storedName || '')));

    if (!filePath.startsWith(dir) || !fs.existsSync(filePath)) {
      throw new ApiError(404, 'Stored file is unavailable on server.', 'STORAGE_FILE_NOT_FOUND');
    }

    const download = String(req.query.download || '') === '1' || req.path.endsWith('/download');
    const name = safeFileName(data.originalName || data.name || 'file');
    res.setHeader('Content-Type', data.mimetype || data.mimeType || 'application/octet-stream');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Disposition', `${download ? 'attachment' : 'inline'}; filename="${name.replace(/["\\]/g, '_')}"`);
    res.sendFile(filePath, { acceptRanges: true }, (err) => { if (err && !res.headersSent) next(err); });
  } catch (err) { next(err); }
});

// File Deletion
const handleDeleteFile = async (req, res, next) => {
  try {
    const targetId = req.params.id || req.params.fileId;
    const { userRef, rootRef, data: deletedFile } = await ownedFile(targetId, req.user.uid);

    await db.runTransaction(async (tx) => {
      const profileRef = db.collection('users').doc(req.user.uid);
      const profileSnap = await tx.get(profileRef);

      tx.delete(userRef);
      tx.delete(rootRef);

      if (profileSnap.exists) {
        const newUsed = Math.max(0, extractStorageUsed(profileSnap.data()) - Number(deletedFile.size || 0));
        tx.update(profileRef, {
          usedStorageBytes: newUsed,
          storageUsed: newUsed,
          updatedAt: FieldValue.serverTimestamp()
        });
      }
    });

    const dir = userDirectory(req.user.uid);
    const diskPath = path.resolve(dir, path.basename(String(deletedFile.storedName || '')));
    if (diskPath.startsWith(dir)) await fsp.unlink(diskPath).catch(() => {});

    res.status(204).end();
  } catch (err) { next(err); }
};
app.delete('/api/files/:id', requireFirebase, authenticate, handleDeleteFile);
app.delete('/api/files/:fileId', requireFirebase, authenticate, handleDeleteFile);

// =============================================
// UPGRADE & PAYMENT ROUTES
// =============================================
app.post('/api/upgrade-requests', requireFirebase, authenticate, async (req, res, next) => {
  try {
    const plan = planFromKey(req.body?.plan);
    if (plan.key === 'free') throw new ApiError(400, 'Free tier requires no payment.', 'FREE_PLAN');
    const profile = await getProfile(req.user);
    const ref = db.collection('upgradeRequests').doc();
    await ref.set({
      userUid: req.user.uid, accountId: profile.accountId, email: req.user.email,
      plan: plan.key, planLabel: plan.label, amount: plan.price,
      storageLimitBytes: plan.storageLimitBytes,
      paymentReference: String(req.body?.paymentReference || req.body?.utr || '').trim().slice(0, 80),
      upiId: PAYMENT_UPI_ID, status: 'pending',
      createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp()
    });
    res.status(201).json({ requestId: ref.id, status: 'pending', upiId: PAYMENT_UPI_ID, amount: plan.price });
  } catch (err) { next(err); }
});

app.post('/api/payments/upi', requireFirebase, authenticate, async (req, res, next) => {
  try {
    const { amount, plan, utr } = req.body;
    if (!amount) throw new ApiError(400, 'Amount is required.', 'INVALID_INPUT');
    const profile = await getProfile(req.user);
    const ref = db.collection('upgradeRequests').doc();
    await ref.set({
      userUid: req.user.uid, email: req.user.email, accountId: profile.accountId,
      amount: Number(amount), plan: String(plan || 'custom'),
      paymentReference: String(utr || '').trim(), upiId: PAYMENT_UPI_ID,
      status: 'pending', createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp()
    });
    res.json({ status: 'ok', upiId: PAYMENT_UPI_ID, amount, requestId: ref.id });
  } catch (err) { next(err); }
});

// =============================================
// ADMIN ROUTES
// =============================================
app.get('/api/admin/overview', requireFirebase, authenticate, requireAdmin, async (req, res, next) => {
  try {
    const [usersSnap, filesSnap, reqSnap] = await Promise.all([
      db.collection('users').get(),
      db.collection('files').get(),
      db.collection('upgradeRequests').where('status', '==', 'pending').get()
    ]);
    let totalStorageUsed = 0;
    usersSnap.forEach((d) => { totalStorageUsed += extractStorageUsed(d.data()); });
    res.json({ users: usersSnap.size, files: filesSnap.size, storageUsed: totalStorageUsed, pendingUpgradeRequests: reqSnap.size });
  } catch (err) { next(err); }
});

app.get('/api/admin/users', requireFirebase, authenticate, requireAdmin, async (req, res, next) => {
  try {
    const snap = await db.collection('users').get();
    const users = snap.docs.map((d) => profileForClient({ ...d.data(), uid: d.id })).sort((a, b) => (a.email || '').localeCompare(b.email || ''));
    res.json({ users });
  } catch (err) { next(err); }
});

app.post('/api/admin/update-quota', requireFirebase, authenticate, requireAdmin, async (req, res, next) => {
  try {
    const targetUid = String(req.body?.uid || '').trim();
    if (!targetUid) throw new ApiError(400, 'Provide a valid user uid.', 'INVALID_USER');
    const gb = Number(req.body?.storageLimitGb);
    if (!Number.isFinite(gb) || gb < 1 || gb > 50000) throw new ApiError(400, 'storageLimitGb must be 1–50000.', 'INVALID_QUOTA');
    const targetRef = db.collection('users').doc(targetUid);
    const targetSnap = await targetRef.get();
    if (!targetSnap.exists) throw new ApiError(404, 'User not found.', 'USER_NOT_FOUND');
    const newLimit = Math.floor(gb * GIB);
    await targetRef.update({
      storageLimitBytes: newLimit, storageLimit: newLimit,
      planType: newLimit > DEFAULT_STORAGE_LIMIT_BYTES ? 'Pro' : 'Free',
      tier: newLimit > DEFAULT_STORAGE_LIMIT_BYTES ? 'pro' : 'free',
      updatedAt: FieldValue.serverTimestamp()
    });
    res.json({ success: true, profile: profileForClient({ ...(await targetRef.get()).data(), uid: targetUid }) });
  } catch (err) { next(err); }
});

app.get('/api/admin/upgrade-requests', requireFirebase, authenticate, requireAdmin, async (req, res, next) => {
  try {
    const snap = await db.collection('upgradeRequests').get();
    const requests = snap.docs.map((d) => {
      const data = d.data();
      return { id: d.id, ...data, createdAt: timestampToIso(data.createdAt), updatedAt: timestampToIso(data.updatedAt) };
    }).sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
    res.json({ requests });
  } catch (err) { next(err); }
});

app.patch('/api/admin/upgrade-requests/:requestId', requireFirebase, authenticate, requireAdmin, async (req, res, next) => {
  try {
    const status = String(req.body?.status || '').toLowerCase();
    if (!['approved', 'rejected'].includes(status)) throw new ApiError(400, 'Status must be approved or rejected.', 'INVALID_STATUS');
    const ref = db.collection('upgradeRequests').doc(String(req.params.requestId || ''));
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new ApiError(404, 'Request not found.', 'REQUEST_NOT_FOUND');
      const data = snap.data();
      tx.update(ref, { status, reviewedBy: req.user.email, reviewedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
      if (status === 'approved') {
        const plan = planFromKey(data.plan);
        tx.update(db.collection('users').doc(data.userUid), {
          storageLimitBytes: plan.storageLimitBytes, storageLimit: plan.storageLimitBytes,
          planType: 'Pro', tier: plan.key, updatedAt: FieldValue.serverTimestamp()
        });
      }
    });
    res.json({ success: true, status });
  } catch (err) { next(err); }
});

// =============================================
// STATIC FRONTEND (local dev mode)
// =============================================
app.use(express.static(FRONTEND_ROOT, {
  extensions: ['html'],
  index: 'index.html',
  maxAge: process.env.NODE_ENV === 'production' ? '1h' : 0
}));

app.use('/api', (req, res, next) => {
  next(new ApiError(404, `API route not found: ${req.method} ${req.originalUrl}`, 'ROUTE_NOT_FOUND'));
});

// =============================================
// GLOBAL ERROR HANDLER
// =============================================
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    const msg = err.code === 'LIMIT_FILE_SIZE'
      ? `File exceeds the ${Math.floor(MAX_FILE_SIZE / 1024 / 1024)} MB limit.`
      : 'Upload request is invalid.';
    return res.status(400).json({ error: msg, code: err.code });
  }
  const status = Number(err.status) || 500;
  if (status >= 500) console.error('[Zulora] Unhandled error:', err);
  return res.status(status).json({
    error: status >= 500 ? 'An unexpected server error occurred.' : err.message,
    code: err.code || 'INTERNAL_ERROR'
  });
});

if (require.main === module) {
  app.listen(PORT, () => console.info(`[Zulora] API running → http://localhost:${PORT}`));
}

module.exports = app;
