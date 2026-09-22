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
  sendEmailVerification,
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
// ── Disposable / Temp-Mail Domain Blacklist ───────────────────────────────────
/**
 * Comprehensive blacklist of known disposable, temporary, and throwaway email
 * providers. Updated list of 60+ domains covering the most common abuse vectors.
 * Client-side check only — server-side Firestore rules enforce email_verified.
 */
export const DISPOSABLE_EMAIL_DOMAINS = new Set([
  // Classic temp-mail giants
  'tempmail.com', 'temp-mail.org', 'temp-mail.io', 'tempmail.net', 'tempinbox.com',
  'mailinator.com', 'mailinator.net', 'maildrop.cc', 'mailnull.com', 'mailnesia.com',
  '10minutemail.com', '10minutemail.net', '10minutemail.org', '10minemail.com',
  'guerrillamail.com', 'guerrillamail.net', 'guerrillamail.org', 'guerrillamail.de',
  'guerrillamail.biz', 'guerrillamail.info', 'guerrillamailblock.com',
  'throwam.com', 'throwamailaway.net', 'throwawaymail.com', 'throwam.net',
  'yopmail.com', 'yopmail.fr', 'cool.fr.nf', 'jetable.fr.nf', 'nospam.ze.tc',
  'nomail.xl.cx', 'mega.zik.dj', 'speed.1s.fr', 'courriel.fr.nf', 'moncourrier.fr.nf',
  'dispostable.com', 'discard.email', 'discardmail.com', 'discardmail.de',
  'spamgourmet.com', 'spamgourmet.net', 'spamgourmet.org',
  'trashmail.com', 'trashmail.me', 'trashmail.at', 'trashmail.io', 'trashmail.net',
  'trashmail.org', 'trashmailer.com', 'trashmail.xyz',
  'sharklasers.com', 'guerrillamailblock.com', 'grr.la', 'guerrillamail.info',
  'spam4.me', 'spamfree24.org', 'spamfree.eu',
  'fakeinbox.com', 'fakemail.fr', 'fakemail.net',
  'mailnull.com', 'mailtemp.info', 'mailtemp.net',
  'getnada.com', 'getairmail.com', 'getonemail.com',
  'mohmal.com', 'mailpoof.com', 'mailsac.com',
  'spamevader.net', 'spaml.de', 'spamthisplease.com',
  'emailondeck.com', 'emailfake.com',
  'crap.handcrafted.jp', 'filzmail.com', 'fleckens.hu',
  'zetmail.com', 'zzrgg.com', 'binkmail.com',
  'haltospam.com', 'ieatspam.eu', 'ieatspam.info',
  'jetable.com', 'jetable.net', 'jetable.org', 'jetable.pp.ua',
  'kurzepost.de', 'lifebyfood.com', 'link2mail.net',
  'mt2009.com', 'mt2014.com', 'mytempemail.com', 'mytrashmail.com',
  'noclickemail.com', 'nofaux.com', 'nwytg.net',
  'objectmail.com', 'odnorazovoe.ru',
  'pookmail.com', 'rootfest.net', 'rppkn.com',
  's0ny.net', 'safe-mail.net', 'saynotospams.com',
  'teleworm.us', 'tempalias.com', 'tempe-mail.com', 'tempemail.biz',
  'tempemail.co.za', 'tempthe.net', 'thankyou2010.com',
  'thelimousine.com', 'thisisnotmyrealemail.com', 'thisurl.website',
  'throwam.com', 'tmail.com', 'tmail.io', 'tmpeml.com',
  'vpn.st', 'webemail.me', 'wegwerfmail.de', 'wegwerfmail.net',
  'wegwerfmail.org', 'wetrainbayarea.org', 'wh4f.org',
  'xagloo.com', 'xemaps.com', 'xents.com', 'xmaily.com', 'xoxy.net',
  'yapped.net', 'yep.it', 'yomail.info', 'yuurok.com',
  'z1p.biz', 'zhorachu.com', 'zippymail.info', 'zoemail.net',
  'zomg.info', 'zxcv.com'
]);

/**
 * Returns true if the email domain belongs to a known disposable/temp provider.
 * Case-insensitive. Used as a client-side gate before Firebase registration.
 * @param {string} email
 * @returns {boolean}
 */
