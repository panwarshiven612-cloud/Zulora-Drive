/**
 * Zulora Drive — Authentication & User Identity Management
 *
 * Implements:
 *   • Firebase Auth (Google SSO + Email/Password)
 *   • Real-time Firestore profile bootstrapping
 *   • Unique username & ZUL-XXXXXX account ID generation
 *   • Automated referral system (+5 GB bonus per referral)
 *   • Cloudinary client-side upload pipeline with per-user data isolation
 *   • Admin quota override tool (zulora.help@gmail.com)
 *
 * Default Free Tier: 10 GB Starter Storage
 * Referral Bonus:    +5 GB per successful referral
 * File Size Limit:   500 MB per file on Starter plan
 */

import {
  auth,
  googleProvider,
  storage,
  db,
  signInWithPopup,
  signInWithRedirect,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  sendPasswordResetEmail,
  storageRef,
  uploadBytesResumable,
  getDownloadURL,
  collection,
  doc,
  addDoc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
  increment,
  runTransaction,
  firebase
} from './firebase-config.js';

// ── Platform Constants ────────────────────────────────────────────────────────
export const ADMIN_EMAIL         = 'zulora.help@gmail.com';
export const SUPPORT_PHONE       = '+91 6395211325';
export const SUPPORT_WHATSAPP    = 'https://wa.me/916395211325?text=Hi%20Zulora%20Drive%20Support';
export const SUPPORT_EMAIL       = 'zulora.help@gmail.com';
export const SUPPORT_UPI_ID      = 'shivenpanwar@fam';
export const APP_DOMAIN          = 'https://drive.zulora.in';
export const DEFAULT_STORAGE_BYTES   = 10 * 1024 * 1024 * 1024; // 10 GB Free Starter
export const MAX_STARTER_FILE_BYTES  = 500 * 1024 * 1024;        // 500 MB max per file (Starter)
export const REFERRAL_BONUS_BYTES    = 5 * 1024 * 1024 * 1024;   // +5 GB per referral

// ── Cloudinary Configuration ──────────────────────────────────────────────────
export const CLOUDINARY_CLOUD_NAME    = 't3dkhv0z';
export const CLOUDINARY_UPLOAD_PRESET = 'zulora_preset';
export const CLOUDINARY_API_ENDPOINT  = 'https://api.cloudinary.com/v1_1/t3dkhv0z/auto/upload';

// ── Internal Auth State ───────────────────────────────────────────────────────
let currentUser           = null;
let currentProfile        = null;
let profileBootstrapPromise = null;

// ── Identity Helpers ──────────────────────────────────────────────────────────

/** Deterministic @username derived from email prefix */
export function deriveUsername(user) {
  const email  = (user?.email || '').toLowerCase();
  const prefix = email.split('@')[0].replace(/[^a-z0-9_]/g, '') || 'user';
  return `@${prefix}`;
}

/** ZUL-XXXXXX account ID derived from Firebase UID */
export function deriveAccountId(user) {
  const uid = (user?.uid || '000000').toUpperCase();
  return `ZUL-${uid.substring(0, 6)}`;
}

/** Unique referral link for each user */
export function getReferralLink(user) {
  if (!user?.uid) return APP_DOMAIN;
  return `${APP_DOMAIN}/?ref=${user.uid}`;
}

/** Extract referrer UID from ?ref= query param and persist in localStorage */
export function getReferrerUidFromUrl() {
  try {
    const params = new URLSearchParams(window.location.search);
    const ref    = params.get('ref');
    if (ref && /^[A-Za-z0-9_-]{4,}$/.test(ref)) {
      localStorage.setItem('zulora_referrer_uid', ref);
      return ref;
    }
    return localStorage.getItem('zulora_referrer_uid') || null;
  } catch {
    return null;
  }
}

// ── Cloudinary Upload Pipeline with Strict User Isolation ─────────────────────
/**
 * Client-side Cloudinary upload:
 *   Folder:        zulora_drive/users/${currentUser.uid}
 *   Firestore doc: users/${currentUser.uid}/files/{autoId}
 *   Quota update:  users/${currentUser.uid}.usedStorageBytes += file.size
 *
 * @param {File}     file        - Browser File object
 * @param {Function} onProgress  - Callback(percent: number)
 * @returns {Promise<Object>}    - Resolved file metadata object
 */
