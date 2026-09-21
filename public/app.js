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
  getDocs,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  increment,
  query,
  orderBy,
  onSnapshot,
  firebase
} from './firebase-config.js';

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
const sidebarUpgradeBtn   = $('sidebarUpgradeBtn');
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

// ══════════════════════════════════════════════════════════════════════════════
// FORMATTING HELPERS
// ══════════════════════════════════════════════════════════════════════════════
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
// REAL-TIME STORAGE USAGE METER
// ══════════════════════════════════════════════════════════════════════════════
function updateStorageUI(p) {
  if (!p) return;
  profile = p;

  const used    = Number(p.usedStorageBytes || p.storageUsed || 0);
  const limit   = Number(p.storageLimitBytes || p.storageLimit || DEFAULT_STORAGE_BYTES);
  const percent = Math.min(100, Math.round((used / limit) * 100));

  if (storagePercentText) storagePercentText.textContent = `${percent}%`;

  if (storageProgressBar) {
    storageProgressBar.style.width      = `${percent}%`;
    storageProgressBar.style.background = percent >= 90
      ? '#ef4444'
      : percent >= 75
        ? '#f59e0b'
        : 'linear-gradient(90deg, #0ea5e9, #38bdf8)';
  }

  // Segmented category bar
  let photoBytes = 0, docBytes = 0, mediaBytes = 0, audioBytes = 0, otherBytes = 0;
  allFiles.forEach((f) => {
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
    if (percent >= 90) {
      quotaWarningBanner.className = 'storage-banner danger';
      if (quotaWarningText) quotaWarningText.textContent =
        `Critical: ${percent}% of your allocated cloud space is full. Upgrade now.`;
      quotaWarningBanner.style.display = 'flex';
    } else if (percent >= 75) {
      quotaWarningBanner.className = 'storage-banner warning';
      if (quotaWarningText) quotaWarningText.textContent =
        `Notice: You have used ${percent}% of your cloud storage.`;
      quotaWarningBanner.style.display = 'flex';
    } else {
      quotaWarningBanner.style.display = 'none';
    }
  }

  if (storageUsageDetails) {
    storageUsageDetails.innerHTML = `<b>${formatBytes(used)}</b> of ${formatBytes(limit, 0)} used`;
  }

  const isAdminUser = isAdmin(p);
  const tierName    = isAdminUser ? 'Admin' : (p.planType || (limit > DEFAULT_STORAGE_BYTES ? 'Pro' : 'Starter'));
  if (dropdownPlanBadge) {
    dropdownPlanBadge.textContent = `${tierName} · ${formatBytes(limit, 0)}`;
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
}

// ══════════════════════════════════════════════════════════════════════════════
// PROGRESS BAR UI UPDATER
// ══════════════════════════════════════════════════════════════════════════════
function updateUIProgressBar(percent) {
  if (currentActiveProgressBar) {
    currentActiveProgressBar.style.width = `${percent}%`;
  }
  if (currentActiveProgressStatus) {
    currentActiveProgressStatus.textContent = `${percent}%`;
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
      isTrash:            Boolean(d.isTrash),
      uploadedAt:         iso,
      createdAt:          iso
    };
  });

  applyFiltersAndRender();
  if (profile) updateStorageUI(profile);
}

/**
 * Refresh user profile & quota status
 */
async function refreshUserFiles() {
  const currentUser = auth.currentUser || getCurrentUser();
  if (!currentUser) return;
  try {
    const updated = await refreshProfile().catch(() => null);
    if (updated) updateStorageUI(updated);
  } catch (_) {}
}

