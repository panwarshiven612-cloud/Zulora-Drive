/**
 * Zulora Drive — Primary Application Logic
 *
 * Firebase Web SDK v10 (Auth + Firestore) & Cloudinary Storage
 *
 * Features:
 *   • Google SSO + Email/Password via Firebase Auth
 *   • Cloudinary client-side upload with strict per-user data isolation:
 *       folder: zulora_drive/users/${currentUser.uid}
 *   • Real-time Firestore synchronization:
 *       users/{currentUser.uid}/files (only accessible by current user)
 *   • 10 GB Free Starter quota with real-time progress meter
 *   • Drag-and-drop & click-to-upload with live XMLHttpRequest progress
 *   • Dynamic file search, rename, delete (Firestore + Quota reclamation)
 *   • Grid / List view toggle (persisted in localStorage)
 *   • Segmented storage bar (Photos, Docs, Videos, Audio, Other)
 *   • Referral system (+5 GB per successful referral)
 *   • Admin Console for zulora.help@gmail.com (quota override)
 *   • Pricing: Starter (Free), Lite ₹70, Pro ₹140, Ultra ₹240
 *   • UPI payment flow with QR code + WhatsApp verification
 */

import {
  onAuthChange,
  logOut,
  bootstrapUser,
  refreshProfile,
  getCurrentUser,
  isAdmin,
  ADMIN_EMAIL,
  SUPPORT_PHONE,
  SUPPORT_WHATSAPP,
  SUPPORT_EMAIL,
  SUPPORT_UPI_ID,
  DEFAULT_STORAGE_BYTES,
  MAX_STARTER_FILE_BYTES,
  deriveUsername,
  deriveAccountId,
  getReferralLink,
  updateUserQuota,
  CLOUDINARY_CLOUD_NAME,
  CLOUDINARY_UPLOAD_PRESET,
  CLOUDINARY_API_ENDPOINT
} from './auth.js';

import {
  auth,
  storage,
  db,
  storageRef,
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
  query,
  orderBy,
  onSnapshot,
  firebase
} from './firebase-config.js';

// ── Platform Configuration & Cloudinary Credentials ───────────────────────────
export const CLOUD_NAME = "t3dkhv0z";
export const UPLOAD_PRESET = "zulora_preset";
export const FIREBASE_CONFIG = {
  apiKey: "AIzaSyBGOtawcfRqXTm7jw5P3DB0qhJCUTmfyDc",
  authDomain: "zulora-drive.firebaseapp.com",
  projectId: "zulora-drive",
  storageBucket: "zulora-drive.firebasestorage.app",
  messagingSenderId: "715420173020",
  appId: "1:715420173020:web:46245edda3eb0f31edaa19"
};

// ══════════════════════════════════════════════════════════════════════════════
// GLOBAL APPLICATION STATE
// ══════════════════════════════════════════════════════════════════════════════
let allFiles       = [];
let filteredFiles  = [];
let currentCategory = 'all';
let currentNav      = 'my-drive';
let currentViewMode = localStorage.getItem('zulora_view_mode') || 'grid';
let currentSort     = 'date-desc';
let selectedFile    = null;
let activePlan      = null;
let profile         = null;
let filesUnsubscribe = null;

// Track active progress bar for current upload
let currentActiveProgressBar = null;
let currentActiveProgressStatus = null;

// ══════════════════════════════════════════════════════════════════════════════
// DOM ELEMENT REFS
// ══════════════════════════════════════════════════════════════════════════════
const $  = (id) => document.getElementById(id);
const mobileMenuBtn       = $('mobileMenuBtn');
const appSidebar          = $('appSidebar');
const globalSearchInput   = $('globalSearchInput');
const searchClearBtn      = $('searchClearBtn');
const userAvatarBtn       = $('userAvatarBtn');
const userInitials        = $('userInitials');
const userDropdown        = $('userDropdown');
const dropdownInitials    = $('dropdownInitials');
const dropdownName        = $('dropdownName');
const dropdownUsername    = $('dropdownUsername');
const dropdownEmail       = $('dropdownEmail');
const dropdownAccountId   = $('dropdownAccountId');
const dropdownPlanBadge   = $('dropdownPlanBadge');
const dropdownUpgradeBtn  = $('dropdownUpgradeBtn');
const openPlansModalBtn   = $('openPlansModalBtn');
const headerUpgradeBtn    = $('headerUpgradeBtn');
const headerUploadBtn     = $('headerUploadBtn');
const sidebarUpgradeBtn   = $('sidebarUpgradeBtn');
const sidebarAdminBtn     = $('sidebarAdminBtn');
const bannerUpgradeBtn    = $('bannerUpgradeBtn');
const adminDashboardBtn   = $('adminDashboardBtn');
const logoutBtn           = $('logoutBtn');
const newUploadBtn        = $('newUploadBtn');
const emptyUploadBtn      = $('emptyUploadBtn');
const fileUploadInput     = $('fileUploadInput');
const storagePercentText  = $('storagePercentText');
const storageProgressBar  = $('storageProgressBar');
const segPhotos           = $('segPhotos');
const segDocs             = $('segDocs');
const segMedia            = $('segMedia');
const segAudio            = $('segAudio');
const segOther            = $('segOther');
const storageUsageDetails = $('storageUsageDetails');
const quotaWarningBanner  = $('quotaWarningBanner');
const quotaWarningText    = $('quotaWarningText');
const trashToolbarBanner  = $('trashToolbarBanner');
const emptyTrashBtn       = $('emptyTrashBtn');
const mainWorkspace       = $('mainWorkspace');
const dropzoneOverlay     = $('dropzoneOverlay');
const currentViewTitle    = $('currentViewTitle');
const fileCountBadge      = $('fileCountBadge');
const sortBySelect        = $('sortBySelect');
const viewGridBtn         = $('viewGridBtn');
const viewListBtn         = $('viewListBtn');
const filesGrid           = $('filesGrid');
const filesListContainer  = $('filesListContainer');
const filesTableBody      = $('filesTableBody');
const emptyState          = $('emptyState');
const uploadDrawer        = $('uploadDrawer');
const uploadDrawerStatus  = $('uploadDrawerStatus');
const uploadDrawerBody    = $('uploadDrawerBody');
const closeUploadDrawerBtn= $('closeUploadDrawerBtn');
const plansModal          = $('plansModal');
const upiModal            = $('upiModal');
const upiModalPlanTitle   = $('upiModalPlanTitle');
const upiModalAmountText  = $('upiModalAmountText');
const upiQrCodeImg        = $('upiQrCodeImg');
const copyUpiBtn          = $('copyUpiBtn');
const payUpiDeepLink      = $('payUpiDeepLink');
const whatsappVerifyBtn   = $('whatsappVerifyBtn');
const upiConfirmForm      = $('upiConfirmForm');
const utrInput            = $('utrInput');
const previewModal        = $('previewModal');
const previewTitle        = $('previewTitle');
const previewContainer    = $('previewContainer');
const previewDownloadBtn  = $('previewDownloadBtn');
const renameModal         = $('renameModal');
const renameForm          = $('renameForm');
const renameInput         = $('renameInput');
const deleteModal         = $('deleteModal');
const confirmDeleteBtn    = $('confirmDeleteBtn');
const referralModal       = $('referralModal');
const referralLinkInput   = $('referralLinkInput');
const copyReferralBtn     = $('copyReferralBtn');
const referralStatsText   = $('referralStatsText');
const shareReferralWaBtn  = $('shareReferralWaBtn');
const adminModal          = $('adminModal');
const adminTotalUsers     = $('adminTotalUsers');
const adminTotalFiles     = $('adminTotalFiles');
const adminTotalStorage   = $('adminTotalStorage');
const adminUsersTableBody = $('adminUsersTableBody');
const fileContextMenu     = $('fileContextMenu');
const toastNotification   = $('toastNotification');

// ══════════════════════════════════════════════════════════════════════════════
// FORMATTING HELPERS & NOTIFICATIONS
// ══════════════════════════════════════════════════════════════════════════════
let toastTimeoutId = null;
export function showToast(message, isError = false) {
  const toast = $('toastNotification');
  if (!toast) return;
  toast.textContent = message;
  toast.className = 'toast-notification show' + (isError ? ' error' : '');
  clearTimeout(toastTimeoutId);
  toastTimeoutId = setTimeout(() => {
    toast.className = 'toast-notification';
  }, 3000);
}

/**
 * Dynamic size formatting per specification:
 * - < 1 MB  → display in KB (e.g. "450 KB")
 * - < 1 GB  → display in MB with 2 decimal places (e.g. "14.25 MB")
 * - ≥ 1 GB  → display in GB with 2 decimal places (e.g. "1.50 GB")
 */
export function formatStorageSize(bytes) {
  const b = Math.max(0, Number(bytes || 0));
  if (b === 0) return '0 KB';
  const KB = 1024;
  const MB = 1024 * 1024;
  const GB = 1024 * 1024 * 1024;
  if (b < MB) {
    // Under 1 MB → show in KB (no decimals for clean readability)
    return `${Math.round(b / KB)} KB`;
  } else if (b < GB) {
    // 1 MB to 1 GB → show in MB with 2 decimal places
    return `${(b / MB).toFixed(2)} MB`;
  } else {
    // 1 GB and above → show in GB with 2 decimal places
    return `${(b / GB).toFixed(2)} GB`;
  }
}