export function uploadFileToCloudinary(file, onProgress) {
  return new Promise((resolve, reject) => {
    const activeUser = auth.currentUser || currentUser;
    if (!activeUser) {
      return reject(Object.assign(new Error('Please sign in first!'), { code: 'UNAUTHENTICATED' }));
    }

    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
    formData.append('folder', `zulora_drive/users/${activeUser.uid}`);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', CLOUDINARY_API_ENDPOINT, true);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        const percent = Math.round((e.loaded / e.total) * 100);
        if (typeof onProgress === 'function') onProgress(percent);
      }
    };

    xhr.onload = async () => {
      if (xhr.status === 200) {
        try {
          const response = JSON.parse(xhr.responseText);

          // Store metadata in Firestore under strict user ownership
          const fileDocRef = await db.collection("users").doc(activeUser.uid).collection("files").add({
            fileName:           file.name,
            fileType:           file.type || 'application/octet-stream',
            fileSize:           file.size,
            fileUrl:            response.secure_url,
            cloudinaryPublicId: response.public_id,
            userUid:            activeUser.uid,
            userEmail:          activeUser.email || '',
            createdAt:          firebase.firestore.FieldValue.serverTimestamp(),
            // Compatible mirror fields for UI renderer
            name:               file.name,
            originalName:       file.name,
            type:               file.type || 'application/octet-stream',
            mimetype:           file.type || 'application/octet-stream',
            size:               file.size,
            url:                response.secure_url,
            isStarred:          false,
            isTrash:            false,
            uploadedAt:         firebase.firestore.FieldValue.serverTimestamp(),
            updatedAt:          firebase.firestore.FieldValue.serverTimestamp()
          });

          // Increment user quota counters in Firestore
          try {
            await updateDoc(doc(db, 'users', activeUser.uid), {
              usedStorageBytes: increment(file.size),
              storageUsed:      increment(file.size),
              updatedAt:        serverTimestamp()
            });
          } catch (qErr) {
            console.warn('[Zulora] Quota increment notice:', qErr.message);
          }

          resolve({
            id:                 fileDocRef.id,
            fileName:           file.name,
            fileType:           file.type,
            fileSize:           file.size,
            fileUrl:            response.secure_url,
            cloudinaryPublicId: response.public_id,
            userUid:            activeUser.uid,
            userEmail:          activeUser.email,
            name:               file.name,
            size:               file.size,
            url:                response.secure_url,
            uploadedAt:         new Date().toISOString()
          });
        } catch (dbErr) {
          console.error('[Firestore] Metadata save error:', dbErr);
          reject(dbErr);
        }
      } else {
        console.error('Upload error:', xhr.responseText);
        reject(new Error(xhr.responseText || 'Upload failed'));
      }
    };

    xhr.onerror = () => {
      console.error('Network error during Cloudinary upload');
      reject(new Error('Network error during upload'));
    };

    xhr.send(formData);
  });
}

// Backward-compatible alias
export const uploadFileToFirebaseStorage = uploadFileToCloudinary;

// ── Profile Bootstrap & Referral Processing ───────────────────────────────────
/**
 * Ensures a Firestore user document exists for the authenticated user.
 * On first sign-in: creates profile with 10 GB Starter quota.
 * Processes referral bonus if ?ref= was present in the URL.
 */