export function isDisposableEmail(email) {
  if (!email || typeof email !== 'string') return false;
  const parts  = email.toLowerCase().trim().split('@');
  if (parts.length !== 2 || !parts[1]) return false;
  const domain = parts[1];
  // Exact domain match
  if (DISPOSABLE_EMAIL_DOMAINS.has(domain)) return true;
  // Subdomain match (e.g. user@mail.mailinator.com)
  const tld2 = domain.split('.').slice(-2).join('.');
  return DISPOSABLE_EMAIL_DOMAINS.has(tld2);
}


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
    const ref    = params.get('ref') || params.get('referrer');
    if (ref && /^[A-Za-z0-9_-]{4,}$/.test(ref)) {
      localStorage.setItem('zulora_pending_referrer', ref);
      return ref;
    }
    return localStorage.getItem('zulora_pending_referrer') || null;
  } catch {
    return null;
  }
}

// Capture referral links as soon as the auth module loads, before sign-in.
getReferrerUidFromUrl();

const BLOCKED_UPLOAD_EXTENSIONS = new Set(['exe', 'bat', 'sh', 'php', 'js', 'html']);

export function validateUploadFile(file) {
  if (!file || typeof file.name !== 'string') throw new Error('Invalid upload file.');
  const extension = file.name.includes('.') ? file.name.split('.').pop().toLowerCase() : '';
  if (BLOCKED_UPLOAD_EXTENSIONS.has(extension)) {
    throw new Error('Executable and script files are not allowed.');
  }
  if (Number(file.size) > MAX_STARTER_FILE_BYTES) {
    throw new Error('This file exceeds the 500 MB maximum file size.');
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
    try {
      validateUploadFile(file);
    } catch (err) {
      reject(err);
      return;
    }
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
    xhr.timeout = 180000; // 3 minutes timeout

    xhr.upload.onloadstart = () => {
      if (typeof onProgress === 'function') onProgress(5, 'Starting...');
    };

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && e.total > 0) {
        const percent = Math.min(99, Math.round((e.loaded / e.total) * 100));
        if (typeof onProgress === 'function') onProgress(percent, `${percent}%`);
      } else {
        if (typeof onProgress === 'function') onProgress(50, 'Uploading...');
      }
    };

    xhr.upload.onload = () => {
      if (typeof onProgress === 'function') onProgress(100, 'Saving...');
    };

    xhr.onload = async () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const response = JSON.parse(xhr.responseText);

          const fileId = doc(collection(db, 'files')).id;
          const userUid = activeUser ? activeUser.uid : "guest";
          const fileMetadata = {
            fileName:           file.name,
            fileSize:           file.size,
            fileType:           file.type || 'application/octet-stream',
            fileUrl:            response.secure_url,
            cloudinaryPublicId: response.public_id,
            uploadedAt:         firebase.firestore.FieldValue.serverTimestamp(),
            userUid:            userUid,
            isTrashed:          false,
            // Compatible mirror fields for UI renderer & queries
            id:                 fileId,
            name:               file.name,
            originalName:       file.name,
            type:               file.type || 'application/octet-stream',
            mimetype:           file.type || 'application/octet-stream',
            size:               file.size,
            url:                response.secure_url,
            userEmail:          activeUser?.email || '',
            userName:           activeUser?.displayName || (activeUser?.email ? activeUser.email.split('@')[0] : 'User'),
            isStarred:          false,
            isTrash:            false,
            createdAt:          firebase.firestore.FieldValue.serverTimestamp(),
            updatedAt:          firebase.firestore.FieldValue.serverTimestamp()
          };

          // Store metadata in both users/{userId}/files/{fileId} AND files/{fileId}
          await Promise.all([
            setDoc(doc(db, 'users', activeUser.uid, 'files', fileId), fileMetadata),
            setDoc(doc(db, 'files', fileId), fileMetadata)
          ]);

          // Increment user quota counters in Firestore
          try {
            await updateDoc(doc(db, 'users', activeUser.uid), {
              storageUsedBytes: increment(file.size),
              usedStorageBytes: increment(file.size),
              storageUsed:      increment(file.size),
              updatedAt:        serverTimestamp()
            });
          } catch (qErr) {
            console.warn('[Zulora] Quota increment notice:', qErr.message);
          }

          resolve({
            id:                 fileId,
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
        let errMsg = `Upload failed (HTTP ${xhr.status})`;
        try {
          const errObj = JSON.parse(xhr.responseText);
          if (errObj.error && errObj.error.message) errMsg = errObj.error.message;
        } catch (_) {
          if (xhr.statusText) errMsg = xhr.statusText;
        }
        console.error('Upload error:', errMsg, xhr.responseText);
        reject(new Error(errMsg));
      }
    };

    xhr.onerror = () => {
      console.error('Network/CORS error during Cloudinary upload');
      reject(new Error('Network/CORS error uploading to Cloudinary'));
    };

    xhr.ontimeout = () => {
      console.error('Timeout during Cloudinary upload');
      reject(new Error('Upload timed out. Check your connection.'));
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

      // Calculate storageUsedBytes from sum of all uploaded file sizes
      let storageUsedBytes = 0;
      try {
        const filesSnap = await getDocs(collection(db, 'users', user.uid, 'files'));
        filesSnap.forEach((docSnap) => {
          const d = docSnap.data();
          storageUsedBytes += Number(d.fileSize ?? d.size ?? 0);
        });
      } catch (sumErr) {
        console.warn('[Zulora] Storage sum calculation notice:', sumErr.message);
      }

      if (userSnap && userSnap.exists()) {
        const d = userSnap.data();
        const updatedData = {
          name:             displayName,
          displayName:      displayName,
          email,
          photoURL:         user.photoURL || '',
          uid:              user.uid,
          lastLogin:        serverTimestamp(),
          storageUsedBytes: storageUsedBytes,
          usedStorageBytes: storageUsedBytes,
          storageUsed:      storageUsedBytes,
          updatedAt:        serverTimestamp()
        };
        await setDoc(userRef, updatedData, { merge: true }).catch((err) =>
          console.warn('[Zulora] User update notice:', err.message)
        );
        currentProfile = buildProfile(user, { ...d, ...updatedData });
        return currentProfile;
      }

      // First sign-in: create profile document
      const newProfileData = {
        name:               displayName,
        uid:                user.uid,
        email,
        displayName,
        username,
        accountId,
        photoURL:           user.photoURL || '',
        lastLogin:          serverTimestamp(),
        storageUsedBytes:   storageUsedBytes,
        storageLimitBytes:  DEFAULT_STORAGE_BYTES,   // 10 GB
        usedStorageBytes:   storageUsedBytes,
        storageLimit:       DEFAULT_STORAGE_BYTES,
        storageUsed:        storageUsedBytes,
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

      // Apply referral bonuses atomically and clear the pending claim only after success.
      if (referrerUid && referrerUid !== user.uid) {
        await applyReferralBonus(user.uid, referrerUid);
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
  const displayName = d.name || d.displayName || user.displayName || email.split('@')[0] || 'User';
  const storageUsed = Number(d.storageUsedBytes ?? d.usedStorageBytes ?? d.storageUsed ?? 0);
  return {
    uid:                user.uid,
    name:               displayName,
    email,
    displayName:        displayName,
    username:           d.username    || deriveUsername(user),
    accountId:          d.accountId   || deriveAccountId(user),
    photoURL:           d.photoURL    || user.photoURL || '',
    storageUsedBytes:   storageUsed,
    storageLimitBytes:  Number(d.storageLimitBytes || d.storageLimit || DEFAULT_STORAGE_BYTES),
    usedStorageBytes:   storageUsed,
    storageLimit:       Number(d.storageLimitBytes || d.storageLimit || DEFAULT_STORAGE_BYTES),
    storageUsed:        storageUsed,
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
  if (!referrerUid || referrerUid === newUserUid) return false;
  const claimRef = doc(db, 'referrals', `${newUserUid}_${referrerUid}`);
  const newUserRef = doc(db, 'users', newUserUid);
  const referrerRef = doc(db, 'users', referrerUid);

  const rewardApplied = await runTransaction(db, async (tx) => {
    const [claimSnap, newSnap, refSnap] = await Promise.all([
      tx.get(claimRef), tx.get(newUserRef), tx.get(referrerRef)
    ]);
    if (claimSnap.exists()) return true;
    if (!newSnap.exists() || !refSnap.exists()) return false;

    const newLimit = Number(newSnap.data().storageLimitBytes || DEFAULT_STORAGE_BYTES) + REFERRAL_BONUS_BYTES;
    const refLimit = Number(refSnap.data().storageLimitBytes || DEFAULT_STORAGE_BYTES) + REFERRAL_BONUS_BYTES;
    tx.set(claimRef, {
      newUserUid, referrerUid, rewardBytes: REFERRAL_BONUS_BYTES, createdAt: serverTimestamp()
    });
    tx.update(newUserRef, {
      storageLimitBytes: newLimit, storageLimit: newLimit,
      referralBonusBytes: increment(REFERRAL_BONUS_BYTES), referredBy: referrerUid,
      referralProcessed: true, updatedAt: serverTimestamp()
    });
    tx.update(referrerRef, {
      storageLimitBytes: refLimit, storageLimit: refLimit,
      referralBonusBytes: increment(REFERRAL_BONUS_BYTES), totalReferrals: increment(1),
      lastReferralUid: newUserUid,
      updatedAt: serverTimestamp()
    });
    return true;
  });

  if (rewardApplied) localStorage.removeItem('zulora_pending_referrer');
  console.info(`[Zulora] Referral bonus applied — new: ${newUserUid}, referrer: ${referrerUid}`);
  return true;
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
export const resetPassword      = (email)      => sendPasswordResetEmail(auth, email);

/**
 * Secure email registration flow:
 *   1. Blocks known disposable / temp-mail domains before any Firebase call.
 *   2. Creates the Firebase account.
 *   3. Immediately sends a verification link to the user's inbox.
 *   4. Signs the user back out so they cannot access the dashboard unverified.
 *
 * @param {string} email
 * @param {string} password
 * @returns {Promise<{ verificationSent: true }>}
 * @throws {Error} with code 'DISPOSABLE_EMAIL' if a temp-mail domain is detected
 */
export async function registerWithEmailSecure(email, password) {
  // ── Gate 1: Client-side disposable email check ─────────────────────────────
  if (isDisposableEmail(email)) {
    const err = new Error(
      'Temporary or disposable email addresses are strictly prohibited. ' +
      'Please use a valid personal email or sign in with Google.'
    );
    err.code = 'DISPOSABLE_EMAIL';
    throw err;
  }

  // ── Gate 2: Create Firebase account ────────────────────────────────────────
  const credential = await createUserWithEmailAndPassword(auth, email, password);
  const user       = credential.user;

  // ── Gate 3: Fire verification email ────────────────────────────────────────
  try {
    await sendEmailVerification(user, {
      // After clicking the link, send users directly to the app
      url: 'https://drive.zulora.in/login.html?verified=1'
    });
  } catch (verifyErr) {
    console.warn('[Zulora] sendEmailVerification notice:', verifyErr.message);
    // Non-fatal — account still created, let the caller handle UI
  }

  // ── Gate 4: Sign out immediately — deny dashboard access until verified ─────
  try {
    await signOut(auth);
  } catch (signOutErr) {
    console.warn('[Zulora] Post-registration signOut notice:', signOutErr.message);
  }

  return { verificationSent: true, email };
}

// Backward-compatible alias — replaces the old one-liner
export const registerWithEmail = registerWithEmailSecure;

/**
 * Re-sends the Firebase email verification link to an already-registered but
 * unverified user. Signs in temporarily, checks status, fires the email, then
 * signs out again.
 *
 * @param {string} email
 * @param {string} password
 * @returns {Promise<{ sent: boolean, alreadyVerified: boolean }>}
 */
export async function resendVerificationEmail(email, password) {
  let credential = null;
  try {
    credential = await signInWithEmailAndPassword(auth, email, password);
  } catch (signInErr) {
    const friendlyMsg = AUTH_ERROR_MAP[signInErr?.code] || signInErr.message;
    throw new Error(friendlyMsg);
  }

  const user = credential.user;

  // Reload to get the freshest token (in case they already clicked the link)
  await user.reload();
  const refreshedUser = auth.currentUser;

  if (refreshedUser?.emailVerified) {
    await signOut(auth);
    return { sent: false, alreadyVerified: true };
  }

  // Re-send the verification email
  try {
    await sendEmailVerification(refreshedUser, {
      url: 'https://drive.zulora.in/login.html?verified=1'
    });
  } catch (err) {
    console.warn('[Zulora] resendVerificationEmail notice:', err.message);
    throw new Error('Failed to resend verification email. Please try again shortly.');
  }

  // Sign out again — keep them locked out until they verify
  await signOut(auth).catch(() => {});

  return { sent: true, alreadyVerified: false };
}



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