function formatBytes(bytes, decimals = 1) {
  if (!bytes || bytes === 0) return '0 B';
  const k     = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i     = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(decimals))} ${sizes[i]}`;
}

function formatDate(iso) {
  if (!iso) return 'Just now';
  return new Date(iso).toLocaleDateString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric'
  });
}

function getFileCategory(mime = '', filename = '') {
  const m   = (mime || '').toLowerCase();
  const ext = (filename.split('.').pop() || '').toLowerCase();

  if (m.startsWith('image/') || ['jpg','jpeg','png','gif','webp','svg','bmp','ico'].includes(ext))
    return 'images';
  if (m.includes('pdf') || m.includes('word') || m.includes('officedocument') || m.includes('text/') ||
      ['pdf','doc','docx','txt','rtf','odt','csv','xlsx','pptx'].includes(ext))
    return 'documents';
  if (m.startsWith('video/') || ['mp4','mov','mkv','avi','webm'].includes(ext))
    return 'videos';
  if (m.startsWith('audio/') || ['mp3','wav','ogg','m4a','flac','aac'].includes(ext))
    return 'audio';
  if (m.includes('zip') || m.includes('compressed') || ['zip','rar','7z','tar','gz'].includes(ext))
    return 'archives';
  return 'other';
}

function getFileIconMeta(mime, filename = '') {
  const cat = getFileCategory(mime, filename);
  const MAP = {
    images:    { icon: 'fa-regular fa-file-image',   color: '#0ea5e9', label: 'Image'    },
    documents: { icon: 'fa-regular fa-file-lines',   color: '#38bdf8', label: 'Document' },
    videos:    { icon: 'fa-regular fa-file-video',   color: '#6366f1', label: 'Video'    },
    audio:     { icon: 'fa-regular fa-file-audio',   color: '#ec4899', label: 'Audio'    },
    archives:  { icon: 'fa-regular fa-file-zipper',  color: '#f59e0b', label: 'Archive'  },
    other:     { icon: 'fa-regular fa-file',          color: '#94a3b8', label: 'File'     }
  };
  return MAP[cat] || MAP.other;
}

// ══════════════════════════════════════════════════════════════════════════════
// REAL-TIME STORAGE USAGE METER (Calculated across active files where isTrashed: false)
// ══════════════════════════════════════════════════════════════════════════════
function calculateActiveStorage() {
  return allFiles
    .filter(f => !f.isTrashed && !f.isTrash)
    .reduce((sum, f) => sum + Number(f.fileSize || f.size || 0), 0);
}

function updateStorageUI(p) {
  if (!p) return;
  profile = p;

  // Active storage used across non-trashed files
  const activeUsed = calculateActiveStorage();
  const limit      = Number(p.storageLimitBytes || p.storageLimit || DEFAULT_STORAGE_BYTES);
  const percent    = limit > 0 ? Math.min(100, Math.round((activeUsed / limit) * 100)) : 0;

  if (storagePercentText) storagePercentText.textContent = `${percent}%`;
  const mobileStoragePercent = $('mobileStoragePercent');
  if (mobileStoragePercent) mobileStoragePercent.textContent = `${percent}%`;

  if (storageProgressBar) {
    storageProgressBar.style.width      = `${percent}%`;
    storageProgressBar.style.background = percent >= 90
      ? '#ef4444'
      : percent >= 75
        ? '#f59e0b'
        : 'linear-gradient(90deg, #0ea5e9, #38bdf8)';
  }

  // Segmented category bar (across active files only)
  let photoBytes = 0, docBytes = 0, mediaBytes = 0, audioBytes = 0, otherBytes = 0;
  allFiles.filter(f => !f.isTrashed && !f.isTrash).forEach((f) => {
    const sz  = Number(f.size || f.fileSize || 0);
    const cat = getFileCategory(f.mimetype || f.type || f.fileType, f.name || f.fileName);
    if      (cat === 'images')    photoBytes += sz;
    else if (cat === 'documents') docBytes   += sz;
    else if (cat === 'videos')    mediaBytes += sz;
    else if (cat === 'audio')     audioBytes += sz;
    else                          otherBytes += sz;
  });

  const pct = (b) => limit > 0 ? ((b / limit) * 100).toFixed(1) : 0;
  if (segPhotos) segPhotos.style.width = `${pct(photoBytes)}%`;
  if (segDocs)   segDocs.style.width   = `${pct(docBytes)}%`;
  if (segMedia)  segMedia.style.width  = `${pct(mediaBytes)}%`;
  if (segAudio)  segAudio.style.width  = `${pct(audioBytes)}%`;
  if (segOther)  segOther.style.width  = `${pct(otherBytes)}%`;

  // Quota warning banner
  if (quotaWarningBanner) {
    if (percent >= 90 && currentNav !== 'trash') {
      quotaWarningBanner.className = 'storage-banner danger';
      if (quotaWarningText) quotaWarningText.textContent =
        `Critical: ${percent}% of your allocated cloud space is full. Upgrade now.`;
      quotaWarningBanner.style.display = 'flex';
    } else if (percent >= 75 && currentNav !== 'trash') {
      quotaWarningBanner.className = 'storage-banner warning';
      if (quotaWarningText) quotaWarningText.textContent =
        `Notice: You have used ${percent}% of your cloud storage.`;
      quotaWarningBanner.style.display = 'flex';
    } else {
      quotaWarningBanner.style.display = 'none';
    }
  }

  // Dynamic KB / MB / GB formatting
  if (storageUsageDetails) {
    storageUsageDetails.innerHTML = `<b>${formatStorageSize(activeUsed)}</b> / ${formatStorageSize(limit)} used`;
  }

  const isAdminUser = isAdmin(p);
  const tierName    = isAdminUser ? 'Admin' : (p.planType || (limit > DEFAULT_STORAGE_BYTES ? 'Pro' : 'Starter'));
  if (dropdownPlanBadge) {
    dropdownPlanBadge.textContent = `${tierName} · ${formatStorageSize(limit)}`;
    if (isAdminUser) dropdownPlanBadge.classList.add('admin');
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// USER IDENTITY UI
// ══════════════════════════════════════════════════════════════════════════════
function setupUserUI(user, prof) {
  const email       = prof?.email || user?.email || '';
  const displayName = prof?.displayName || user?.displayName || email.split('@')[0] || 'User';
  const username    = prof?.username  || deriveUsername(user);
  const accountId   = prof?.accountId || deriveAccountId(user);
  const initial     = (displayName.charAt(0) || email.charAt(0) || 'Z').toUpperCase();

  if (user?.photoURL) {
    if (userAvatarBtn) {
      userAvatarBtn.innerHTML = `<img src="${user.photoURL}" alt="${displayName}"
        style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
    }
  } else {
    if (userInitials) userInitials.textContent = initial;
  }

  if (dropdownInitials)  dropdownInitials.textContent  = initial;
  if (dropdownName)      dropdownName.textContent      = displayName;
  if (dropdownUsername)  dropdownUsername.textContent  = username;
  if (dropdownEmail)     dropdownEmail.textContent     = email;
  if (dropdownAccountId) dropdownAccountId.textContent = `Account: ${accountId}`;

  // Admin console button — only visible to zulora.help@gmail.com
  const adminVisible = isAdmin(prof) || email.toLowerCase() === ADMIN_EMAIL;
  if (adminDashboardBtn) adminDashboardBtn.style.display = adminVisible ? 'flex' : 'none';
  if (sidebarAdminBtn)   sidebarAdminBtn.style.display   = adminVisible ? 'flex' : 'none';
}

