/**
 * Zulora Drive — Authentication & User Identity Management
 *
 * Implements:
 *   • Modular Firebase Auth handlers
 *   • Real-time profile bootstrapping directly in Firestore
 *   • Unique username & account ID generation
 *   • Automated referral system (+5 GB bonus)
 *   • Direct client-side Storage upload helper
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
  runTransaction
} from './firebase-config.js';

// Application Constants & Contact Specs
export const ADMIN_EMAIL = 'zulora.help@gmail.com';
export const SUPPORT_PHONE = '+91 6395211325';
export const SUPPORT_WHATSAPP = 'https://wa.me/916395211325?text=Hi%20Zulora%20Drive%20Support';
export const SUPPORT_EMAIL = 'zulora.help@gmail.com';
export const SUPPORT_UPI_ID = 'shivenpanwar@fam';
export const APP_DOMAIN = 'https://drive.zulora.in';
export const DEFAULT_STORAGE_BYTES = 10 * 1024 * 1024 * 1024; // 10 GB Free
export const REFERRAL_BONUS_BYTES = 5 * 1024 * 1024 * 1024;   // 5 GB Bonus

let currentUser = null;
let currentProfile = null;
let profileBootstrapPromise = null;

// =============================================
// IDENTITY HELPERS — Deterministic & Stable
// =============================================
export function deriveUsername(user) {
  const email = (user?.email || '').toLowerCase();
  const prefix = email.split('@')[0].replace(/[^a-z0-9_]/g, '') || 'user';
  return `@${prefix}`;
}

export function deriveAccountId(user) {
  const uid = (user?.uid || '000000').toUpperCase();
  return `ZUL-${uid.substring(0, 6)}`;
}

export function getReferralLink(user) {
  if (!user?.uid) return APP_DOMAIN;
  return `${APP_DOMAIN}/?ref=${user.uid}`;
}

export function getReferrerUidFromUrl() {
  try {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get('ref');
    if (ref && /^[A-Za-z0-9_-]{4,}$/.test(ref)) {
      localStorage.setItem('zulora_referrer_uid', ref);
      return ref;
    }
    return localStorage.getItem('zulora_referrer_uid') || null;
  } catch {
    return null;
  }
}

// =============================================
// DIRECT FIREBASE STORAGE UPLOAD HELPER
// =============================================
/**
 * Direct Client-Side Firebase Storage Upload:
 * Stores files under: users/${user.uid}/files/${Date.now()}_${cleanName}
 * Records metadata directly in Firestore: users/${user.uid}/files
 * Increments used quota in Firestore: users/${user.uid}
 */
export function uploadFileToFirebaseStorage(file, onProgress) {
  return new Promise((resolve, reject) => {
    const user = auth.currentUser || currentUser;
    if (!user) {
      const err = new Error('Please sign in first!');
      err.code = 'UNAUTHENTICATED';
      return reject(err);
    }

    const cleanName = (file.name || 'file').replace(/[\u0000-\u001f<>:"/\\|?*]/g, '_');
    const storagePath = `users/${user.uid}/files/${Date.now()}_${cleanName}`;
    const fileRef = storageRef(storage, storagePath);

    const metadata = {
      contentType: file.type || 'application/octet-stream',
      customMetadata: {
        originalName: file.name,
        ownerUid: user.uid,
        uploadedFrom: 'zulora-drive-web'
      }
    };

    const uploadTask = uploadBytesResumable(fileRef, file, metadata);

    uploadTask.on(
      'state_changed',
      (snapshot) => {
        const progress = snapshot.totalBytes > 0
          ? Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100)
          : 0;
        if (typeof onProgress === 'function') onProgress(progress);
      },
      (error) => {
        console.error('[Firebase Storage] Direct upload error:', error);
        reject(error);
      },
      async () => {
        try {
          const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);

          // Save file metadata entry into Firestore DB
          const fileDocRef = await addDoc(collection(db, 'users', user.uid, 'files'), {
            name: file.name,
            originalName: file.name,
            size: file.size,
            type: file.type || 'application/octet-stream',
            mimetype: file.type || 'application/octet-stream',
            url: downloadURL,
            storagePath,
            isStarred: false,
            uploadedAt: serverTimestamp(),
            updatedAt: serverTimestamp()
          });

          // Increment user's usedStorageBytes in Firestore
          try {
            await updateDoc(doc(db, 'users', user.uid), {
              usedStorageBytes: increment(file.size),
              storageUsed: increment(file.size),
              updatedAt: serverTimestamp()
            });
          } catch (updateErr) {
            console.warn('[Zulora] Quota update notice:', updateErr.message);
          }

          resolve({
            id: fileDocRef.id,
            name: file.name,
            originalName: file.name,
            size: file.size,
            type: file.type,
            mimetype: file.type,
            url: downloadURL,
            storagePath,
            isStarred: false,
            uploadedAt: new Date().toISOString()
          });
        } catch (dbErr) {
          console.error('[Firestore] Metadata save error:', dbErr);
          reject(dbErr);
        }
      }
    );
  });
}

