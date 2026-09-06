/**
 * Zulora Drive — Firebase Client Configuration Module
 *
 * Uses Firebase Modular Web SDK v10.12.2 (Auth, Firestore, Cloud Storage).
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

import {
  getStorage,
  ref as storageRef,
  uploadBytesResumable,
  getDownloadURL,
  deleteObject
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js';

import {
  getFirestore,
  collection,
  doc,
  addDoc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  increment,
  runTransaction
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

// Exact Firebase Web App Project Configuration
export const firebaseConfig = {
  apiKey: "AIzaSyBGOtawcfRqXTm7jw5P3DB0qhJCUTmfyDc",
  authDomain: "zulora-drive.firebaseapp.com",
  projectId: "zulora-drive",
  storageBucket: "zulora-drive.firebasestorage.app",
  messagingSenderId: "715420173020",
  appId: "1:715420173020:web:46245edda3eb0f31edaa19"
};

// Initialize Firebase App
export const firebaseApp = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);

// Initialize Firebase Auth
export const auth = getAuth(firebaseApp);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

setPersistence(auth, browserLocalPersistence).catch((err) => {
  console.warn('[Zulora Firebase] Session persistence warning:', err.message);
});

// Initialize Cloud Storage & Firestore
export const storage = getStorage(firebaseApp, 'gs://zulora-drive.firebasestorage.app');
export const db = getFirestore(firebaseApp);

// Export Modular SDK Primitives
export {
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
  deleteObject,
  collection,
  doc,
  addDoc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  increment,
  runTransaction
};