// ══════════════════════════════════════════════════════════════════════════════
// PROGRESS BAR UI UPDATER
// ══════════════════════════════════════════════════════════════════════════════
function updateUIProgressBar(percent, customStatus = null) {
  if (currentActiveProgressBar) {
    currentActiveProgressBar.style.width = `${percent}%`;
    currentActiveProgressBar.style.background = 'linear-gradient(90deg, #0ea5e9, #38bdf8)';
  }
  if (currentActiveProgressStatus) {
    currentActiveProgressStatus.textContent = customStatus || `${percent}%`;
    currentActiveProgressStatus.style.color = 'var(--azure-primary)';
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// SECURE FILE RETRIEVAL & REAL-TIME SYNCHRONIZATION
// ══════════════════════════════════════════════════════════════════════════════
/**
 * Real-time listener: strictly queries files belonging to the logged-in user.
 * db.collection("users").doc(currentUser.uid).collection("files")
 *   .orderBy("createdAt", "desc")
 *   .onSnapshot(...)
 */
function subscribeUserFiles(currentUser) {
  if (!currentUser?.uid) return;

  if (typeof filesUnsubscribe === 'function') {
    filesUnsubscribe();
    filesUnsubscribe = null;
  }

  try {
    filesUnsubscribe = db.collection("users").doc(currentUser.uid).collection("files")
      .orderBy("createdAt", "desc")
      .onSnapshot(
        (snapshot) => {
          renderFileList(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        },
        (err) => {
          console.warn("[Zulora Files] onSnapshot orderBy error, falling back without orderBy:", err.message);
          filesUnsubscribe = db.collection("users").doc(currentUser.uid).collection("files")
            .onSnapshot((snapshot) => {
              renderFileList(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
            });
        }
      );
  } catch (err) {
    console.error("[Zulora Files] subscribeUserFiles error:", err);
  }
}

/**
 * Normalizes and populates file records, applies filters and updates view
 */
function renderFileList(fileDocs) {
  allFiles = (fileDocs || []).map((d) => {
    let iso = new Date().toISOString();
    if (d.createdAt?.toDate)                 iso = d.createdAt.toDate().toISOString();
    else if (d.uploadedAt?.toDate)            iso = d.uploadedAt.toDate().toISOString();
    else if (typeof d.createdAt === 'string')  iso = d.createdAt;
    else if (typeof d.uploadedAt === 'string') iso = d.uploadedAt;

    const fName = d.fileName || d.name || d.originalName || 'Untitled File';
    const fSize = Number(d.fileSize ?? d.size ?? 0);
    const fType = d.fileType || d.type || d.mimetype || 'application/octet-stream';
    const fUrl  = d.fileUrl  || d.url  || '';

    return {
      id:                 d.id,
      name:               fName,
      originalName:       fName,
      fileName:           fName,
      size:               fSize,
      fileSize:           fSize,
      type:               fType,
      fileType:           fType,
      mimetype:           fType,
      url:                fUrl,
      fileUrl:            fUrl,
      storagePath:        d.storagePath || '',
      cloudinaryPublicId: d.cloudinaryPublicId || '',
      userUid:            d.userUid || '',
      userEmail:          d.userEmail || '',
      isStarred:          Boolean(d.isStarred),
      isTrash:            Boolean(d.isTrash ?? d.isTrashed ?? false),
      isTrashed:          Boolean(d.isTrashed ?? d.isTrash ?? false),
      uploadedAt:         iso,
      createdAt:          iso
    };
  });

  // Calculate total storage used across all active files (where isTrashed: false)
  const activeStorage = calculateActiveStorage();
  if (profile) {
    profile.storageUsedBytes = activeStorage;
    profile.usedStorageBytes = activeStorage;
    profile.storageUsed      = activeStorage;
    updateStorageUI(profile);
  }

  applyFiltersAndRender();
}

/**
 * Refreshes user file list from Firestore and synchronizes storage metrics
 */
export async function refreshFileList() {
  const currentUser = auth.currentUser || getCurrentUser();
  if (!currentUser?.uid) return;
  try {
    const filesSnap = await getDocs(
      query(collection(db, 'users', currentUser.uid, 'files'), orderBy('createdAt', 'desc'))
    ).catch(async () => {
      return await getDocs(collection(db, 'users', currentUser.uid, 'files'));
    });

    const fileDocs = filesSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    renderFileList(fileDocs);

    // Sync calculated active storage sum to user document (only non-trashed files)
    const activeStorage = fileDocs
      .filter((f) => !f.isTrashed && !f.isTrash)
      .reduce((acc, f) => acc + Number(f.fileSize || f.size || 0), 0);

    if (profile) {
      profile.storageUsedBytes = activeStorage;
      profile.usedStorageBytes = activeStorage;
      profile.storageUsed      = activeStorage;
      updateStorageUI(profile);
    }

    await updateDoc(doc(db, 'users', currentUser.uid), {
      storageUsedBytes: activeStorage,
      usedStorageBytes: activeStorage,
      storageUsed:      activeStorage,
      updatedAt:        serverTimestamp()
    }).catch(() => {});
  } catch (err) {
    console.warn('[Zulora] refreshFileList notice:', err.message);
  }
}

// Backward-compatible aliases
export const refreshUserFiles = refreshFileList;
if (typeof window !== 'undefined') {
  window.refreshFileList = refreshFileList;
  window.refreshUserFiles = refreshFileList;
}

// Backward-compatible loadUserFiles
async function loadUserFiles(uid) {
  const currentUser = auth.currentUser || getCurrentUser();
  if (currentUser) {
    subscribeUserFiles(currentUser);
  }
}

/**
 * Save or update user document in Firestore under users/{userId}:
 *   - name: currentUser.displayName
 *   - email: currentUser.email
 *   - photoURL: currentUser.photoURL
 *   - uid: currentUser.uid
 *   - lastLogin: firebase.firestore.FieldValue.serverTimestamp()
 *   - storageUsedBytes: (Calculate from sum of all uploaded active file sizes where isTrashed: false)
 */
export async function saveOrUpdateUserProfile(currentUser) {
  if (!currentUser?.uid) return null;
  const userRef = doc(db, 'users', currentUser.uid);

  // 1. Calculate storageUsedBytes from sum of all uploaded active files (where isTrashed: false)
  let storageUsedBytes = 0;
  try {
    const filesSnap = await getDocs(collection(db, 'users', currentUser.uid, 'files'));
    filesSnap.forEach((docSnap) => {
      const d = docSnap.data();
      if (!d.isTrashed && !d.isTrash) {
        storageUsedBytes += Number(d.fileSize ?? d.size ?? 0);
      }
    });
  } catch (err) {
    console.warn('[Zulora] Storage sum calculation notice:', err.message);
  }

  const displayName = currentUser.displayName || (currentUser.email ? currentUser.email.split('@')[0] : 'User');
  const userDocData = {
    name:             displayName,
    displayName:      displayName,
    email:            currentUser.email || '',
    photoURL:         currentUser.photoURL || '',
    uid:              currentUser.uid,
    lastLogin:        firebase.firestore.FieldValue.serverTimestamp(),
    storageUsedBytes: storageUsedBytes,
    usedStorageBytes: storageUsedBytes,
    storageUsed:      storageUsedBytes,
    updatedAt:        firebase.firestore.FieldValue.serverTimestamp()
  };

  const userSnap = await getDoc(userRef).catch(() => null);
  if (!userSnap || !userSnap.exists()) {
    userDocData.storageLimitBytes  = DEFAULT_STORAGE_BYTES;
    userDocData.storageLimit       = DEFAULT_STORAGE_BYTES;
    userDocData.planType           = 'Starter';
    userDocData.tier               = 'free';
    userDocData.username           = deriveUsername(currentUser);
    userDocData.accountId          = deriveAccountId(currentUser);
    userDocData.totalReferrals     = 0;
    userDocData.referralBonusBytes = 0;
    userDocData.createdAt          = firebase.firestore.FieldValue.serverTimestamp();
  }

  await setDoc(userRef, userDocData, { merge: true }).catch((err) => {
    console.warn('[Zulora] Firestore setDoc error in saveOrUpdateUserProfile:', err.message);
  });

  const merged = userSnap && userSnap.exists() ? { ...userSnap.data(), ...userDocData } : userDocData;
  return {
    ...merged,
    referralLink: getReferralLink(currentUser),
    isAdmin:      (currentUser.email || '').toLowerCase() === ADMIN_EMAIL
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// AUTH LIFECYCLE & VIEW SEPARATION
// ══════════════════════════════════════════════════════════════════════════════
export function setAuthStateUI(isAuthenticated) {
  const publicLandingPage = $('publicLandingPage');
  const appContainer      = $('appContainer');
  const mobileBottomNav   = $('mobileBottomNav');

  if (isAuthenticated) {
    if (publicLandingPage) publicLandingPage.style.display = 'none';
    if (appContainer)      appContainer.style.display = 'flex';
    if (mobileBottomNav)   mobileBottomNav.style.display = 'flex';
  } else {
    if (publicLandingPage) publicLandingPage.style.display = 'block';
    if (appContainer)      appContainer.style.display = 'none';
    if (mobileBottomNav)   mobileBottomNav.style.display = 'none';
  }
}

// ── Email Verification Helper ─────────────────────────────────────────────────
/**
 * Injects a persistent unverified-account banner in the dashboard.
 * Blocks storage, upload, and file ops until the user verifies their email.
 * @param {import('firebase/auth').User} user
 */
function showUnverifiedBanner(user) {
  // Ensure the app shell is visible so the banner renders inside it
  setAuthStateUI(true);

  // Hide interactive areas — upload, file grid, storage bar
  const mainWS = $('mainWorkspace');
  const sidebar = $('appSidebar');
  if (mainWS)  mainWS.style.display  = 'none';

  // Show the dedicated verify banner
  let banner = $('emailVerifyBanner');
  if (!banner) {
    // Fallback: create it if the HTML placeholder isn't present
    banner = document.createElement('div');
    banner.id = 'emailVerifyBanner';
    const appContainer = $('appContainer');
    if (appContainer) appContainer.prepend(banner);
  }

  banner.className = 'email-verify-banner';
  banner.style.display = 'flex';
  banner.innerHTML = `
    <div class="evb-icon">
      <i class="fa-solid fa-envelope-open-text"></i>
    </div>
    <div class="evb-content">
      <p class="evb-title">Email Verification Required</p>
      <p class="evb-body">
        We sent a verification link to <strong>${escHtml(user.email || '')}</strong>.
        Please check your inbox and click the link to unlock your Zulora Drive storage.
      </p>
    </div>
    <div class="evb-actions">
      <button id="evbResendBtn" class="btn btn-azure-gradient evb-btn">
        <i class="fa-solid fa-paper-plane"></i> Resend Email
      </button>
      <button id="evbCheckBtn" class="btn btn-secondary evb-btn">
        <i class="fa-solid fa-rotate"></i> Check Status
      </button>
    </div>
  `;

  // ── Resend from dashboard banner ──────────────────────────────────────────
  banner.querySelector('#evbResendBtn')?.addEventListener('click', async () => {
    const resendBtn = $('evbResendBtn');
    if (resendBtn) {
      resendBtn.disabled = true;
      resendBtn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Sending...';
    }
    try {
      // Import sendEmailVerification on-demand to avoid circular dep issues
      const { sendEmailVerification } = await import('./firebase-config.js');
      await sendEmailVerification(user, {
        url: 'https://drive.zulora.in/login.html?verified=1'
      });
      showToast('Verification email sent! Check your inbox.', false);
    } catch (err) {
      showToast('Could not resend email. Try again shortly.', true);
      console.warn('[Zulora] Dashboard resend notice:', err.message);
    } finally {
      if (resendBtn) {
        // 60-second cooldown on the dashboard resend button
        let cd = 60;
        const iv = setInterval(() => {
          cd--;
          if (resendBtn) resendBtn.innerHTML = `<i class="fa-solid fa-clock"></i> Resend (${cd}s)`;
          if (cd <= 0) {
            clearInterval(iv);
            if (resendBtn) {
              resendBtn.disabled  = false;
              resendBtn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Resend Email';
            }
          }
        }, 1000);
      }
    }
  });

  // ── Check verification status ─────────────────────────────────────────────
  banner.querySelector('#evbCheckBtn')?.addEventListener('click', async () => {
    const checkBtn = $('evbCheckBtn');
    if (checkBtn) {
      checkBtn.disabled = true;
      checkBtn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Checking...';
    }
    try {
      await user.reload();
      const fresh = auth.currentUser;
      if (fresh && fresh.emailVerified) {
        showToast('✅ Email verified! Loading your drive...', false);
        // Reload the page to re-trigger the full auth lifecycle
        setTimeout(() => window.location.reload(), 1200);
      } else {
        showToast('Email not yet verified. Please click the link in your inbox.', true);
        if (checkBtn) {
          checkBtn.disabled  = false;
          checkBtn.innerHTML = '<i class="fa-solid fa-rotate"></i> Check Status';
        }
      }
    } catch (err) {
      showToast('Status check failed. Please try again.', true);
      if (checkBtn) {
        checkBtn.disabled  = false;
        checkBtn.innerHTML = '<i class="fa-solid fa-rotate"></i> Check Status';
      }
    }
  });
}

function hideUnverifiedBanner() {
  const banner = $('emailVerifyBanner');
  if (banner) banner.style.display = 'none';
  const mainWS = $('mainWorkspace');
  if (mainWS) mainWS.style.display = '';
}

async function sendWelcomeEmailOnce(user) {
  const welcomeKey = `zulora_welcome_sent_${user.uid}`;
  if (localStorage.getItem(welcomeKey) || typeof emailjs === 'undefined') return;

  try {
    await emailjs.send('service_rnx73od', 'template_vjrfj7h', {
      name: user.displayName || 'Valued User',
      email: user.email
    });
    localStorage.setItem(welcomeKey, 'true');
  } catch (err) {
    console.warn('[Zulora] Welcome email notice:', err.message);
  }
}

function initAuthLifecycle() {
  onAuthChange(async (user) => {
    if (!user) {
      if (typeof filesUnsubscribe === 'function') {
        filesUnsubscribe();
        filesUnsubscribe = null;
      }
      setAuthStateUI(false);
      return;
    }

    // ── Email Verification Gate ───────────────────────────────────────────────
    // Google accounts always have emailVerified: true — they bypass this gate.
    // Email/Password accounts that haven't clicked the verification link are
    // shown a persistent banner and denied access to storage and file ops.
    if (!user.emailVerified) {
      showUnverifiedBanner(user);
      return; // Do NOT proceed to dashboard setup, file subscription, or bootstrapUser
    }

    // ── Verified user — full dashboard access ─────────────────────────────────
    hideUnverifiedBanner();
    setAuthStateUI(true);
    await sendWelcomeEmailOnce(user);

    // Immediate UI placeholder until Firestore loads
    setupUserUI(user, {
      email:       user.email,
      displayName: user.displayName || user.email.split('@')[0],
      displayName: user.displayName || (user.email ? user.email.split('@')[0] : 'User'),
      username:    deriveUsername(user),
      accountId:   deriveAccountId(user)
    });

    try {
      profile = await saveOrUpdateUserProfile(user);
    } catch (err) {
      console.warn('[Zulora] saveOrUpdateUserProfile fallback:', err.message);
      profile = await bootstrapUser().catch(() => null);
    }

    setupUserUI(user, profile);
    updateStorageUI(profile);
    subscribeUserFiles(user);
  });
}


if (document.readyState === 'complete') {
  initAuthLifecycle();
} else {
  window.addEventListener('load', initAuthLifecycle);
}

// Background profile refresh every 45 seconds
setInterval(async () => {
  try {
    const refreshed = await refreshProfile();
    if (refreshed) updateStorageUI(refreshed);
  } catch (_) {}
}, 45_000);

// ══════════════════════════════════════════════════════════════════════════════
// FILTERING, SORTING & RENDERING
// ══════════════════════════════════════════════════════════════════════════════
function applyFiltersAndRender() {
  const query = (globalSearchInput?.value || '').trim().toLowerCase();

  filteredFiles = allFiles.filter((file) => {
    const isTrashed = Boolean(file.isTrashed || file.isTrash);
    if (currentNav === 'trash')   { if (!isTrashed)  return false; }
    else                          { if (isTrashed)   return false; }
    if (currentNav === 'starred' && !file.isStarred) return false;

    if (currentCategory !== 'all') {
      if (getFileCategory(file.mimetype || file.type || file.fileType, file.name || file.fileName) !== currentCategory) return false;
    }

    if (query) {
      const matchName = (file.name || file.fileName || '').toLowerCase().includes(query);
      const matchType = (file.type || file.fileType || '').toLowerCase().includes(query);
      if (!matchName && !matchType) return false;
    }

    return true;
  });

  // Sorting
  filteredFiles.sort((a, b) => {
    switch (currentSort) {
      case 'date-asc':  return new Date(a.createdAt || a.uploadedAt)  - new Date(b.createdAt || b.uploadedAt);
      case 'name-asc':  return (a.name || a.fileName || '').localeCompare(b.name || b.fileName || '');
      case 'name-desc': return (b.name || b.fileName || '').localeCompare(a.name || a.fileName || '');
      case 'size-desc': return (b.size || b.fileSize || 0)            - (a.size || a.fileSize || 0);
      case 'size-asc':  return (a.size || a.fileSize || 0)            - (b.size || b.fileSize || 0);
      default:          return new Date(b.createdAt || b.uploadedAt)  - new Date(a.createdAt || a.uploadedAt);
    }
  });

  if (fileCountBadge) {
    const n = filteredFiles.length;
    fileCountBadge.textContent = `${n} file${n === 1 ? '' : 's'}`;
  }

  renderFilesView();
}

function renderFilesView() {
  const hasFiles = filteredFiles.length > 0;
  if (emptyState)          emptyState.style.display          = hasFiles ? 'none'  : 'flex';
  if (filesGrid)           filesGrid.style.display           = hasFiles && currentViewMode === 'grid' ? 'grid'  : 'none';
  if (filesListContainer)  filesListContainer.style.display  = hasFiles && currentViewMode === 'list' ? 'block' : 'none';

  if (trashToolbarBanner) {
    trashToolbarBanner.style.display = currentNav === 'trash' ? 'flex' : 'none';
  }

  if (!hasFiles) {
    if (filesGrid)       filesGrid.innerHTML      = '';
    if (filesTableBody)  filesTableBody.innerHTML = '';
    return;
  }

  currentViewMode === 'grid' ? renderGridView() : renderListView();
}

/// ── Categorised File Groups ──────────────────────────────────────────────────
const CATEGORY_GROUPS = [
  { key: 'documents', label: 'Documents', icon: 'fa-regular fa-file-lines', color: '#38bdf8' },
  { key: 'images',    label: 'Images',    icon: 'fa-regular fa-file-image', color: '#0ea5e9' },
  { key: 'videos',    label: 'Videos',    icon: 'fa-regular fa-file-video', color: '#6366f1' },
  { key: 'audio',     label: 'Audio',     icon: 'fa-regular fa-file-audio', color: '#ec4899' },
  { key: 'archives',  label: 'Archives',  icon: 'fa-regular fa-file-zipper', color: '#f59e0b' },
  { key: 'other',     label: 'Other',     icon: 'fa-regular fa-file',        color: '#94a3b8' }
];

function createFileCardElement(file) {
  const meta     = getFileIconMeta(file.mimetype || file.type || file.fileType, file.name || file.fileName);
  const isImg    = getFileCategory(file.mimetype || file.type || file.fileType, file.name || file.fileName) === 'images';
  const card     = document.createElement('div');
  card.className = 'file-card';
  card.dataset.fileId = file.id;

  const fName = file.fileName || file.name || 'Untitled File';
  const fUrl  = file.fileUrl  || file.url  || '';
  const fSize = Number(file.fileSize ?? file.size ?? 0);
  const isTrashed = Boolean(file.isTrashed || file.isTrash);

  card.innerHTML = `
    <div class="file-card-preview-box">
      ${isImg && fUrl
        ? `<img src="${fUrl}" alt="${escHtml(fName)}" class="file-card-thumb" loading="lazy">`
        : `<i class="${meta.icon} file-card-icon-large" style="color:${meta.color};"></i>`}
    </div>
    <div class="file-card-actions">
      <span class="file-card-type-tag">${meta.label}</span>
      <div class="file-card-buttons">
        ${isTrashed ? `
          <button class="menu-btn" data-action="open-menu" title="More options">
            <i class="fa-solid fa-ellipsis-vertical"></i>
          </button>
        ` : `
          <button class="btn-action-icon" data-action="download" title="Download">
            <i class="fa-solid fa-download"></i>
          </button>
          <button class="btn-action-icon" data-action="copy-link" title="Copy Link">
            <i class="fa-solid fa-link"></i>
          </button>
          <button class="star-btn${file.isStarred ? ' starred' : ''}" data-action="toggle-star"
            title="${file.isStarred ? 'Unstar' : 'Star'}">
            <i class="${file.isStarred ? 'fa-solid' : 'fa-regular'} fa-star"></i>
          </button>
          <button class="btn-action-icon danger-hover" data-action="move-to-trash" title="Move to Trash">
            <i class="fa-regular fa-trash-can"></i>
          </button>
          <button class="menu-btn" data-action="open-menu" title="More options">
            <i class="fa-solid fa-ellipsis-vertical"></i>
          </button>
        `}
      </div>
    </div>
    <div class="file-card-info">
      <div class="file-card-title" title="${escHtml(fName)}">${escHtml(fName)}</div>
      <div class="file-card-meta">
        <span>${formatStorageSize(fSize)}</span>
        <span>${formatDate(file.uploadedAt || file.createdAt)}</span>
      </div>
    </div>
    ${isTrashed ? `
      <div class="file-card-trash-actions">
        <button class="btn-trash-pill restore" data-action="restore" title="Restore to My Drive">
          <i class="fa-solid fa-rotate-left"></i> Restore
        </button>
        <button class="btn-trash-pill permanent-delete" data-action="permanent-delete" title="Permanently Delete">
          <i class="fa-solid fa-trash"></i> Delete
        </button>
      </div>
    ` : ''}`;

  card.addEventListener('click', (e) => { if (!e.target.closest('button')) openPreviewModal(file); });
  card.querySelector('[data-action="toggle-star"]')?.addEventListener('click', (e) => { e.stopPropagation(); toggleStar(file); });
  card.querySelector('[data-action="download"]')?.addEventListener('click', (e) => { e.stopPropagation(); downloadFile(file); });
  card.querySelector('[data-action="copy-link"]')?.addEventListener('click', (e) => { e.stopPropagation(); copyFileLink(file); });
  card.querySelector('[data-action="move-to-trash"]')?.addEventListener('click', (e) => { e.stopPropagation(); moveToTrash(file); });
  card.querySelector('[data-action="restore"]')?.addEventListener('click', (e) => { e.stopPropagation(); restoreFromTrash(file); });
  card.querySelector('[data-action="permanent-delete"]')?.addEventListener('click', (e) => { e.stopPropagation(); openDeleteModal(file); });
  card.querySelector('[data-action="open-menu"]')?.addEventListener('click', (e) => { e.stopPropagation(); showContextMenu(e, file); });

  return card;
}

function createFileListRowElement(file) {
  const meta     = getFileIconMeta(file.mimetype || file.type || file.fileType, file.name || file.fileName);
  const tr       = document.createElement('tr');
  tr.dataset.fileId = file.id;
  const fName    = file.fileName || file.name || 'Untitled File';
  const fSize    = Number(file.fileSize ?? file.size ?? 0);
  const isTrashed = Boolean(file.isTrashed || file.isTrash);

  tr.innerHTML = `
    <td>
      <div class="table-name-cell">
        <i class="${meta.icon} table-file-icon" style="color:${meta.color};"></i>
        <span title="${escHtml(fName)}">${escHtml(fName)}</span>
      </div>
    </td>
    <td>${formatStorageSize(fSize)}</td>
    <td>${formatDate(file.uploadedAt || file.createdAt)}</td>
    <td>
      <div class="table-actions">
        ${isTrashed ? `
          <button class="btn-trash-pill restore" data-action="restore" title="Restore to My Drive">
            <i class="fa-solid fa-rotate-left"></i> Restore
          </button>
          <button class="btn-trash-pill permanent-delete" data-action="permanent-delete" title="Permanently Delete">
            <i class="fa-solid fa-trash"></i> Delete
          </button>
        ` : `
          <button class="star-btn${file.isStarred ? ' starred' : ''}" data-action="toggle-star" title="Star">
            <i class="${file.isStarred ? 'fa-solid' : 'fa-regular'} fa-star"></i>
          </button>
          <button class="btn-icon" data-action="preview" title="Preview"><i class="fa-regular fa-eye"></i></button>
          <button class="btn-icon" data-action="download" title="Download"><i class="fa-solid fa-download"></i></button>
          <button class="btn-icon" data-action="copy-link" title="Copy Link"><i class="fa-solid fa-link"></i></button>
          <button class="btn-icon" data-action="move-to-trash" title="Move to Trash"><i class="fa-regular fa-trash-can"></i></button>
          <button class="menu-btn" data-action="open-menu" title="More"><i class="fa-solid fa-ellipsis-vertical"></i></button>
        `}
      </div>
    </td>`;

  tr.addEventListener('click', (e) => { if (!e.target.closest('button')) openPreviewModal(file); });
  tr.querySelector('[data-action="toggle-star"]')?.addEventListener('click', (e) => { e.stopPropagation(); toggleStar(file); });
  tr.querySelector('[data-action="preview"]')?.addEventListener('click', (e) => { e.stopPropagation(); openPreviewModal(file); });
  tr.querySelector('[data-action="download"]')?.addEventListener('click', (e) => { e.stopPropagation(); downloadFile(file); });
  tr.querySelector('[data-action="copy-link"]')?.addEventListener('click', (e) => { e.stopPropagation(); copyFileLink(file); });
  tr.querySelector('[data-action="move-to-trash"]')?.addEventListener('click', (e) => { e.stopPropagation(); moveToTrash(file); });
  tr.querySelector('[data-action="restore"]')?.addEventListener('click', (e) => { e.stopPropagation(); restoreFromTrash(file); });
  tr.querySelector('[data-action="permanent-delete"]')?.addEventListener('click', (e) => { e.stopPropagation(); openDeleteModal(file); });
  tr.querySelector('[data-action="open-menu"]')?.addEventListener('click', (e) => { e.stopPropagation(); showContextMenu(e, file); });

  return tr;
}

// ── Grid View (Categorised Sections) ──────────────────────────────────────────
function renderGridView() {
  if (!filesGrid) return;
  filesGrid.innerHTML = '';

  if (currentCategory !== 'all') {
    const activeCat = CATEGORY_GROUPS.find((c) => c.key === currentCategory) || {
      key: currentCategory,
      label: currentCategory.charAt(0).toUpperCase() + currentCategory.slice(1),
      icon: 'fa-regular fa-folder',
      color: '#0ea5e9'
    };
    const catBytes = filteredFiles.reduce((sum, f) => sum + Number(f.fileSize || f.size || 0), 0);
    const section = document.createElement('div');
    section.className = 'file-category-section';
    section.innerHTML = `
      <div class="file-category-header">
        <div class="file-category-title-group">
          <i class="${activeCat.icon}" style="color:${activeCat.color};"></i>
          <h3 class="file-category-title">${activeCat.label}</h3>
          <span class="file-category-count-badge">${filteredFiles.length} file${filteredFiles.length === 1 ? '' : 's'}</span>
        </div>
        <span class="file-category-size">${formatBytes(catBytes)}</span>
      </div>
      <div class="category-file-grid"></div>`;
    const grid = section.querySelector('.category-file-grid');
    filteredFiles.forEach((file) => grid.appendChild(createFileCardElement(file)));
    filesGrid.appendChild(section);
  } else {
    CATEGORY_GROUPS.forEach((group) => {
      const groupFiles = filteredFiles.filter((f) =>
        getFileCategory(f.mimetype || f.type || f.fileType, f.name || f.fileName) === group.key
      );
      if (groupFiles.length === 0) return;
      const groupBytes = groupFiles.reduce((sum, f) => sum + Number(f.fileSize || f.size || 0), 0);
      const section = document.createElement('div');
      section.className = 'file-category-section';
      section.innerHTML = `
        <div class="file-category-header">
          <div class="file-category-title-group">
            <i class="${group.icon}" style="color:${group.color};"></i>
            <h3 class="file-category-title">${group.label}</h3>
            <span class="file-category-count-badge">${groupFiles.length} file${groupFiles.length === 1 ? '' : 's'}</span>
          </div>
          <span class="file-category-size">${formatBytes(groupBytes)}</span>
        </div>
        <div class="category-file-grid"></div>`;
      const grid = section.querySelector('.category-file-grid');
      groupFiles.forEach((file) => grid.appendChild(createFileCardElement(file)));
      filesGrid.appendChild(section);
    });
  }
}

// ── List View (Categorised Sections Table) ────────────────────────────────────
function renderListView() {
  if (!filesTableBody) return;
  filesTableBody.innerHTML = '';

  if (currentCategory !== 'all') {
    const activeCat = CATEGORY_GROUPS.find((c) => c.key === currentCategory) || {
      key: currentCategory,
      label: currentCategory.charAt(0).toUpperCase() + currentCategory.slice(1),
      icon: 'fa-regular fa-folder',
      color: '#0ea5e9'
    };
    const catBytes = filteredFiles.reduce((sum, f) => sum + Number(f.fileSize || f.size || 0), 0);
    const headerRow = document.createElement('tr');
    headerRow.className = 'category-header-row';
    headerRow.innerHTML = `
      <td colspan="4">
        <div class="category-header-content">
          <div class="category-header-left">
            <i class="${activeCat.icon}" style="color:${activeCat.color};"></i>
            <span>${activeCat.label}</span>
            <span class="file-category-count-badge">${filteredFiles.length}</span>
          </div>
          <div class="file-category-size">${formatBytes(catBytes)}</div>
        </div>
      </td>`;
    filesTableBody.appendChild(headerRow);
    filteredFiles.forEach((file) => filesTableBody.appendChild(createFileListRowElement(file)));
  } else {
    CATEGORY_GROUPS.forEach((group) => {
      const groupFiles = filteredFiles.filter((f) =>
        getFileCategory(f.mimetype || f.type || f.fileType, f.name || f.fileName) === group.key
      );
      if (groupFiles.length === 0) return;
      const groupBytes = groupFiles.reduce((sum, f) => sum + Number(f.fileSize || f.size || 0), 0);
      const headerRow = document.createElement('tr');
      headerRow.className = 'category-header-row';
      headerRow.innerHTML = `
        <td colspan="4">
          <div class="category-header-content">
            <div class="category-header-left">
              <i class="${group.icon}" style="color:${group.color};"></i>
              <span>${group.label}</span>
              <span class="file-category-count-badge">${groupFiles.length}</span>
            </div>
            <div class="file-category-size">${formatBytes(groupBytes)}</div>
          </div>
        </td>`;
      filesTableBody.appendChild(headerRow);
      groupFiles.forEach((file) => filesTableBody.appendChild(createFileListRowElement(file)));
    });
  }
}

// ── HTML escape helper ────────────────────────────────────────────────────────
function escHtml(str) {
  return (str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ══════════════════════════════════════════════════════════════════════════════
// FILE ACTIONS
// ══════════════════════════════════════════════════════════════════════════════

// ── Quick Preview Modal ───────────────────────────────────────────────────────
function openPreviewModal(file) {
  selectedFile = file;
  const name   = file.fileName || file.originalName || file.name || 'File Preview';
  const url    = file.fileUrl || file.url;

  if (previewTitle)       previewTitle.textContent = name;
  if (previewDownloadBtn) { previewDownloadBtn.href = url; previewDownloadBtn.download = name; }
  if (previewContainer)   previewContainer.innerHTML =
    '<div style="color:var(--text-muted);"><i class="fa-solid fa-circle-notch fa-spin"></i> Loading preview...</div>';
  previewModal?.classList.add('show');

  const cat = getFileCategory(file.mimetype || file.type || file.fileType, name);

  if (cat === 'images') {
    previewContainer.innerHTML = `<img src="${url}" alt="${escHtml(name)}"
      style="max-width:100%;max-height:55vh;object-fit:contain;border-radius:8px;">`;
  } else if (cat === 'videos') {
    previewContainer.innerHTML = `<video controls autoplay style="max-width:100%;max-height:55vh;border-radius:8px;">
      <source src="${url}" type="${file.mimetype || file.type || 'video/mp4'}">Preview not supported.</video>`;
  } else if (cat === 'audio') {
    previewContainer.innerHTML = `<audio controls autoplay style="width:85%;">
      <source src="${url}" type="${file.mimetype || file.type || 'audio/mpeg'}">Audio preview not supported.</audio>`;
  } else if (name.endsWith('.pdf') || (file.mimetype || file.type || '').includes('pdf')) {
    previewContainer.innerHTML = `<iframe src="${url}"
      style="width:100%;height:55vh;border:none;border-radius:8px;"></iframe>`;
  } else {
    fetch(url)
      .then((r) => r.headers.get('content-type')?.includes('text') ? r.text() : null)
      .then((text) => {
        if (typeof text === 'string') {
          previewContainer.innerHTML = `<pre style="width:100%;height:50vh;overflow:auto;padding:14px;
            background:#ffffff;border:1px solid var(--border-soft);border-radius:8px;
            font-family:var(--font-mono);font-size:0.85rem;text-align:left;">${escHtml(text)}</pre>`;
        } else {
          const m = getFileIconMeta(file.mimetype || file.type, name);
          previewContainer.innerHTML = `
            <div style="display:flex;flex-direction:column;align-items:center;gap:12px;">
              <i class="${m.icon}" style="font-size:4.5rem;color:${m.color}"></i>
              <div style="font-weight:700;font-size:1rem;">${escHtml(name)}</div>
              <div style="font-size:0.85rem;color:var(--text-muted);">${formatBytes(file.size || file.fileSize)}</div>
            </div>`;
        }
      })
      .catch(() => { previewContainer.innerHTML = '<div>Preview unavailable. Please download to view.</div>'; });
  }
}

// ── Download ──────────────────────────────────────────────────────────────────
function downloadFile(file) {
  const url = file?.fileUrl || file?.url;
  if (!url) return;
  const a     = document.createElement('a');
  a.href      = url;
  a.download  = file.fileName || file.name || 'download';
  a.target    = '_blank';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

// ── Star / Unstar ─────────────────────────────────────────────────────────────
async function toggleStar(file) {
  const user = getCurrentUser();
  if (!user || !file) return;
  file.isStarred = !file.isStarred;
  applyFiltersAndRender();
  try {
    await updateDoc(doc(db, 'users', user.uid, 'files', file.id), {
      isStarred: file.isStarred, updatedAt: serverTimestamp()
    });
  } catch (err) { console.warn('[Zulora] toggleStar:', err.message); }
}

// ── Rename ────────────────────────────────────────────────────────────────────
function openRenameModal(file) {
  selectedFile = file;
  if (renameInput) renameInput.value = file.fileName || file.originalName || file.name || '';
  if (renameModal) { renameModal.classList.add('show'); renameInput?.focus(); }
}

renameForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!selectedFile) return;
  const newName = renameInput?.value.trim();
  if (!newName) return;
  const user = getCurrentUser();
  try {
    if (user) {
      await updateDoc(doc(db, 'users', user.uid, 'files', selectedFile.id), {
        name:         newName,
        fileName:     newName,
        originalName: newName,
        updatedAt:    serverTimestamp()
      });
    }
    renameModal?.classList.remove('show');
  } catch (err) { alert(err.message || 'Rename failed.'); }
});

// ── Copy Link ─────────────────────────────────────────────────────────────────
export function copyFileLink(file) {
  const url = file?.fileUrl || file?.url;
  if (!url) {
    showToast('No URL available for this file.', true);
    return;
  }
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(url).then(() => {
      showToast('Link copied to clipboard!');
    }).catch(() => {
      fallbackCopy(url);
    });
  } else {
    fallbackCopy(url);
  }
}

function fallbackCopy(text) {
  const input = document.createElement('input');
  input.value = text;
  document.body.appendChild(input);
  input.select();
  try {
    document.execCommand('copy');
    showToast('Link copied to clipboard!');
  } catch (_) {
    showToast('Failed to copy link.', true);
  }
  document.body.removeChild(input);
}

// ── Soft Delete: Move to Trash ────────────────────────────────────────────────
export async function moveToTrash(file) {
  const user = (firebase.auth && typeof firebase.auth === 'function' && firebase.auth().currentUser)
    ? firebase.auth().currentUser
    : (auth.currentUser || getCurrentUser());
  if (!user || !file) return;

  try {
    file.isTrashed = true;
    file.isTrash = true;
    applyFiltersAndRender();
    showToast(`Moved "${file.fileName || file.name}" to Trash.`);

    await Promise.all([
      updateDoc(doc(db, 'users', user.uid, 'files', file.id), {
        isTrashed: true,
        isTrash:   true,
        trashedAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      }).catch(() => {}),
      updateDoc(doc(db, 'files', file.id), {
        isTrashed: true,
        isTrash:   true,
        trashedAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      }).catch(() => {})
    ]);

    // Recalculate active storage used
    const activeBytes = calculateActiveStorage();
    if (profile) {
      profile.storageUsedBytes = activeBytes;
      profile.usedStorageBytes = activeBytes;
      profile.storageUsed      = activeBytes;
      updateStorageUI(profile);
    }
    await updateDoc(doc(db, 'users', user.uid), {
      storageUsedBytes: activeBytes,
      usedStorageBytes: activeBytes,
      storageUsed:      activeBytes,
      updatedAt:        serverTimestamp()
    }).catch(() => {});
  } catch (err) {
    console.error('[Zulora Trash] moveToTrash error:', err);
    showToast('Failed to move to Trash: ' + err.message, true);
  }
}

// ── Restore from Trash ────────────────────────────────────────────────────────
export async function restoreFromTrash(file) {
  const user = (firebase.auth && typeof firebase.auth === 'function' && firebase.auth().currentUser)
    ? firebase.auth().currentUser
    : (auth.currentUser || getCurrentUser());
  if (!user || !file) return;

  try {
    file.isTrashed = false;
    file.isTrash = false;
    applyFiltersAndRender();
    showToast(`Restored "${file.fileName || file.name}" to My Drive.`);

    await Promise.all([
      updateDoc(doc(db, 'users', user.uid, 'files', file.id), {
        isTrashed: false,
        isTrash:   false,
        restoredAt: serverTimestamp(),
        updatedAt:  serverTimestamp()
      }).catch(() => {}),
      updateDoc(doc(db, 'files', file.id), {
        isTrashed: false,
        isTrash:   false,
        restoredAt: serverTimestamp(),
        updatedAt:  serverTimestamp()
      }).catch(() => {})
    ]);

    // Recalculate active storage used
    const activeBytes = calculateActiveStorage();
    if (profile) {
      profile.storageUsedBytes = activeBytes;
      profile.usedStorageBytes = activeBytes;
      profile.storageUsed      = activeBytes;
      updateStorageUI(profile);
    }
    await updateDoc(doc(db, 'users', user.uid), {
      storageUsedBytes: activeBytes,
      usedStorageBytes: activeBytes,
      storageUsed:      activeBytes,
      updatedAt:        serverTimestamp()
    }).catch(() => {});
  } catch (err) {
    console.error('[Zulora Trash] restoreFromTrash error:', err);
    showToast('Failed to restore file: ' + err.message, true);
  }
}

// ── Empty Trash (Bulk Permanent Delete) ───────────────────────────────────────
export async function emptyTrash() {
  const trashedFiles = allFiles.filter(f => f.isTrashed || f.isTrash);
  if (trashedFiles.length === 0) {
    showToast('Recycle Bin is already empty.');
    return;
  }
  if (!confirm(`Permanently delete all ${trashedFiles.length} item(s) from the Recycle Bin? This action cannot be undone.`)) {
    return;
  }

  const user = (firebase.auth && typeof firebase.auth === 'function' && firebase.auth().currentUser)
    ? firebase.auth().currentUser
    : (auth.currentUser || getCurrentUser());
  if (!user) return;

  showToast('Emptying trash...');
  try {
    for (const f of trashedFiles) {
      await Promise.all([
        deleteDoc(doc(db, 'users', user.uid, 'files', f.id)).catch(() => {}),
        deleteDoc(doc(db, 'files', f.id)).catch(() => {})
      ]);
    }
    allFiles = allFiles.filter(f => !f.isTrashed && !f.isTrash);
    applyFiltersAndRender();
    showToast('Recycle Bin emptied.');
  } catch (err) {
    console.error('[Zulora Trash] emptyTrash error:', err);
    showToast('Failed to empty trash: ' + err.message, true);
  }
}

// ── Permanent Delete Modal & Confirmation ─────────────────────────────────────
function openDeleteModal(file) {
  selectedFile = file;
  const name   = file.fileName || file.originalName || file.name || 'this file';
  const prompt = $('deletePromptText');
  if (prompt) prompt.textContent =
    `Permanently delete "${name}"? This action cannot be undone.`;
  deleteModal?.classList.add('show');
}

confirmDeleteBtn?.addEventListener('click', async () => {
  if (!selectedFile) return;
  confirmDeleteBtn.disabled   = true;
  confirmDeleteBtn.innerHTML  = '<i class="fa-solid fa-circle-notch fa-spin"></i> Deleting...';
  const user = (firebase.auth && typeof firebase.auth === 'function' && firebase.auth().currentUser)
    ? firebase.auth().currentUser
    : (auth.currentUser || getCurrentUser());

  try {
    // 1. Remove Firestore doc under user ownership AND global files collection
    if (user) {
      await Promise.all([
        deleteDoc(doc(db, 'users', user.uid, 'files', selectedFile.id)).catch(() => {}),
        deleteDoc(doc(db, 'files', selectedFile.id)).catch(() => {})
      ]);
    }

    // 2. Clean up legacy Firebase Storage path if present
    if (selectedFile.storagePath) {
      try { await deleteObject(storageRef(storage, selectedFile.storagePath)); }
      catch (e) { /* ignore */ }
    }

    allFiles = allFiles.filter(f => f.id !== selectedFile.id);
    deleteModal?.classList.remove('show');
    showToast('File permanently deleted.');
    await refreshFileList();
  } catch (err) {
    alert(err.message || 'Failed to delete file.');
  } finally {
    confirmDeleteBtn.disabled  = false;
    confirmDeleteBtn.innerHTML = 'Delete File';
  }
});

// ── Context Menu ──────────────────────────────────────────────────────────────
function showContextMenu(e, file) {
  selectedFile = file;
  if (!fileContextMenu) return;
  const rect = e.target.getBoundingClientRect();
  fileContextMenu.style.top  = `${rect.bottom + window.scrollY + 4}px`;
  fileContextMenu.style.left = `${Math.min(window.innerWidth - 200, rect.left + window.scrollX - 80)}px`;
  fileContextMenu.classList.add('show');
}

document.addEventListener('click', (e) => {
  if (!e.target.closest('#fileContextMenu') && !e.target.closest('[data-action="open-menu"]')) {
    fileContextMenu?.classList.remove('show');
  }
  if (!e.target.closest('#userDropdown') && !e.target.closest('#userAvatarBtn')) {
    userDropdown?.classList.remove('show');
  }
});

fileContextMenu?.addEventListener('click', (e) => {
  const item = e.target.closest('.context-item');
  if (!item || !selectedFile) return;
  fileContextMenu.classList.remove('show');
  const action = item.dataset.action;
  if (action === 'preview')   openPreviewModal(selectedFile);
  if (action === 'download')  downloadFile(selectedFile);
  if (action === 'copy-link') copyFileLink(selectedFile);
  if (action === 'rename')    openRenameModal(selectedFile);
  if (action === 'star')      toggleStar(selectedFile);
  if (action === 'trash')     moveToTrash(selectedFile);
  if (action === 'restore')   restoreFromTrash(selectedFile);
  if (action === 'delete')    openDeleteModal(selectedFile);
});

// ══════════════════════════════════════════════════════════════════════════════
// USER DATA ISOLATION & CLOUDINARY UPLOAD HANDLER
// ══════════════════════════════════════════════════════════════════════════════
newUploadBtn?.addEventListener('click',     () => fileUploadInput?.click());
headerUploadBtn?.addEventListener('click',  () => fileUploadInput?.click());
emptyUploadBtn?.addEventListener('click',   () => fileUploadInput?.click());
emptyTrashBtn?.addEventListener('click',    () => emptyTrash());
sidebarAdminBtn?.addEventListener('click',  () => adminDashboardBtn?.click());

fileUploadInput?.addEventListener('change', (e) => {
  const files = Array.from(e.target.files || []);
  if (files.length > 0) uploadFilesBatch(files);
  fileUploadInput.value = '';
});

// Fullscreen workspace drag & drop
let dragCounter = 0;
if (mainWorkspace) {
  ['dragenter','dragover','dragleave','drop'].forEach((ev) => {
    mainWorkspace.addEventListener(ev, (e) => { e.preventDefault(); e.stopPropagation(); });
  });
  mainWorkspace.addEventListener('dragenter', () => { if (++dragCounter > 0) dropzoneOverlay?.classList.add('active'); });
  mainWorkspace.addEventListener('dragleave', () => { if (--dragCounter <= 0) { dragCounter = 0; dropzoneOverlay?.classList.remove('active'); } });
  mainWorkspace.addEventListener('drop', (e) => {
    dragCounter = 0;
    dropzoneOverlay?.classList.remove('active');
    const files = Array.from(e.dataTransfer?.files || []);
    if (files.length > 0) uploadFilesBatch(files);
  });
}

function dismissProgressPopup() {
  if (uploadDrawer) {
    uploadDrawer.classList.remove('show');
    setTimeout(() => {
      if (uploadDrawer) {
        uploadDrawer.style.display = 'none';
        if (uploadDrawerBody) uploadDrawerBody.innerHTML = '';
      }
    }, 300);
  }
  if (currentActiveProgressBar) {
    currentActiveProgressBar.style.width = '0%';
  }
  if (currentActiveProgressStatus) {
    currentActiveProgressStatus.textContent = '0%';
  }
}

/**
 * Asynchronous Cloudinary Upload Pipeline:
 *   - Checks Firebase Authentication status before upload
 *   - Direct Upload via XMLHttpRequest to: https://api.cloudinary.com/v1_1/${CLOUD_NAME}/auto/upload
 *   - Attach FormData: file, upload_preset
 *   - Track upload percentage in real-time and update UI progress bar
 *   - On HTTP 200 response:
 *       Extract secure_url and public_id
 *       Save document to Firestore files collection AND user subcollection:
 *       {
 *         fileName: fileObj.name,
 *         fileSize: fileObj.size,
 *         fileType: fileObj.type,
 *         fileUrl: resultData.secure_url,
 *         cloudinaryPublicId: resultData.public_id,
 *         uploadedAt: firebase.firestore.FieldValue.serverTimestamp(),
 *         userUid: firebase.auth().currentUser ? firebase.auth().currentUser.uid : "anonymous",
 *         userName: firebase.auth().currentUser ? firebase.auth().currentUser.displayName : "Guest User"
 *       }
 *   - IN ALL CASES (success or error), close/reset upload progress modal inside finally block
 */
function uploadFileToCloudinary(fileObj, onProgress) {
  return new Promise((resolve, reject) => {
    try {
      // 1. Initialize Firebase Auth and Firestore if not already initialized
      const currentUser = (firebase.auth && typeof firebase.auth === 'function' && firebase.auth().currentUser)
        ? firebase.auth().currentUser
        : (auth.currentUser || getCurrentUser());

      if (!currentUser) {
        const authErr = new Error("Please sign in to upload files.");
        console.error("[Zulora Upload] Authentication required:", authErr);
        return reject(authErr);
      }

      // 2. Direct Upload via XMLHttpRequest to Cloudinary API endpoint
      const uploadUrl = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/auto/upload`;

      // 3. Attach FormData: file and upload_preset
      const formData = new FormData();
      formData.append('file', fileObj);
      formData.append('upload_preset', UPLOAD_PRESET);
      formData.append('folder', `zulora_drive/users/${currentUser.uid}`);

      const xhr = new XMLHttpRequest();
      xhr.open('POST', uploadUrl, true);
      xhr.timeout = 20000; // 20-second timeout handling

      // 4. Track upload percentage in real-time and update UI progress bar & #uploadProgress
      xhr.upload.onloadstart = () => {
        if (typeof onProgress === 'function') onProgress(5, 'Starting...');
        updateUIProgressBar(5, 'Starting...');
        const pEl = $('uploadProgress');
        if (pEl) pEl.textContent = '5%';
      };

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && e.total > 0) {
          const percent = Math.min(99, Math.round((e.loaded / e.total) * 100));
          if (typeof onProgress === 'function') onProgress(percent, `${percent}%`);
          updateUIProgressBar(percent, `${percent}%`);
          const pEl = $('uploadProgress');
          if (pEl) pEl.textContent = `${percent}%`;
        } else {
          if (typeof onProgress === 'function') onProgress(50, 'Uploading...');
          updateUIProgressBar(50, 'Uploading...');
          const pEl = $('uploadProgress');
          if (pEl) pEl.textContent = '50%';
        }
      };

      xhr.upload.onload = () => {
        if (typeof onProgress === 'function') onProgress(100, 'Saving...');
        updateUIProgressBar(100, 'Saving...');
        const pEl = $('uploadProgress');
        if (pEl) pEl.textContent = '100%';
      };

      xhr.onloadend = () => {
        const pEl = $('uploadProgress');
        if (pEl) pEl.textContent = '100%';
      };

      // 5. On HTTP 200 response:
      xhr.onload = async () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const resultData = JSON.parse(xhr.responseText);
            const fileId = doc(collection(db, 'files')).id;

            const fileMetadata = {
              fileName:           fileObj.name,
              fileSize:           fileObj.size,
              fileType:           fileObj.type || 'application/octet-stream',
              fileUrl:            resultData.secure_url,
              cloudinaryPublicId: resultData.public_id,
              uploadedAt:         (firebase.firestore && firebase.firestore.FieldValue)
                ? firebase.firestore.FieldValue.serverTimestamp()
                : serverTimestamp(),
              userUid:            (firebase.auth && typeof firebase.auth === 'function' && firebase.auth().currentUser)
                ? firebase.auth().currentUser.uid
                : (currentUser ? currentUser.uid : "guest"),
              userName:           (firebase.auth && typeof firebase.auth === 'function' && firebase.auth().currentUser)
                ? (firebase.auth().currentUser.displayName || currentUser?.displayName || (currentUser?.email ? currentUser.email.split('@')[0] : "User"))
                : (currentUser?.displayName || "Guest User"),
              isTrashed:          false,
              // Dual-write mirror fields for UI renderer & search
              id:                 fileId,
              name:               fileObj.name,
              originalName:       fileObj.name,
              type:               fileObj.type || 'application/octet-stream',
              mimetype:           fileObj.type || 'application/octet-stream',
              size:               fileObj.size,
              url:                resultData.secure_url,
              isStarred:          false,
              isTrash:            false,
              createdAt:          serverTimestamp(),
              updatedAt:          serverTimestamp()
            };

            // Save document to Firestore files collection AND users/{userId}/files/{fileId}
            await Promise.all([
              setDoc(doc(db, 'files', fileId), fileMetadata),
              setDoc(doc(db, 'users', currentUser.uid, 'files', fileId), fileMetadata)
            ]);

            // Update user's storageUsedBytes in Firestore
            try {
              await updateDoc(doc(db, 'users', currentUser.uid), {
                storageUsedBytes: increment(fileObj.size),
                usedStorageBytes: increment(fileObj.size),
                storageUsed:      increment(fileObj.size),
                updatedAt:        serverTimestamp()
              });
            } catch (qErr) {
              console.warn('[Zulora] Quota increment notice:', qErr.message);
            }

            resolve(resultData);
          } catch (dbErr) {
            console.warn("[Zulora Upload] Firestore save notice:", dbErr);
            try {
              resolve(JSON.parse(xhr.responseText));
            } catch (_) {
              resolve({});
            }
          }
        } else {
          let errMsg = `Upload failed (HTTP ${xhr.status})`;
          try {
            const errObj = JSON.parse(xhr.responseText);
            if (errObj.error && errObj.error.message) errMsg = errObj.error.message;
          } catch (_) {
            if (xhr.statusText) errMsg = xhr.statusText;
          }
          console.error("[Zulora Cloudinary Error]:", errMsg, xhr.responseText);
          showToast(errMsg, true);
          reject(new Error(errMsg));
        }
      };

      xhr.onerror = () => {
        const netErr = new Error("Network/CORS error uploading to Cloudinary.");
        console.error("[Zulora Upload Network Error]:", netErr);
        showToast(netErr.message, true);
        reject(netErr);
      };

      xhr.ontimeout = () => {
        const timeoutErr = new Error("Upload timed out (20s limit). Please check your internet connection.");
        console.error("[Zulora Upload Timeout]:", timeoutErr);
        showToast(timeoutErr.message, true);
        reject(timeoutErr);
      };

      xhr.onabort = () => {
        reject(new Error("Upload was cancelled."));
      };

      xhr.send(formData);
    } catch (err) {
      showToast(err.message || "Upload error occurred.", true);
      reject(err);
    }
  });
}

/**
 * Batch upload pipeline with:
 *   - 500 MB per-file limit check (Starter plan)
 *   - Storage quota check before each upload
 *   - Real-time progress drawer with per-file status
 *   - 6. IN ALL CASES (success or error), close/reset upload progress modal inside finally block
 */
async function uploadFilesBatch(files) {
  const user = (firebase.auth && typeof firebase.auth === 'function' && firebase.auth().currentUser)
    ? firebase.auth().currentUser
    : (auth.currentUser || getCurrentUser());

  if (!user) {
    alert('Please sign in first!');
    return;
  }
  if (!files || files.length === 0) return;

  if (uploadDrawer) {
    uploadDrawer.style.display = 'block';
    uploadDrawer.classList.add('show');
  }
  if (uploadDrawerStatus) {
    uploadDrawerStatus.innerHTML =
      '<i class="fa-solid fa-circle-notch fa-spin text-azure"></i> Uploading to Zulora Drive (Cloudinary)...';
  }
  if (uploadDrawerBody) uploadDrawerBody.innerHTML = '';

  try {
    for (const file of files) {
      const limit = Number(profile?.storageLimitBytes || profile?.storageLimit || DEFAULT_STORAGE_BYTES);
      const used  = Number(profile?.storageUsedBytes || profile?.usedStorageBytes || profile?.storageUsed || 0);

      // 500 MB single-file limit for Starter plan (10 GB default)
      if (limit <= DEFAULT_STORAGE_BYTES && file.size > MAX_STARTER_FILE_BYTES) {
        alert(`Single-file limit exceeded: Starter plan allows 500 MB per file. "${file.name}" is ${formatBytes(file.size)}. Upgrade to Storage Lite or Business Pro for larger files.`);
        openPlansModal();
        continue;
      }

      if (used + file.size > limit) {
        alert(`Storage quota exceeded: "${file.name}" requires ${formatBytes(file.size)}, but only ${formatBytes(Math.max(0, limit - used))} remains.`);
        openPlansModal();
        continue;
      }

      const row = document.createElement('div');
      row.className = 'upload-item-row';
      row.innerHTML = `
        <div class="upload-item-info">
          <span class="upload-item-name" title="${escHtml(file.name)}">${escHtml(file.name)}</span>
          <span class="upload-status-text" style="font-size:0.78rem;font-weight:600;color:var(--azure-primary);">0%</span>
        </div>
        <div class="upload-item-progress-track">
          <div class="upload-item-progress-bar"></div>
        </div>`;
      uploadDrawerBody?.appendChild(row);

      const bar    = row.querySelector('.upload-item-progress-bar');
      const status = row.querySelector('.upload-status-text');
      currentActiveProgressBar    = bar;
      currentActiveProgressStatus = status;

      try {
        await uploadFileToCloudinary(file, (progress, statusText) => {
          if (bar) {
            bar.style.width = `${progress}%`;
            bar.style.background = 'linear-gradient(90deg, #0ea5e9, #38bdf8)';
          }
          if (status) {
            status.textContent = statusText || `${progress}%`;
            status.style.color = 'var(--azure-primary)';
          }
        });

        if (status) {
          status.innerHTML = '<i class="fa-solid fa-circle-check" style="color:#10b981;"></i> Done';
          status.style.color = '#10b981';
        }
        if (bar) {
          bar.style.width = '100%';
          bar.style.background = '#10b981';
        }
      } catch (err) {
        console.error('[Zulora Upload] Upload failed for:', file.name, err);
        const friendlyMsg = err.message || 'Upload failed';
        if (status) {
          status.innerHTML = `<span style="color:#ef4444;font-size:0.75rem;font-weight:600;" title="${escHtml(friendlyMsg)}"><i class="fa-solid fa-circle-xmark"></i> ${escHtml(friendlyMsg.length > 28 ? friendlyMsg.substring(0, 26) + '...' : friendlyMsg)}</span>`;
        }
        if (bar) {
          bar.style.width = '100%';
          bar.style.background = '#ef4444'; // Red bar indicating failed state
        }
      }
    }
  } catch (batchErr) {
    console.error('[Zulora Upload] Batch error:', batchErr);
  } finally {
    // 3. FAILSAFE UI MODAL CLEANUP:
    // Always dismiss upload modals and reset file inputs in a `finally` block so the UI never freezes at 0%
    if (fileUploadInput) fileUploadInput.value = '';
    dismissProgressPopup();
    await refreshFileList();
  }
}

closeUploadDrawerBtn?.addEventListener('click', () => {
  uploadDrawer?.classList.remove('show');
  setTimeout(() => { if (uploadDrawer) uploadDrawer.style.display = 'none'; }, 200);
});

// ══════════════════════════════════════════════════════════════════════════════
// SEARCH, FILTER CHIPS, SORT & VIEW SWITCHER
// ══════════════════════════════════════════════════════════════════════════════
globalSearchInput?.addEventListener('input', () => {
  if (searchClearBtn) searchClearBtn.style.display = globalSearchInput.value ? 'block' : 'none';
  applyFiltersAndRender();
});

searchClearBtn?.addEventListener('click', () => {
  globalSearchInput.value = '';
  searchClearBtn.style.display = 'none';
  applyFiltersAndRender();
  globalSearchInput.focus();
});

// Type filter chips (All, Images, Docs, Videos, Audio, Archives)
document.querySelectorAll('.filter-chip').forEach((chip) => {
  chip.addEventListener('click', () => {
    document.querySelectorAll('.filter-chip').forEach((c) => c.classList.remove('active'));
    chip.classList.add('active');
    currentCategory = chip.dataset.filter;
    applyFiltersAndRender();
  });
});

// Sidebar nav items
document.querySelectorAll('.sidebar-nav .nav-item').forEach((item) => {
  item.addEventListener('click', () => {
    if (item.hasAttribute('data-open-referral')) return;
    document.querySelectorAll('.sidebar-nav .nav-item').forEach((i) => i.classList.remove('active'));
    item.classList.add('active');

    if (item.dataset.nav) {
      if (item.dataset.nav === 'admin') {
        adminDashboardBtn?.click();
        return;
      }
      currentNav = item.dataset.nav;
      currentCategory = 'all';
      document.querySelectorAll('.filter-chip').forEach((c) => c.classList.remove('active'));
      document.querySelector('.filter-chip[data-filter="all"]')?.classList.add('active');
      if (currentViewTitle) {
        currentViewTitle.textContent = currentNav === 'trash' ? 'Trash / Recycle Bin' : (item.querySelector('span')?.textContent || 'My Drive');
      }
    } else if (item.dataset.category) {
      currentNav = 'my-drive';
      currentCategory = item.dataset.category;
      document.querySelectorAll('.filter-chip').forEach((c) => c.classList.remove('active'));
      document.querySelector(`.filter-chip[data-filter="${currentCategory}"]`)?.classList.add('active');
      if (currentViewTitle) currentViewTitle.textContent = item.querySelector('span')?.textContent || 'My Drive';
    }

    applyFiltersAndRender();
    if (window.innerWidth <= 900) appSidebar?.classList.remove('open');
  });
});

// Mobile bottom navigation bar controls
document.querySelectorAll('.mobile-nav-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    const target = btn.dataset.mobileNav;
    document.querySelectorAll('.mobile-nav-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    if (target === 'my-drive' || target === 'recent' || target === 'starred') {
      currentNav = target;
      currentCategory = 'all';
      document.querySelectorAll('.filter-chip').forEach((c) => c.classList.remove('active'));
      document.querySelector('.filter-chip[data-filter="all"]')?.classList.add('active');
      if (currentViewTitle) {
        currentViewTitle.textContent = target === 'my-drive' ? 'My Drive' : target === 'recent' ? 'Recent' : 'Starred';
      }
      applyFiltersAndRender();
    } else if (target === 'storage') {
      openPlansModal();
    }
  });
});

$('mobileBottomUploadBtn')?.addEventListener('click', () => {
  fileUploadInput?.click();
});

// Sort dropdown
sortBySelect?.addEventListener('change', () => {
  currentSort = sortBySelect.value;
  applyFiltersAndRender();
});

// Grid / List view toggle
function setViewMode(mode) {
  currentViewMode = mode;
  localStorage.setItem('zulora_view_mode', mode);
  viewGridBtn?.classList.toggle('active', mode === 'grid');
  viewListBtn?.classList.toggle('active', mode === 'list');
  renderFilesView();
}

viewGridBtn?.addEventListener('click', () => setViewMode('grid'));
viewListBtn?.addEventListener('click', () => setViewMode('list'));
setViewMode(currentViewMode);

// Mobile sidebar hamburger
mobileMenuBtn?.addEventListener('click', () => appSidebar?.classList.toggle('open'));

// User avatar dropdown toggle
userAvatarBtn?.addEventListener('click', (e) => {
  e.stopPropagation();
  userDropdown?.classList.toggle('show');
});

// Sign Out
logoutBtn?.addEventListener('click', async () => {
  try {
    if (typeof filesUnsubscribe === 'function') {
      filesUnsubscribe();
      filesUnsubscribe = null;
    }
    await logOut();
    setAuthStateUI(false);
    showToast('Signed out successfully');
  } catch (err) { alert(err.message || 'Logout failed.'); }
});

// ══════════════════════════════════════════════════════════════════════════════
// STORAGE PLANS & UPI PAYMENT FLOW
// ══════════════════════════════════════════════════════════════════════════════
function openPlansModal() { plansModal?.classList.add('show'); }

[openPlansModalBtn, headerUpgradeBtn, sidebarUpgradeBtn, bannerUpgradeBtn, dropdownUpgradeBtn]
  .forEach((btn) => btn?.addEventListener('click', openPlansModal));

// Plan selection → UPI payment dialog
document.querySelectorAll('.select-plan-btn').forEach((btn) => {
  btn.addEventListener('click', () =>
    openUpiPayment(btn.dataset.plan, btn.dataset.name, btn.dataset.amount)
  );
});

function openUpiPayment(planKey, planName, amount) {
  activePlan = { key: planKey, name: planName, amount };
  plansModal?.classList.remove('show');

  if (upiModalPlanTitle)  upiModalPlanTitle.textContent  = `Upgrade to ${planName}`;
  if (upiModalAmountText) upiModalAmountText.textContent = `Pay: ₹${amount} / month`;

  const upiUrl = `upi://pay?pa=${SUPPORT_UPI_ID}&pn=Zulora%20Drive&am=${amount}&cu=INR&tn=Zulora%20Drive%20${encodeURIComponent(planName)}`;
  if (payUpiDeepLink) payUpiDeepLink.href = upiUrl;
  if (upiQrCodeImg)   upiQrCodeImg.src   = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(upiUrl)}`;

  if (whatsappVerifyBtn) {
    const waText = `Hello Zulora Support, I have paid for ${planName} via UPI (₹${amount}/month). Please activate my plan.`;
    whatsappVerifyBtn.href = `https://wa.me/916395211325?text=${encodeURIComponent(waText)}`;
  }

  if (utrInput) utrInput.value = '';
  upiModal?.classList.add('show');
}

// Copy UPI ID
copyUpiBtn?.addEventListener('click', () => {
  navigator.clipboard.writeText(SUPPORT_UPI_ID);
  copyUpiBtn.innerHTML = '<i class="fa-solid fa-check"></i> Copied!';
  setTimeout(() => { copyUpiBtn.innerHTML = '<i class="fa-regular fa-copy"></i> Copy UPI ID'; }, 2000);
});

// UTR submission to Firestore (pending manual admin verification)
upiConfirmForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const utr    = utrInput?.value.trim();
  const user   = getCurrentUser();
  if (!utr || !activePlan || !user) return;

  const submitBtn = $('submitUtrBtn');
  if (submitBtn) { submitBtn.disabled = true; submitBtn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Submitting...'; }

  try {
    await addDoc(collection(db, 'upgradeRequests'), {
      userUid:          user.uid,
      email:            user.email,
      accountId:        profile?.accountId || deriveAccountId(user),
      plan:             activePlan.key,
      planLabel:        activePlan.name,
      amount:           Number(activePlan.amount),
      paymentReference: utr,
      upiId:            SUPPORT_UPI_ID,
      status:           'pending',
      createdAt:        serverTimestamp(),
      updatedAt:        serverTimestamp()
    });

    upiModal?.classList.remove('show');
    alert(`Payment reference for ${activePlan.name} (UTR: ${utr}) submitted. Your quota will be upgraded shortly after verification.`);
  } catch (err) {
    alert(err.message || 'Submission failed. Please try again.');
  } finally {
    if (submitBtn) { submitBtn.disabled = false; submitBtn.innerHTML = '<i class="fa-solid fa-check"></i> Submit Verification Request'; }
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// REFERRAL PROGRAM (+5 GB per successful referral)
// ══════════════════════════════════════════════════════════════════════════════
document.querySelectorAll('[data-open-referral]').forEach((btn) => {
  btn.addEventListener('click', () => {
    userDropdown?.classList.remove('show');
    const user = getCurrentUser();
    const link = getReferralLink(user);

    if (referralLinkInput) referralLinkInput.value = link;

    if (shareReferralWaBtn) {
      const waMsg = `Join me on Zulora Drive and get 10 GB free secure cloud storage! Use my referral link: ${link}`;
      shareReferralWaBtn.href = `https://wa.me/?text=${encodeURIComponent(waMsg)}`;
    }

    if (referralStatsText) {
      const bonus = formatBytes(profile?.referralBonusBytes || 0);
      const count = profile?.totalReferrals || 0;
      referralStatsText.textContent =
        `You have earned ${bonus} bonus storage across ${count} referral${count === 1 ? '' : 's'}.`;
    }

    referralModal?.classList.add('show');
  });
});

copyReferralBtn?.addEventListener('click', () => {
  const link = referralLinkInput?.value;
  if (!link) return;
  navigator.clipboard.writeText(link);
  copyReferralBtn.innerHTML = '<i class="fa-solid fa-check"></i> Copied!';
  setTimeout(() => { copyReferralBtn.innerHTML = '<i class="fa-regular fa-copy"></i> Copy Link'; }, 2000);
});

// ══════════════════════════════════════════════════════════════════════════════
// ADMIN CONSOLE (zulora.help@gmail.com)
// ══════════════════════════════════════════════════════════════════════════════
/**
 * Queries all documents from the `users` collection and `files` collection
 * to view total users registered, total files uploaded across all accounts,
 * and total system storage used.
 */
export async function loadAdminOverview() {
  try {
    const [usersSnap, filesSnap] = await Promise.all([
      getDocs(collection(db, 'users')),
      getDocs(collection(db, 'files'))
    ]);

    const users = usersSnap.docs.map((d) => ({ uid: d.id, ...d.data() }));
    const files = filesSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

    const totalUsers = users.length;
    const totalFiles = files.length;

    let totalStorage = 0;
    files.forEach((f) => {
      totalStorage += Number(f.fileSize || f.size || 0);
    });

    if (totalStorage === 0) {
      users.forEach((u) => {
        totalStorage += Number(u.storageUsedBytes || u.usedStorageBytes || u.storageUsed || 0);
      });
    }

    if (adminTotalUsers)   adminTotalUsers.textContent   = totalUsers;
    if (adminTotalFiles)   adminTotalFiles.textContent   = totalFiles;
    if (adminTotalStorage) adminTotalStorage.textContent = formatBytes(totalStorage);

    if (adminUsersTableBody) {
      adminUsersTableBody.innerHTML = '';
      users.forEach((u) => {
        const tr      = document.createElement('tr');
        const used    = formatBytes(u.storageUsedBytes ?? u.usedStorageBytes ?? u.storageUsed ?? 0);
        const limitGb = Math.round((u.storageLimitBytes || u.storageLimit || DEFAULT_STORAGE_BYTES) / (1024 ** 3));

        tr.innerHTML = `
          <td style="font-weight:600;">${escHtml(u.email || u.name || u.displayName || u.uid)}</td>
          <td>${used}</td>
          <td><strong>${limitGb} GB</strong></td>
          <td>
            <button class="btn btn-azure-soft btn-sm" data-uid="${u.uid}" data-limit="${limitGb}">
              <i class="fa-solid fa-pen"></i> Override Quota
            </button>
          </td>`;

        tr.querySelector('button')?.addEventListener('click', () =>
          promptEditQuota(u.uid, u.email || u.name || u.displayName, limitGb)
        );

        adminUsersTableBody.appendChild(tr);
      });
    }

    return { totalUsers, totalFiles, totalStorage, users, files };
  } catch (err) {
    console.error('[Zulora Admin] loadAdminOverview error:', err);
    throw err;
  }
}

if (typeof window !== 'undefined') {
  window.loadAdminOverview = loadAdminOverview;
}

adminDashboardBtn?.addEventListener('click', async () => {
  userDropdown?.classList.remove('show');
  adminModal?.classList.add('show');
  try {
    await loadAdminOverview();
  } catch (err) {
    alert('Admin data load error: ' + err.message);
  }
});

async function promptEditQuota(uid, email, currentGb) {
  const input = prompt(`Set custom storage quota (GB) for ${email}:`, currentGb);
  if (!input) return;
  const newGb = parseInt(input, 10);
  if (isNaN(newGb) || newGb < 1 || newGb > 50_000) {
    alert('Please enter a valid number between 1 and 50,000 GB.');
    return;
  }
  try {
    await updateUserQuota(uid, Math.floor(newGb * 1024 ** 3));
    alert(`Storage quota for ${email} overridden to ${newGb} GB!`);
    adminDashboardBtn.click(); // Refresh admin table
    const updated = await refreshProfile().catch(() => null);
    if (updated) updateStorageUI(updated);
  } catch (err) {
    alert(err.message || 'Quota override failed.');
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// MODAL CLOSE CONTROLS
// ══════════════════════════════════════════════════════════════════════════════
document.querySelectorAll('.modal-close').forEach((btn) => {
  btn.addEventListener('click', (e) => {
    e.target.closest('.modal-backdrop')?.classList.remove('show');
  });
});

document.querySelectorAll('.modal-backdrop').forEach((modal) => {
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.classList.remove('show');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// PUBLIC LANDING PAGE LEGAL MODAL CONTROLS
// ══════════════════════════════════════════════════════════════════════════════
$('openTermsLink')?.addEventListener('click', (e) => {
  e.preventDefault();
  $('termsModal')?.classList.add('show');
});

$('openPrivacyLink')?.addEventListener('click', (e) => {
  e.preventDefault();
  $('privacyModal')?.classList.add('show');
});

['openAboutLink', 'openAboutBtn'].forEach((id) => {
  $(id)?.addEventListener('click', (e) => {
    e.preventDefault();
    $('aboutModal')?.classList.add('show');
  });
});
