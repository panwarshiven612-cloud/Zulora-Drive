/**
 * Zulora Drive — Optional Backend REST API
 * Node.js / Express — Deploy on Render.com (Free Tier)
 *
 * Purpose: Lightweight admin webhook endpoints for:
 *   • Manual storage quota activation after UPI payment verification
 *   • Platform health check
 *
 * Environment Variables Required (set in Render dashboard):
 *   FIREBASE_PROJECT_ID         = zulora-drive
 *   FIREBASE_SERVICE_ACCOUNT    = <base64-encoded service account JSON>
 *   ADMIN_SECRET_TOKEN          = <your-secure-random-token>
 *   PORT                        = 3000 (optional, Render sets this automatically)
 *
 * Deployment:
 *   1. Push this backend/ folder to GitHub
 *   2. Create a new Web Service on Render.com → point to this repo → Root Dir: backend
 *   3. Set environment variables in Render dashboard
 *   4. Build Command: npm install
 *   5. Start Command: node server.js
 *
 * Note: This backend is OPTIONAL. The frontend runs 100% on Firebase directly.
 * The admin quota override is available in the browser Admin Console panel.
 */

// Updated Zulora Drive Backend Pipeline

'use strict';

const express = require('express');
const cors    = require('cors');
const admin   = require('firebase-admin');

// ── Firebase Admin SDK Initialization ────────────────────────────────────────
let serviceAccount;
try {
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    serviceAccount = JSON.parse(
      Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT, 'base64').toString('utf8')
    );
  }
} catch (err) {
  console.error('[Zulora Backend] Service account parse error:', err.message);
}

if (serviceAccount && !admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    storageBucket: 'zulora-drive.firebasestorage.app'
  });
} else if (!admin.apps.length) {
  console.warn('[Zulora Backend] No service account — running in limited mode.');
  admin.initializeApp({ projectId: 'zulora-drive' });
}

const db = admin.firestore();

// ── Express App Setup ─────────────────────────────────────────────────────────
const app  = express();
const PORT = process.env.PORT || 3000;

app.use(cors({ origin: ['https://drive.zulora.in', 'http://localhost:5500'] }));
app.use(express.json());

// ── Auth Middleware ───────────────────────────────────────────────────────────
function requireAdminToken(req, res, next) {
  const token = req.headers['x-admin-token'] || req.query.token;
  if (!process.env.ADMIN_SECRET_TOKEN || token !== process.env.ADMIN_SECRET_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized: Invalid admin token.' });
  }
  next();
}

// ══════════════════════════════════════════════════════════════════════════════
// ROUTES
// ══════════════════════════════════════════════════════════════════════════════

/**
 * GET /health
 * Platform health check — no auth required
 */
app.get('/health', (req, res) => {
  res.json({
    status:    'ok',
    platform:  'Zulora Drive API',
    version:   '1.0.0',
    timestamp: new Date().toISOString()
  });
});

/**
 * POST /admin/upgrade-quota
 * Manually activate a storage plan after UPI payment verification.
 *
 * Body: { userUid: string, planKey: 'lite'|'pro'|'ultra', adminNote?: string }
 * Headers: x-admin-token: <ADMIN_SECRET_TOKEN>
 *
 * Plan quotas:
 *   lite  → 50 GB  (₹70/month)
 *   pro   → 100 GB (₹140/month)
 *   ultra → 200 GB (₹240/month)
 */
app.post('/admin/upgrade-quota', requireAdminToken, async (req, res) => {
  const { userUid, planKey, adminNote } = req.body;

  if (!userUid || !planKey) {
    return res.status(400).json({ error: 'Missing required fields: userUid, planKey' });
  }

  const PLAN_QUOTAS = {
    lite:  50  * 1024 ** 3,   // 50 GB
    pro:   100 * 1024 ** 3,   // 100 GB
    ultra: 200 * 1024 ** 3    // 200 GB
  };

  const PLAN_LABELS = {
    lite:  'Storage Lite',
    pro:   'Business Pro',
    ultra: 'Ultra Max'
  };

  const newLimitBytes = PLAN_QUOTAS[planKey];
  if (!newLimitBytes) {
    return res.status(400).json({ error: `Unknown plan key: ${planKey}. Valid: lite, pro, ultra` });
  }

  try {
    const userRef = db.collection('users').doc(userUid);
    const snap    = await userRef.get();

    if (!snap.exists) {
      return res.status(404).json({ error: `User not found: ${userUid}` });
    }

    await userRef.update({
      storageLimitBytes: newLimitBytes,
      storageLimit:      newLimitBytes,
      planType:          PLAN_LABELS[planKey],
      tier:              planKey,
      updatedAt:         admin.firestore.FieldValue.serverTimestamp()
    });

    // Log the admin action in a separate audit collection
    await db.collection('adminActions').add({
      action:    'upgrade_quota',
      targetUid: userUid,
      planKey,
      planLabel: PLAN_LABELS[planKey],
      newLimitBytes,
      adminNote: adminNote || '',
      performedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    res.json({
      success:       true,
      userUid,
      planKey,
      planLabel:     PLAN_LABELS[planKey],
      newLimitBytes,
      newLimitGb:    Math.round(newLimitBytes / 1024 ** 3)
    });
  } catch (err) {
    console.error('[Zulora API] upgrade-quota error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /admin/users
 * Returns all registered Zulora Drive users with quota info.
 * Headers: x-admin-token: <ADMIN_SECRET_TOKEN>
 */
app.get('/admin/users', requireAdminToken, async (req, res) => {
  try {
    const snap  = await db.collection('users').get();
    const users = snap.docs.map((d) => {
      const data = d.data();
      return {
        uid:               d.id,
        email:             data.email            || '',
        displayName:       data.displayName      || '',
        planType:          data.planType         || 'Starter',
        storageLimitBytes: data.storageLimitBytes || 10 * 1024 ** 3,
        usedStorageBytes:  data.usedStorageBytes  || 0,
        totalReferrals:    data.totalReferrals    || 0,
        createdAt:         data.createdAt?.toDate?.()?.toISOString() || null
      };
    });

    res.json({ total: users.length, users });
  } catch (err) {
    console.error('[Zulora API] /admin/users error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /admin/upgrade-requests
 * Returns pending UPI upgrade requests from Firestore.
 * Headers: x-admin-token: <ADMIN_SECRET_TOKEN>
 */
app.get('/admin/upgrade-requests', requireAdminToken, async (req, res) => {
  try {
    const snap     = await db.collection('upgradeRequests').orderBy('createdAt', 'desc').limit(100).get();
    const requests = snap.docs.map((d) => ({
      id:               d.id,
      ...d.data(),
      createdAt: d.data().createdAt?.toDate?.()?.toISOString() || null
    }));

    res.json({ total: requests.length, requests });
  } catch (err) {
    console.error('[Zulora API] /admin/upgrade-requests error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Start Server ──────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`[Zulora Drive API] Running on port ${PORT}`);
  console.log(`[Zulora Drive API] Health check: http://localhost:${PORT}/health`);
});

module.exports = app;