export async function bootstrapUser() {
  const user = auth.currentUser || currentUser;
  if (!user) throw new Error('Not authenticated.');
  if (currentProfile) return currentProfile;

  if (!profileBootstrapPromise) {
    profileBootstrapPromise = (async () => {
      const userRef  = doc(db, 'users', user.uid);
      const userSnap = await getDoc(userRef).catch(() => null);

      const email       = user.email || '';
      const displayName = user.displayName || email.split('@')[0] || 'User';
      const username    = deriveUsername(user);
      const accountId   = deriveAccountId(user);
      const referrerUid = getReferrerUidFromUrl();

      if (userSnap && userSnap.exists()) {
        const d = userSnap.data();
        currentProfile = buildProfile(user, d);
        return currentProfile;
      }

      // First sign-in: create profile document
      const newProfileData = {
        uid:                user.uid,
        email,
        displayName,
        username,
        accountId,
        photoURL:           user.photoURL || '',
        storageLimitBytes:  DEFAULT_STORAGE_BYTES,   // 10 GB
        usedStorageBytes:   0,
        storageLimit:       DEFAULT_STORAGE_BYTES,
        storageUsed:        0,
        planType:           'Starter',
        tier:               'free',
        totalReferrals:     0,
        referralBonusBytes: 0,
        referredBy:         (referrerUid && referrerUid !== user.uid) ? referrerUid : null,
        referralProcessed:  false,
        createdAt:          serverTimestamp(),
        updatedAt:          serverTimestamp()
      };

      try {
        await setDoc(userRef, newProfileData, { merge: true });
      } catch (err) {
        console.warn('[Zulora] Firestore setDoc notice:', err.message);
      }

      // Apply referral bonuses immediately (+5 GB to both parties)
      if (referrerUid && referrerUid !== user.uid) {
        applyReferralBonus(user.uid, referrerUid).catch((e) =>
          console.warn('[Zulora] Referral bonus notice:', e.message)
        );
      }

      currentProfile = {
        ...newProfileData,
        referralLink: getReferralLink(user),
        isAdmin:      email.toLowerCase() === ADMIN_EMAIL
      };

      return currentProfile;
    })().finally(() => {
      profileBootstrapPromise = null;
    });
  }

  return profileBootstrapPromise;
}

/** Build a normalized profile object from Firestore data */
function buildProfile(user, d) {
  const email = user.email || d.email || '';
  return {
    uid:                user.uid,
    email,
    displayName:        d.displayName || user.displayName || email.split('@')[0],
    username:           d.username    || deriveUsername(user),
    accountId:          d.accountId   || deriveAccountId(user),
    photoURL:           d.photoURL    || user.photoURL || '',
    storageLimitBytes:  Number(d.storageLimitBytes || d.storageLimit || DEFAULT_STORAGE_BYTES),
    usedStorageBytes:   Number(d.usedStorageBytes  || d.storageUsed  || 0),
    storageLimit:       Number(d.storageLimitBytes || d.storageLimit || DEFAULT_STORAGE_BYTES),
    storageUsed:        Number(d.usedStorageBytes  || d.storageUsed  || 0),
    planType:           d.planType || 'Starter',
    tier:               d.tier     || 'free',
    totalReferrals:     Number(d.totalReferrals     || 0),
    referralBonusBytes: Number(d.referralBonusBytes || 0),
    referralLink:       getReferralLink(user),
    isAdmin:            email.toLowerCase() === ADMIN_EMAIL
  };
}

/**
 * Applies +5 GB bonus to both new user and referrer via Firestore transaction.
 * Idempotent — guarded by referralProcessed flag.
 */
async function applyReferralBonus(newUserUid, referrerUid) {
  try {
    const newUserRef  = doc(db, 'users', newUserUid);
    const referrerRef = doc(db, 'users', referrerUid);

    await runTransaction(db, async (tx) => {
      const [newSnap, refSnap] = await Promise.all([tx.get(newUserRef), tx.get(referrerRef)]);
      if (!newSnap.exists() || !refSnap.exists()) return;
      if (newSnap.data().referralProcessed) return; // Already processed

      const newLimit = Number(newSnap.data().storageLimitBytes || DEFAULT_STORAGE_BYTES) + REFERRAL_BONUS_BYTES;
      const refLimit = Number(refSnap.data().storageLimitBytes || DEFAULT_STORAGE_BYTES) + REFERRAL_BONUS_BYTES;

      tx.update(newUserRef, {
        storageLimitBytes:  newLimit,
        storageLimit:       newLimit,
        referralBonusBytes: increment(REFERRAL_BONUS_BYTES),
        referralProcessed:  true,
        updatedAt:          serverTimestamp()
      });

      tx.update(referrerRef, {
        storageLimitBytes:  refLimit,
        storageLimit:       refLimit,
        referralBonusBytes: increment(REFERRAL_BONUS_BYTES),
        totalReferrals:     increment(1),
        updatedAt:          serverTimestamp()
      });
    });

    console.info(`[Zulora] Referral bonus applied — new: ${newUserUid}, referrer: ${referrerUid}`);
  } catch (err) {
    console.warn('[Zulora] Referral transaction notice:', err.message);
  }
}