// =============================================
// PROFILE & REFERRAL BOOTSTRAP IN FIRESTORE
// =============================================
export async function bootstrapUser() {
  const user = auth.currentUser || currentUser;
  if (!user) throw new Error('Not authenticated.');
  if (currentProfile) return currentProfile;

  if (!profileBootstrapPromise) {
    profileBootstrapPromise = (async () => {
      const userRef = doc(db, 'users', user.uid);
      const userSnap = await getDoc(userRef).catch(() => null);

      const email = user.email || '';
      const emailPrefix = email.split('@')[0] || 'user';
      const displayName = user.displayName || emailPrefix;
      const username = deriveUsername(user);
      const accountId = deriveAccountId(user);
      const referrerUid = getReferrerUidFromUrl();

      if (userSnap && userSnap.exists()) {
        const d = userSnap.data();
        currentProfile = {
          uid: user.uid,
          email,
          displayName: d.displayName || displayName,
          username: d.username || username,
          accountId: d.accountId || accountId,
          photoURL: d.photoURL || user.photoURL || '',
          storageLimitBytes: Number(d.storageLimitBytes || d.storageLimit || DEFAULT_STORAGE_BYTES),
          usedStorageBytes: Number(d.usedStorageBytes || d.storageUsed || 0),
          storageLimit: Number(d.storageLimitBytes || d.storageLimit || DEFAULT_STORAGE_BYTES),
          storageUsed: Number(d.usedStorageBytes || d.storageUsed || 0),
          planType: d.planType || 'Free',
          tier: d.tier || 'free',
          totalReferrals: Number(d.totalReferrals || 0),
          referralBonusBytes: Number(d.referralBonusBytes || 0),
          referralLink: getReferralLink(user),
          isAdmin: email.toLowerCase() === ADMIN_EMAIL
        };
        return currentProfile;
      }

      // Create new user profile document directly in Firestore
      const newProfile = {
        uid: user.uid,
        email,
        displayName,
        username,
        accountId,
        photoURL: user.photoURL || '',
        storageLimitBytes: DEFAULT_STORAGE_BYTES,
        usedStorageBytes: 0,
        storageLimit: DEFAULT_STORAGE_BYTES,
        storageUsed: 0,
        planType: 'Free',
        tier: 'free',
        totalReferrals: 0,
        referralBonusBytes: 0,
        referredBy: (referrerUid && referrerUid !== user.uid) ? referrerUid : null,
        referralProcessed: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };

      try {
        await setDoc(userRef, newProfile, { merge: true });
      } catch (err) {
        console.warn('[Zulora] Firestore setDoc notice:', err.message);
      }

      // Automatic referral bonus processing
      if (referrerUid && referrerUid !== user.uid) {
        applyReferralBonus(user.uid, referrerUid).catch((e) =>
          console.warn('[Zulora] Referral bonus notice:', e.message)
        );
      }

      currentProfile = {
        ...newProfile,
        referralLink: getReferralLink(user),
        isAdmin: email.toLowerCase() === ADMIN_EMAIL
      };

      return currentProfile;
    })().finally(() => {
      profileBootstrapPromise = null;
    });
  }

  return profileBootstrapPromise;
}

/**
 * Applies +5GB bonus to both new user and referrer in Firestore
 */
async function applyReferralBonus(newUserUid, referrerUid) {
  try {
    const newUserRef = doc(db, 'users', newUserUid);
    const referrerRef = doc(db, 'users', referrerUid);

    await runTransaction(db, async (tx) => {
      const [newSnap, refSnap] = await Promise.all([tx.get(newUserRef), tx.get(referrerRef)]);
      if (!newSnap.exists() || !refSnap.exists()) return;
      if (newSnap.data().referralProcessed) return;

      const newLimit = Number(newSnap.data().storageLimitBytes || DEFAULT_STORAGE_BYTES) + REFERRAL_BONUS_BYTES;
      const refLimit = Number(refSnap.data().storageLimitBytes || DEFAULT_STORAGE_BYTES) + REFERRAL_BONUS_BYTES;

      tx.update(newUserRef, {
        storageLimitBytes: newLimit,
        storageLimit: newLimit,
        referralBonusBytes: increment(REFERRAL_BONUS_BYTES),
        referralProcessed: true,
        updatedAt: serverTimestamp()
      });

      tx.update(referrerRef, {
        storageLimitBytes: refLimit,
        storageLimit: refLimit,
        referralBonusBytes: increment(REFERRAL_BONUS_BYTES),
        totalReferrals: increment(1),
        updatedAt: serverTimestamp()
      });
    });

    console.info(`[Zulora] Referral bonus awarded: new=${newUserUid}, referrer=${referrerUid}`);
  } catch (err) {
    console.warn('[Zulora] Referral transaction notice:', err.message);
  }
}

