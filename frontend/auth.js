/**
 * Zulora Drive — Authentication Module
 *
 * Centralizes all Firebase Authentication concerns:
 *   • Firebase App + Auth initialization
 *   • Google Sign-In via popup
 *   • Email / password sign-in and registration
 *   • ID-token retrieval for authenticated API calls
 *   • Auth-state observation (onAuthStateChanged)
 *   • Admin-email detection
 *   • Profile bootstrap against the backend API
 *
 * Every other frontend module imports from this file instead of
 * touching Firebase SDKs directly.
 */

import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js';
import {
  GoogleAuthProvider,
  getAuth,
  onAuthStateChanged,
  setPersistence,
  browserLocalPersistence,
  signInWithPopup,
  signInWithRedirect,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut
} from 'https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js';

// ─── Firebase Configuration ────────────────────────────────────────────────────
const firebaseConfig = {
  apiKey: 'AIzaSyBGOtawcfRqXTm7jw5P3DB0qhJCUTmfyDc',
  authDomain: 'zulora-drive.firebaseapp.com',
  projectId: 'zulora-drive',
  storageBucket: 'zulora-drive.firebasestorage.app',
  messagingSenderId: '715420173020',
  appId: '1:715420173020:web:46245edda3eb0f31edaa19'
};

const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);

// Google provider — always prompt account selection.
const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

// Set persistence so sessions survive page reloads.
setPersistence(auth, browserLocalPersistence).catch((err) =>
  console.warn('Unable to set auth persistence.', err)
);

// ─── Constants ──────────────────────────────────────────────────────────────────
const ADMIN_EMAIL = 'zulora.help@gmail.com';
const API_BASE_URL = 'https://zulora-drive-backend.onrender.com';

// ─── State ──────────────────────────────────────────────────────────────────────
let currentUser = null;
let currentProfile = null;
let profileBootstrapPromise = null;

// ─── Token helpers ──────────────────────────────────────────────────────────────

/**
 * Return a fresh Firebase ID token for the current user.
 * Throws if no user is signed in.
 */
async function getIdToken() {
  const user = auth.currentUser || currentUser;
  if (!user) throw new Error('Please sign in to continue.');
  return user.getIdToken();
}

// ─── API wrapper ────────────────────────────────────────────────────────────────

/**
 * Authenticated fetch wrapper. Automatically attaches the Bearer token.
 * @param {string} path   - API path starting with `/api/…`
 * @param {RequestInit} options  - Standard fetch options (method, body, etc.)
 * @returns {Promise<any|null>} Parsed JSON body, or null for 204 No Content.
 */
async function api(path, options = {}) {
  const headers = new Headers(options.headers || {});
  headers.set('Authorization', `Bearer ${await getIdToken()}`);
  headers.set('Bypass-Tunnel-Reminder', 'true');
  if (options.body && !(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  let response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, { ...options, headers });
  } catch {
    throw new Error(
      `Cannot reach the Zulora Drive server at ${API_BASE_URL}. ` +
      'Confirm that the backend is running.'
    );
  }
  if (response.status === 204) return null;
  const ct = response.headers.get('content-type') || '';
  const payload = ct.includes('application/json') ? await response.json() : null;
  if (!response.ok) throw new Error(payload?.error || `API request failed (${response.status}).`);
  return payload;
}

// ─── Profile bootstrap ─────────────────────────────────────────────────────────

/**
 * Bootstrap (or fetch) the signed-in user's Firestore profile on the backend.
 * Sends displayName and photoURL from the Firebase Auth user record so the
 * backend can create / update the Firestore `users/{uid}` document.
 * New users automatically receive 10 GB storage (Starter plan).
 */
async function bootstrapUser() {
  if (!auth.currentUser) throw new Error('Please sign in to continue.');
  if (currentProfile) return currentProfile;
  if (!profileBootstrapPromise) {
    profileBootstrapPromise = api('/api/users/me/bootstrap', {
      method: 'POST',
      body: JSON.stringify({
        displayName: auth.currentUser.displayName || '',
        photoURL: auth.currentUser.photoURL || ''
      })
    })
      .then((data) => { currentProfile = data.profile; return currentProfile; })
      .finally(() => { profileBootstrapPromise = null; });
  }
  return profileBootstrapPromise;
}

/**
 * Re-fetch the profile from the backend (e.g. after uploading or deleting a file).
 */
async function refreshProfile() {
  const data = await api('/api/users/me');
  currentProfile = data.profile;
  return currentProfile;
}

// ─── Sign-in helpers ────────────────────────────────────────────────────────────

/** Google Sign-In via popup. Returns the Firebase UserCredential. */
async function signInWithGoogle() {
  try {
    return await signInWithPopup(auth, googleProvider);
  } catch (error) {
    if (['auth/popup-blocked', 'auth/operation-not-supported-in-this-environment'].includes(error.code)) {
      return signInWithRedirect(auth, googleProvider);
    }
    throw error;
  }
}

/** Email + password sign-in. */
async function signInWithEmail(email, password) {
  return signInWithEmailAndPassword(auth, email, password);
}

/** Email + password registration (creates a new Firebase Auth user). */
async function registerWithEmail(email, password) {
  return createUserWithEmailAndPassword(auth, email, password);
}

/** Sign the current user out and clear cached profile state. */
async function logOut() {
  currentUser = null;
  currentProfile = null;
  profileBootstrapPromise = null;
  return signOut(auth);
}

// ─── Admin detection ────────────────────────────────────────────────────────────

/** Check whether a profile object belongs to the super-admin. */
function isAdmin(profile) {
  return Boolean(profile && String(profile.email || '').trim().toLowerCase() === ADMIN_EMAIL);
}

// ─── Auth-state observation ─────────────────────────────────────────────────────

/**
 * Subscribe to Firebase Auth state changes.
 * Updates the module-level `currentUser` automatically.
 * @param {(user: import('firebase/auth').User | null) => void} callback
 * @returns {import('firebase/auth').Unsubscribe}
 */
function onAuthChange(callback) {
  return onAuthStateChanged(auth, (user) => {
    currentUser = user;
    if (!user) { currentProfile = null; profileBootstrapPromise = null; }
    callback(user);
  });
}

// ─── Friendly error messages ────────────────────────────────────────────────────

const AUTH_MESSAGES = {
  'auth/invalid-credential': 'That email or password is incorrect.',
  'auth/email-already-in-use': 'An account already exists for this email.',
  'auth/weak-password': 'Use a password with at least 6 characters.',
  'auth/invalid-email': 'Enter a valid email address.',
  'auth/popup-closed-by-user': 'Sign-in was cancelled.'
};

function friendlyAuthError(error) {
  return AUTH_MESSAGES[error.code] || error.message || 'Authentication failed. Please try again.';
}

// ─── Public API ─────────────────────────────────────────────────────────────────

export {
  // Firebase primitives
  auth,
  firebaseApp,
  firebaseConfig,

  // Auth actions
  signInWithGoogle,
  signInWithEmail,
  registerWithEmail,
  logOut,

  // Token + API
  getIdToken,
  api,

  // Profile
  bootstrapUser,
  refreshProfile,

  // State accessors
  onAuthChange,
  isAdmin,

  // Helpers
  friendlyAuthError,

  // Constants
  ADMIN_EMAIL,
  API_BASE_URL
};

// Re-export current state as getters so consumers always see fresh values.
export function getCurrentUser() { return currentUser; }
export function getCurrentProfile() { return currentProfile; }
export function setCurrentProfile(profile) { currentProfile = profile; }

