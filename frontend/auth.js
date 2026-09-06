/**
 * Zulora Drive — Authentication, Firebase Client & Auth Helpers
 *
 * Firebase Modular SDK v10 — Handles:
 *   • Firebase App initialization with exact project credentials
 *   • Google + Email/Password authentication
 *   • Persistent local session management
 *   • Authenticated API fetch wrapper
 *   • User profile bootstrapping & realtime refresh
 *   • Referral link tracking via URL ?ref= param & localStorage
 */

import { initializeApp, getApps } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  setPersistence,
  browserLocalPersistence,
  sendPasswordResetEmail
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';

// =============================================
// FIREBASE CONFIG — Exact Project Credentials
// =============================================
const firebaseConfig = {
  apiKey: "AIzaSyBGOtawcfRqXTm7jw5P3DB0qhJCUTmfyDc",
  authDomain: "zulora-drive.firebaseapp.com",
  projectId: "zulora-drive",
  storageBucket: "zulora-drive.firebasestorage.app",
  messagingSenderId: "715420173020",
  appId: "1:715420173020:web:46245edda3eb0f31edaa19"
};

const firebaseApp = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);

// Google Auth Provider setup
const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

// Persist session across tabs/refreshes
setPersistence(auth, browserLocalPersistence).catch((err) => {
  console.warn('[ZuloraAuth] Persistence warning:', err.message);
});

// =============================================
// CONSTANTS
// =============================================
export const ADMIN_EMAIL = 'zulora.help@gmail.com';
export const SUPPORT_PHONE = '+91 6395211325';
export const SUPPORT_WHATSAPP = 'https://wa.me/916395211325?text=Hi%20Zulora%20Drive%20Support';
export const SUPPORT_EMAIL = 'zulora.help@gmail.com';
export const SUPPORT_UPI_ID = 'shivenpanwar@fam';
export const APP_DOMAIN = 'https://drive.zulora.in';

// =============================================
// STATE
// =============================================
let currentUser = null;
let currentProfile = null;
let profileBootstrapPromise = null;

// =============================================
// IDENTITY HELPERS — Exact User Identity Spec
// =============================================
/**
 * Derives unique dedicated username:
 * Pattern: @ + user.email.split('@')[0].toLowerCase()
 */
export function deriveUsername(user) {
  const email = (user?.email || '').toLowerCase();
  const prefix = email.split('@')[0].replace(/[^a-z0-9_]/g, '') || 'user';
  return `@${prefix}`;
}

/**
 * Derives unique dedicated Account ID:
 * Pattern: ZUL- + user.uid.substring(0, 6).toUpperCase()
 */
export function deriveAccountId(user) {
  const uid = (user?.uid || '000000').toUpperCase();
  return `ZUL-${uid.substring(0, 6)}`;
}

/**
 * Returns the shareable referral link for a user:
 * https://drive.zulora.in/?ref={USER_UID}
 */
export function getReferralLink(user) {
  if (!user?.uid) return APP_DOMAIN;
  return `${APP_DOMAIN}/?ref=${user.uid}`;
}

/**
 * Extracts ?ref= from URL and persists to localStorage for multi-page onboarding.
 */
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
// AUTHENTICATED API WRAPPER
// =============================================
export async function api(path, options = {}) {
  const token = await getIdToken();
  const headers = new Headers(options.headers || {});
  headers.set('Authorization', `Bearer ${token}`);
  headers.set('Bypass-Tunnel-Reminder', 'true');

  if (options.body && !(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  let response;
  try {
    response = await fetch(path, { ...options, headers });
  } catch (err) {
    throw new Error('Cannot connect to Zulora Drive. Please check your internet connection.');
  }

  if (response.status === 204) return null;

  const contentType = response.headers.get('content-type') || '';
  const isJson = contentType.includes('application/json');
  const data = isJson ? await response.json().catch(() => null) : null;

  if (!response.ok) {
    const errorMsg = data?.error || `Request failed (${response.status}).`;
    const err = new Error(errorMsg);
    err.status = response.status;
    err.code = data?.code;
    throw err;
  }

  return data;
}

// =============================================
// TOKEN
// =============================================
export async function getIdToken(forceRefresh = false) {
  const user = auth.currentUser || currentUser;
  if (!user) throw new Error('Not authenticated. Please sign in.');
  return user.getIdToken(forceRefresh);
}

// =============================================
// BOOTSTRAP & PROFILE
// =============================================
export async function bootstrapUser() {
  const user = auth.currentUser || currentUser;
  if (!user) throw new Error('Not authenticated.');
  if (currentProfile) return currentProfile;

  if (!profileBootstrapPromise) {
    const referrerUid = getReferrerUidFromUrl();

    profileBootstrapPromise = api('/api/users/me/bootstrap', {
      method: 'POST',
      body: JSON.stringify({
        displayName: user.displayName || user.email.split('@')[0],
        username: deriveUsername(user),
        accountId: deriveAccountId(user),
        photoURL: user.photoURL || '',
        referrerUid: referrerUid || null
      })
    })
      .then((res) => {
        currentProfile = res.profile;
        return currentProfile;
      })
      .catch((err) => {
        console.warn('[ZuloraAuth] Bootstrap error — attempting profile refresh:', err.message);
        return refreshProfile().catch(() => buildLocalProfile(user));
      })
      .finally(() => {
        profileBootstrapPromise = null;
      });
  }
  return profileBootstrapPromise;
}

function buildLocalProfile(user) {
  const email = user?.email || '';
  const emailPrefix = email.split('@')[0] || 'user';
  return {
    uid: user.uid,
    email: user.email,
    displayName: user.displayName || emailPrefix,
    username: deriveUsername(user),
    accountId: deriveAccountId(user),
    photoURL: user.photoURL || '',
    storageLimitBytes: 10 * 1024 * 1024 * 1024,
    usedStorageBytes: 0,
    planType: 'Free',
    tier: 'free',
    isAdmin: email.toLowerCase() === ADMIN_EMAIL,
    _isLocalFallback: true
  };
}

export async function refreshProfile() {
  const res = await api('/api/user/profile');
  currentProfile = res.profile;
  return currentProfile;
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

export { auth, firebaseApp, firebaseConfig };