export async function refreshProfile() {
  const user = auth.currentUser || currentUser;
  if (!user) throw new Error('Not authenticated.');

  try {
    const snap = await getDoc(doc(db, 'users', user.uid));
    if (snap.exists()) {
      const d = snap.data();
      const email = user.email || '';
      currentProfile = {
        uid: user.uid,
        email,
        displayName: d.displayName || user.displayName || email.split('@')[0],
        username: d.username || deriveUsername(user),
        accountId: d.accountId || deriveAccountId(user),
        photoURL: d.photoURL || user.photoURL || '',
        storageLimitBytes: Number(d.storageLimitBytes || d.storageLimit || DEFAULT_STORAGE_BYTES),
        usedStorageBytes: Number(d.usedStorageBytes || d.storageUsed || 0),
        storageLimit: Number(d.storageLimitBytes || d.storageLimit || DEFAULT_STORAGE_BYTES),
        storageUsed: Number(d.usedStorageBytes || d.storageUsed || 0),
        planType: d.planType || 'Free',
        tier: d.tier || 'free',
        totalReferrals: Number(d.totalReferrals || 0),
        referralBonusBytes: Number(d.referralBonusBytes || 0),
        referralLink: getReferralLink(user),
        isAdmin: email.toLowerCase() === ADMIN_EMAIL
      };
      return currentProfile;
    }
  } catch (err) {
    console.warn('[Zulora] refreshProfile notice:', err.message);
  }

  return currentProfile || bootstrapUser();
}

export function getCurrentUser() {
  return auth.currentUser || currentUser;
}

export function getCurrentProfile() {
  return currentProfile;
}

export function setCurrentProfile(p) {
  currentProfile = p;
}

export function isAdmin(profile) {
  const email = profile?.email || auth.currentUser?.email || '';
  return email.toLowerCase().trim() === ADMIN_EMAIL;
}

// =============================================
// AUTH ACTIONS
// =============================================
export async function signInWithGoogle() {
  try {
    return await signInWithPopup(auth, googleProvider);
  } catch (err) {
    if (err.code === 'auth/popup-blocked' || err.code === 'auth/operation-not-supported-in-this-environment') {
      return signInWithRedirect(auth, googleProvider);
    }
    throw err;
  }
}

export async function signInWithEmail(email, password) {
  return signInWithEmailAndPassword(auth, email, password);
}

export async function registerWithEmail(email, password) {
  return createUserWithEmailAndPassword(auth, email, password);
}

export async function resetPassword(email) {
  return sendPasswordResetEmail(auth, email);
}

export async function logOut() {
  currentUser = null;
  currentProfile = null;
  profileBootstrapPromise = null;
  return signOut(auth);
}

export function onAuthChange(callback) {
  return onAuthStateChanged(auth, (user) => {
    currentUser = user;
    if (!user) {
      currentProfile = null;
      profileBootstrapPromise = null;
    }
    callback(user);
  });
}

// =============================================
// FRIENDLY AUTH ERROR MESSAGES
// =============================================
const AUTH_ERROR_MAP = {
  'auth/invalid-credential': 'Invalid email or password. Please try again.',
  'auth/user-not-found': 'No account found with this email address.',
  'auth/wrong-password': 'Incorrect password. Please try again.',
  'auth/email-already-in-use': 'An account already exists with this email.',
  'auth/weak-password': 'Password must be at least 6 characters.',
  'auth/invalid-email': 'Please enter a valid email address.',
  'auth/popup-closed-by-user': 'Google sign-in was cancelled.',
  'auth/network-request-failed': 'Network connection issue. Please check your internet.',
  'auth/too-many-requests': 'Too many attempts. Please wait a moment and try again.'
};

export function friendlyAuthError(error) {
  return AUTH_ERROR_MAP[error?.code] || error?.message || 'An authentication error occurred.';
}
