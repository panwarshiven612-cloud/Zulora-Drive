/**
 * Zulora Drive — Authentication & Firebase Client Module
 *
 * Centralizes Firebase Auth v10/v11 modular SDK, token management,
 * and authenticated API interactions.
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

// Exact Client Firebase Configuration
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

// Configure Google Auth Provider
const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

// Set persistent local browser session
setPersistence(auth, browserLocalPersistence).catch((err) => {
  console.warn('[Zulora Auth] Local persistence warning:', err);
});

const ADMIN_EMAIL = 'zulora.help@gmail.com';
let currentUser = null;
let currentProfile = null;
let profileBootstrapPromise = null;

/**
 * Retrieves valid Firebase ID Token for authenticated requests
 */
export async function getIdToken(forceRefresh = false) {
  const user = auth.currentUser || currentUser;
  if (!user) throw new Error('Please sign in to continue.');
  return user.getIdToken(forceRefresh);
}

/**
 * Authenticated API Fetch Wrapper
 */
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
    console.error('[Zulora API] Fetch failed:', err);
    throw new Error('Cannot connect to Zulora Drive server. Please check your internet connection.');
  }

  if (response.status === 204) return null;

  const contentType = response.headers.get('content-type') || '';
  const isJson = contentType.includes('application/json');
  const data = isJson ? await response.json() : null;

  if (!response.ok) {
    const errorMsg = data?.error || `API request failed with status ${response.status}.`;
    const err = new Error(errorMsg);
    err.status = response.status;
    err.code = data?.code;
    throw err;
  }

  return data;
}

export const SUPPORT_PHONE = '+91 6395211325';
export const SUPPORT_WHATSAPP = 'https://wa.me/916395211325?text=Hi%20Zulora%20Drive%20Support';
export const SUPPORT_EMAIL = 'zulora.help@gmail.com';
export const SUPPORT_UPI_ID = 'shivenpanwar@fam';

/**
 * Bootstrap or initialize user document in Firestore upon login
 */
export async function bootstrapUser() {
  const user = auth.currentUser || currentUser;
  if (!user) throw new Error('User not signed in.');
  if (currentProfile) return currentProfile;

  const email = user.email || '';
  const emailPrefix = email.split('@')[0] || 'user';
  const uidSuffix = (user.uid || '').substring(0, 4);
  const username = '@' + (emailPrefix.replace(/[^a-zA-Z0-9_]/g, '') + '_' + uidSuffix).toLowerCase();
  const displayName = user.displayName || emailPrefix;

  if (!profileBootstrapPromise) {
    profileBootstrapPromise = api('/api/users/me/bootstrap', {
      method: 'POST',
      body: JSON.stringify({
        displayName: displayName,
        username: username,
        photoURL: user.photoURL || ''
      })
    })
      .then((res) => {
        currentProfile = res.profile;
        return currentProfile;
      })
      .finally(() => {
        profileBootstrapPromise = null;
      });
  }
  return profileBootstrapPromise;
}

/**
 * Re-fetches latest profile (used storage, quota, plan) in realtime
 */
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
  const email = profile?.email || auth.currentUser?.email;
  return String(email || '').trim().toLowerCase() === ADMIN_EMAIL;
}

// Authentication Actions
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

const AUTH_ERROR_MAP = {
  'auth/invalid-credential': 'Invalid email or password.',
  'auth/user-not-found': 'No account exists with this email.',
  'auth/wrong-password': 'Incorrect password.',
  'auth/email-already-in-use': 'An account already exists with this email address.',
  'auth/weak-password': 'Password should be at least 6 characters.',
  'auth/invalid-email': 'Please enter a valid email address.',
  'auth/popup-closed-by-user': 'Google sign-in was cancelled.',
  'auth/network-request-failed': 'Network connection issue. Please check your internet.'
};

export function friendlyAuthError(error) {
  return AUTH_ERROR_MAP[error?.code] || error?.message || 'Authentication error occurred.';
}

export {
  auth,
  firebaseApp,
  firebaseConfig,
  ADMIN_EMAIL
};
