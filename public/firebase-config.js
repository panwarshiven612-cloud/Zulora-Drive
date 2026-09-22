/**
 * Zulora Drive — Firebase Client Configuration Module
 *
 * Firebase Modular Web SDK v10.12.2 (Auth, Firestore, Cloud Storage).
 * Exact project config as specified in the production deployment brief.
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
  sendPasswordResetEmail,
  sendEmailVerification
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
  runTransaction,
  query,
  orderBy,
  onSnapshot
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

// ── Official Zulora Drive Firebase Project Configuration ──────────────────────
export const firebaseConfig = {
  apiKey: "AIzaSyBGOtawcfRqXTm7jw5P3DB0qhJCUTmfyDc",
  authDomain: "zulora-drive.firebaseapp.com",
  projectId: "zulora-drive",
  storageBucket: "zulora-drive.firebasestorage.app",
  messagingSenderId: "715420173020",
  appId: "1:715420173020:web:46245edda3eb0f31edaa19"
};

// Initialize Firebase (guard against duplicate initialization in dev reloads)
export const firebaseApp = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);

// Firebase Auth — persist session across browser tabs & refreshes
export const auth = getAuth(firebaseApp);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

setPersistence(auth, browserLocalPersistence).catch((err) => {
  console.warn('[Zulora Firebase] Session persistence warning:', err.message);
});

// Firebase Cloud Storage (explicit bucket URI)
export const storage = getStorage(firebaseApp, 'gs://zulora-drive.firebasestorage.app');

// Cloud Firestore
export const db = getFirestore(firebaseApp);

// Compat bridge for db.collection("users").doc(...).collection("files").add(...) and query chaining
db.collection = function(colName) {
  const rootColRef = collection(db, colName);
  return {
    add: function(data) {
      return addDoc(rootColRef, data);
    },
    get: function() {
      return getDocs(rootColRef);
    },
    orderBy: function(field, dir = 'desc') {
      const q = query(rootColRef, orderBy(field, dir));
      return {
        onSnapshot: function(callback, errCallback) {
          return onSnapshot(q, callback, errCallback);
        },
        get: function() {
          return getDocs(q);
        }
      };
    },
    onSnapshot: function(callback, errCallback) {
      return onSnapshot(rootColRef, callback, errCallback);
    },
    doc: function(docId) {
      const rootDocRef = doc(db, colName, docId);
      return {
        get: function() { return getDoc(rootDocRef); },
        set: function(data, options) { return setDoc(rootDocRef, data, options); },
        update: function(data) { return updateDoc(rootDocRef, data); },
        delete: function() { return deleteDoc(rootDocRef); },
        collection: function(subColName) {
          const subColRef = collection(db, colName, docId, subColName);
          return {
            add: function(data) {
              return addDoc(subColRef, data);
            },
            doc: function(fileDocId) {
              const fileDocRef = doc(db, colName, docId, subColName, fileDocId);
              return {
                get: function() { return getDoc(fileDocRef); },
                set: function(data, options) { return setDoc(fileDocRef, data, options); },
                delete: function() { return deleteDoc(fileDocRef); },
                update: function(data) { return updateDoc(fileDocRef, data); }
              };
            },
            orderBy: function(field, dir = 'desc') {
              const q = query(subColRef, orderBy(field, dir));
              return {
                onSnapshot: function(callback, errCallback) {
                  return onSnapshot(q, callback, errCallback);
                },
                get: function() {
                  return getDocs(q);
                }
              };
            },
            onSnapshot: function(callback, errCallback) {
              return onSnapshot(subColRef, callback, errCallback);
            },
            get: function() {
              return getDocs(subColRef);
            }
          };
        }
      };
    }
  };
};

export const FieldValue = {
  serverTimestamp: () => serverTimestamp(),
  increment: (n) => increment(n)
};

export const firebase = {
  auth: () => auth,
  firestore: {
    FieldValue
  }
};

if (typeof window !== 'undefined') {
  window.firebase = firebase;
}

// Re-export all modular SDK primitives consumed by auth.js and app.js
export {
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
  runTransaction,
  query,
  orderBy,
  onSnapshot
};