// Backward-compatible loadUserFiles
async function loadUserFiles(uid) {
  const currentUser = auth.currentUser || getCurrentUser();
  if (currentUser) {
    subscribeUserFiles(currentUser);
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// AUTH LIFECYCLE
// ══════════════════════════════════════════════════════════════════════════════
function initAuthLifecycle() {
  onAuthChange(async (user) => {
    if (!user) {
      if (typeof filesUnsubscribe === 'function') {
        filesUnsubscribe();
        filesUnsubscribe = null;
      }
      window.location.replace('login.html');
      return;
    }

    // Immediate UI placeholder until Firestore loads
    setupUserUI(user, {
      email:       user.email,
      displayName: user.displayName || user.email.split('@')[0],
      username:    deriveUsername(user),
      accountId:   deriveAccountId(user)
    });

    try {
      profile = await bootstrapUser();
    } catch (err) {
      console.warn('[Zulora] bootstrapUser fallback:', err.message);
      profile = {
        uid:               user.uid,
        email:             user.email,
        displayName:       user.displayName || user.email.split('@')[0] || 'User',
        username:          deriveUsername(user),
        accountId:         deriveAccountId(user),
        photoURL:          user.photoURL || '',
        storageLimitBytes: DEFAULT_STORAGE_BYTES,  // 10 GB
        usedStorageBytes:  0,
        planType:          'Starter',
        tier:              'free',
        isAdmin:           (user.email || '').toLowerCase() === ADMIN_EMAIL
      };
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
    if (currentNav === 'trash')   { if (!file.isTrash)  return false; }
    else                          { if (file.isTrash)   return false; }
    if (currentNav === 'starred' && !file.isStarred)     return false;

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

  if (!hasFiles) {
    if (filesGrid)       filesGrid.innerHTML      = '';
    if (filesTableBody)  filesTableBody.innerHTML = '';
    return;
  }

  currentViewMode === 'grid' ? renderGridView() : renderListView();
}

// ── Grid View (TeraBox-style thumbnail cards) ─────────────────────────────────
function renderGridView() {
  if (!filesGrid) return;
  filesGrid.innerHTML = '';

  filteredFiles.forEach((file) => {
    const meta  = getFileIconMeta(file.mimetype || file.type, file.name);
    const isImg = getFileCategory(file.mimetype || file.type, file.name) === 'images';
    const card  = document.createElement('div');
    card.className      = 'file-card';
    card.dataset.fileId = file.id;

    card.innerHTML = `
      <div class="file-card-preview-box">
        ${isImg && file.url
          ? `<img src="${file.url}" alt="${escHtml(file.name)}" class="file-card-thumb" loading="lazy">`
          : `<i class="${meta.icon} file-card-icon-large" style="color:${meta.color};"></i>`}
      </div>
      <div class="file-card-actions">
        <span class="file-card-type-tag">${meta.label}</span>
        <div class="file-card-buttons">
          <button class="star-btn${file.isStarred ? ' starred' : ''}" data-action="toggle-star"
            title="${file.isStarred ? 'Unstar' : 'Star'}">
            <i class="${file.isStarred ? 'fa-solid' : 'fa-regular'} fa-star"></i>
          </button>
          <button class="menu-btn" data-action="open-menu" title="More options">
            <i class="fa-solid fa-ellipsis-vertical"></i>
          </button>
        </div>
      </div>
      <div class="file-card-info">
        <div class="file-card-title" title="${escHtml(file.name)}">${escHtml(file.name)}</div>
        <div class="file-card-meta">
          <span>${formatBytes(file.size)}</span>
          <span>${formatDate(file.uploadedAt || file.createdAt)}</span>
        </div>
      </div>`;

    card.addEventListener('click', (e) => { if (!e.target.closest('button')) openPreviewModal(file); });
    card.querySelector('[data-action="toggle-star"]')?.addEventListener('click', (e) => { e.stopPropagation(); toggleStar(file); });
    card.querySelector('[data-action="open-menu"]')?.addEventListener('click', (e) => { e.stopPropagation(); showContextMenu(e, file); });

    filesGrid.appendChild(card);
  });
}

// ── List View (Google Drive-style table) ──────────────────────────────────────
function renderListView() {
  if (!filesTableBody) return;
  filesTableBody.innerHTML = '';

  filteredFiles.forEach((file) => {
    const meta = getFileIconMeta(file.mimetype || file.type, file.name);
    const tr   = document.createElement('tr');
    tr.dataset.fileId = file.id;

    tr.innerHTML = `
      <td>
        <div class="table-name-cell">
          <i class="${meta.icon} table-file-icon" style="color:${meta.color};"></i>
          <span title="${escHtml(file.name)}">${escHtml(file.name)}</span>
        </div>
      </td>
      <td>${formatBytes(file.size)}</td>
      <td>${formatDate(file.uploadedAt || file.createdAt)}</td>
      <td>
        <div class="table-actions">
          <button class="star-btn${file.isStarred ? ' starred' : ''}" data-action="toggle-star" title="Star">
            <i class="${file.isStarred ? 'fa-solid' : 'fa-regular'} fa-star"></i>
          </button>
          <button class="btn-icon" data-action="preview"  title="Preview"><i class="fa-regular fa-eye"></i></button>
          <button class="btn-icon" data-action="download" title="Download"><i class="fa-solid fa-download"></i></button>
          <button class="menu-btn" data-action="open-menu" title="More"><i class="fa-solid fa-ellipsis-vertical"></i></button>
        </div>
      </td>`;

    tr.addEventListener('click', (e) => { if (!e.target.closest('button')) openPreviewModal(file); });
    tr.querySelector('[data-action="toggle-star"]')?.addEventListener('click', (e) => { e.stopPropagation(); toggleStar(file); });
    tr.querySelector('[data-action="preview"]')?.addEventListener('click',     (e) => { e.stopPropagation(); openPreviewModal(file); });
    tr.querySelector('[data-action="download"]')?.addEventListener('click',    (e) => { e.stopPropagation(); downloadFile(file); });
    tr.querySelector('[data-action="open-menu"]')?.addEventListener('click',   (e) => { e.stopPropagation(); showContextMenu(e, file); });

    filesTableBody.appendChild(tr);
  });
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

// ── Delete ────────────────────────────────────────────────────────────────────
function openDeleteModal(file) {
  selectedFile = file;
  const name   = file.fileName || file.originalName || file.name || 'this file';
  const prompt = $('deletePromptText');
  if (prompt) prompt.textContent =
    `Delete "${name}" permanently? This cannot be undone and your storage quota will be reclaimed immediately.`;
  deleteModal?.classList.add('show');
}

confirmDeleteBtn?.addEventListener('click', async () => {
  if (!selectedFile) return;
  confirmDeleteBtn.disabled   = true;
  confirmDeleteBtn.innerHTML  = '<i class="fa-solid fa-circle-notch fa-spin"></i> Deleting...';
  const user = getCurrentUser();

  try {
    // 1. Remove Firestore doc under strict user ownership
    if (user) {
      const fileBytes = Number(selectedFile.size || selectedFile.fileSize || 0);
      await deleteDoc(doc(db, 'users', user.uid, 'files', selectedFile.id));
      await updateDoc(doc(db, 'users', user.uid), {
        usedStorageBytes: increment(-fileBytes),
        storageUsed:      increment(-fileBytes),
        updatedAt:        serverTimestamp()
      }).catch(() => {});
    }

    // 2. Clean up legacy Firebase Storage path if present
    if (selectedFile.storagePath) {
      try { await deleteObject(storageRef(storage, selectedFile.storagePath)); }
      catch (e) { /* ignore */ }
    }

    deleteModal?.classList.remove('show');
    refreshUserFiles();
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
  if (action === 'preview')  openPreviewModal(selectedFile);
  if (action === 'download') downloadFile(selectedFile);
  if (action === 'rename')   openRenameModal(selectedFile);
  if (action === 'star')     toggleStar(selectedFile);
  if (action === 'delete')   openDeleteModal(selectedFile);
});

// ══════════════════════════════════════════════════════════════════════════════
// USER DATA ISOLATION & CLOUDINARY UPLOAD HANDLER
// ══════════════════════════════════════════════════════════════════════════════
newUploadBtn?.addEventListener('click',  () => fileUploadInput?.click());
emptyUploadBtn?.addEventListener('click',() => fileUploadInput?.click());

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

/**
 * Cloudinary Upload Pipeline with strict user isolation:
 *   - Checks Firebase Authentication status before upload
 *   - Constructs FormData with upload_preset and folder `zulora_drive/users/${currentUser.uid}`
 *   - Uses XMLHttpRequest to perform upload and track progress
 *   - Onload: stores metadata in Firestore under strict user ownership
 *   - Calls refreshUserFiles()
 */
function uploadFileToCloudinary(file, onProgress) {
  return new Promise((resolve, reject) => {
    // 1. Ensure Firebase Authentication status is checked before any upload
    const currentUser = auth.currentUser || getCurrentUser();
    if (!currentUser) {
      alert("Please sign in first!");
      return reject(new Error("Unauthenticated"));
    }

    // 2. Get current user's UID and email
    const userUid   = currentUser.uid;
    const userEmail = currentUser.email || '';

    // 3. Construct FormData
    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', 'zulora_preset');
    formData.append('folder', `zulora_drive/users/${currentUser.uid}`);

    // 4. Use XMLHttpRequest to perform the upload and track progress
    const xhr = new XMLHttpRequest();
    xhr.open('POST', 'https://api.cloudinary.com/v1_1/t3dkhv0z/auto/upload', true);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        const percent = Math.round((e.loaded / e.total) * 100);
        updateUIProgressBar(percent);
        if (typeof onProgress === 'function') onProgress(percent);
      }
    };

    xhr.onload = async () => {
      if (xhr.status === 200) {
        try {
          const response = JSON.parse(xhr.responseText);

          // Store metadata in Firestore under strict user ownership
          await db.collection("users").doc(currentUser.uid).collection("files").add({
            fileName:           file.name,
            fileType:           file.type || 'application/octet-stream',
            fileSize:           file.size,
            fileUrl:            response.secure_url,
            cloudinaryPublicId: response.public_id,
            userUid:            currentUser.uid,
            userEmail:          currentUser.email || '',
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

          // Update user's usedStorageBytes in Firestore
          try {
            await updateDoc(doc(db, 'users', currentUser.uid), {
              usedStorageBytes: increment(file.size),
              storageUsed:      increment(file.size),
              updatedAt:        serverTimestamp()
            });
          } catch (qErr) {
            console.warn('[Zulora] Quota increment notice:', qErr.message);
          }

          refreshUserFiles();
          resolve(response);
        } catch (dbErr) {
          console.error("Upload error saving metadata:", dbErr);
          reject(dbErr);
        }
      } else {
        console.error("Upload error:", xhr.responseText);
        alert("Upload failed. Check console for details.");
        reject(new Error(xhr.responseText || 'Upload failed'));
      }
    };

    xhr.onerror = () => {
      console.error("Upload network error");
      alert("Network error during upload. Please check your connection.");
      reject(new Error("Network error during upload"));
    };

    xhr.send(formData);
  });
}

/**
 * Batch upload pipeline with:
 *   - 500 MB per-file limit check (Starter plan)
 *   - Storage quota check before each upload
 *   - Live progress drawer with per-file bars
 */
async function uploadFilesBatch(files) {
  const user = auth.currentUser || getCurrentUser();
  if (!user) { alert('Please sign in first!'); return; }
  if (!uploadDrawer) return;

  uploadDrawer.style.display = 'block';
  uploadDrawer.classList.add('show');
  if (uploadDrawerStatus) {
    uploadDrawerStatus.innerHTML =
      '<i class="fa-solid fa-circle-notch fa-spin text-azure"></i> Uploading to Zulora Drive (Cloudinary)...';
  }
  if (uploadDrawerBody) uploadDrawerBody.innerHTML = '';

  for (const file of files) {
    const limit = Number(profile?.storageLimitBytes || profile?.storageLimit || DEFAULT_STORAGE_BYTES);
    const used  = Number(profile?.usedStorageBytes  || profile?.storageUsed  || 0);

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
    uploadDrawerBody.appendChild(row);

    const bar    = row.querySelector('.upload-item-progress-bar');
    const status = row.querySelector('.upload-status-text');
    currentActiveProgressBar    = bar;
    currentActiveProgressStatus = status;

    try {
      await uploadFileToCloudinary(file, (progress) => {
        updateUIProgressBar(progress);
      });
      if (status) status.innerHTML = '<i class="fa-solid fa-circle-check" style="color:#10b981;"></i> Done';
      if (bar)    bar.style.background = '#10b981';
    } catch (err) {
      console.error('[Zulora Upload] Error:', err);
      if (status) status.innerHTML = '<i class="fa-solid fa-circle-xmark" style="color:#ef4444;"></i> Failed';
      if (bar)    bar.style.background = '#ef4444';
    }
  }

  if (uploadDrawerStatus) {
    uploadDrawerStatus.innerHTML = '<i class="fa-solid fa-check" style="color:#10b981;"></i> Uploads complete';
  }

  refreshUserFiles();
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
      currentNav = item.dataset.nav;
      currentCategory = 'all';
      document.querySelectorAll('.filter-chip').forEach((c) => c.classList.remove('active'));
      document.querySelector('.filter-chip[data-filter="all"]')?.classList.add('active');
      if (currentViewTitle) currentViewTitle.textContent = item.querySelector('span')?.textContent || 'My Drive';
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
    window.location.replace('login.html');
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
adminDashboardBtn?.addEventListener('click', async () => {
  userDropdown?.classList.remove('show');
  adminModal?.classList.add('show');

  try {
    const usersSnap = await getDocs(collection(db, 'users'));
    const users     = usersSnap.docs.map((d) => ({ uid: d.id, ...d.data() }));

    let totalStorage = 0;
    users.forEach((u) => { totalStorage += Number(u.usedStorageBytes || u.storageUsed || 0); });

    if (adminTotalUsers)   adminTotalUsers.textContent   = users.length;
    if (adminTotalFiles)   adminTotalFiles.textContent   = allFiles.length || '—';
    if (adminTotalStorage) adminTotalStorage.textContent = formatBytes(totalStorage);

    if (adminUsersTableBody) {
      adminUsersTableBody.innerHTML = '';
      users.forEach((u) => {
        const tr      = document.createElement('tr');
        const used    = formatBytes(u.usedStorageBytes || u.storageUsed || 0);
        const limitGb = Math.round((u.storageLimitBytes || u.storageLimit || DEFAULT_STORAGE_BYTES) / 1024 ** 3);

        tr.innerHTML = `
          <td style="font-weight:600;">${escHtml(u.email || u.uid)}</td>
          <td>${used}</td>
          <td><strong>${limitGb} GB</strong></td>
          <td>
            <button class="btn btn-azure-soft btn-sm" data-uid="${u.uid}" data-limit="${limitGb}">
              <i class="fa-solid fa-pen"></i> Override Quota
            </button>
          </td>`;

        tr.querySelector('button')?.addEventListener('click', () =>
          promptEditQuota(u.uid, u.email, limitGb)
        );

        adminUsersTableBody.appendChild(tr);
      });
    }
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