/** Refresh profile data from Firestore (called periodically) */
export async function refreshProfile() {
  const user = auth.currentUser || currentUser;
  if (!user) throw new Error('Not authenticated.');
  try {
    const snap = await getDoc(doc(db, 'users', user.uid));
    if (snap.exists()) {
      currentProfile = buildProfile(user, snap.data());
      return currentProfile;
    }
  } catch (err) {
    console.warn('[Zulora] refreshProfile notice:', err.message);
  }
  return currentProfile || bootstrapUser();
}

// ── Auth State Accessors ──────────────────────────────────────────────────────
export const getCurrentUser    = () => auth.currentUser || currentUser;
export const getCurrentProfile = () => currentProfile;
export const setCurrentProfile = (p) => { currentProfile = p; };
export const isAdmin = (profile) => {
  const email = profile?.email || auth.currentUser?.email || '';
  return email.toLowerCase().trim() === ADMIN_EMAIL;
};

// ── Auth Actions ──────────────────────────────────────────────────────────────
export async function signInWithGoogle() {
  try {
    return await signInWithPopup(auth, googleProvider);
  } catch (err) {
    if (
      err.code === 'auth/popup-blocked' ||
      err.code === 'auth/operation-not-supported-in-this-environment'
    ) {
      return signInWithRedirect(auth, googleProvider);
    }
    throw err;
  }
}

export const signInWithEmail    = (email, pwd) => signInWithEmailAndPassword(auth, email, pwd);
export const registerWithEmail  = (email, pwd) => createUserWithEmailAndPassword(auth, email, pwd);
export const resetPassword      = (email)      => sendPasswordResetEmail(auth, email);

export async function logOut() {
  currentUser             = null;
  currentProfile          = null;
  profileBootstrapPromise = null;
  return signOut(auth);
}

export function onAuthChange(callback) {
  return onAuthStateChanged(auth, (user) => {
    currentUser = user;
    if (!user) {
      currentProfile          = null;
      profileBootstrapPromise = null;
    }
    callback(user);
  });
}

// ── Friendly Auth Error Messages ──────────────────────────────────────────────
const AUTH_ERROR_MAP = {
  'auth/invalid-credential':                'Invalid email or password. Please try again.',
  'auth/user-not-found':                    'No account found with this email address.',
  'auth/wrong-password':                    'Incorrect password. Please try again.',
  'auth/email-already-in-use':             'An account already exists with this email.',
  'auth/weak-password':                     'Password must be at least 6 characters.',
  'auth/invalid-email':                     'Please enter a valid email address.',
  'auth/popup-closed-by-user':              'Google sign-in was cancelled.',
  'auth/network-request-failed':            'Network connection issue. Please check your internet.',
  'auth/too-many-requests':                 'Too many attempts. Please wait a moment and try again.'
};

export function friendlyAuthError(error) {
  return AUTH_ERROR_MAP[error?.code] || error?.message || 'An authentication error occurred.';
}

// ── Admin Quota Override ──────────────────────────────────────────────────────
/**
 * Directly override any user's storage limit (admin only).
 * @param {string} targetUid     - Firebase UID of the target user
 * @param {number} newLimitBytes - New storage limit in bytes
 */
export async function updateUserQuota(targetUid, newLimitBytes) {
  if (!targetUid || !newLimitBytes) throw new Error('Invalid UID or limit parameter.');
  const userRef = doc(db, 'users', targetUid);
  await updateDoc(userRef, {
    storageLimitBytes: Number(newLimitBytes),
    storageLimit:      Number(newLimitBytes),
    updatedAt:         serverTimestamp()
  });
  // Sync in-memory profile if the admin is overriding their own account
  if (currentProfile && currentProfile.uid === targetUid) {
    currentProfile.storageLimitBytes = Number(newLimitBytes);
    currentProfile.storageLimit      = Number(newLimitBytes);
  }
}
