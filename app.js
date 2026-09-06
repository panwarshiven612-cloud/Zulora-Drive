/**
 * Zulora Drive — Primary Application Logic
 * Google Drive + TeraBox Hybrid Cloud Experience
 *
 * Direct Firebase Web SDK v10 (Auth + Firestore + Storage):
 *   • Direct client-side Cloud Storage uploads (users/{uid}/files/)
 *   • Single file limit check (500 MB max for Starter tier)
 *   • TeraBox style segmented Storage Usage Meter & category breakdown
 *   • Google Drive style sidebar navigation & top filter chips
 *   • Direct Firestore metadata sync and quota tracking
 *   • Instant Grid / List view switcher
 *   • Quick preview modal for images, videos, audio, PDFs, and text
 *   • Exact pricing plans: Starter (Free), Storage Lite (₹70), Business Pro (₹140), Ultra Max (₹240)
 *   • UPI Payment confirmation with QR code & "Verify & Activate on WhatsApp"
 *   • Admin console & quota override tools for zulora.help@gmail.com
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
  uploadFileToFirebaseStorage,
  updateUserQuota
} from './auth.js';

import {
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
  increment
} from './firebase-config.js';

// =============================================
// GLOBAL APPLICATION STATE
// =============================================
let allFiles = [];
let filteredFiles = [];
let currentCategory = 'all';
let currentNav = 'my-drive';
let currentViewMode = localStorage.getItem('zulora_view_mode') || 'grid';
let currentSort = 'date-desc';
let selectedFile = null;
let activePlan = null;
let profile = null;

// =============================================
// DOM ELEMENT REFS
// =============================================
const mobileMenuBtn = document.getElementById('mobileMenuBtn');
const appSidebar = document.getElementById('appSidebar');
const globalSearchInput = document.getElementById('globalSearchInput');
const searchClearBtn = document.getElementById('searchClearBtn');

const userAvatarBtn = document.getElementById('userAvatarBtn');
const userInitials = document.getElementById('userInitials');
const userDropdown = document.getElementById('userDropdown');
const dropdownInitials = document.getElementById('dropdownInitials');
const dropdownName = document.getElementById('dropdownName');
const dropdownUsername = document.getElementById('dropdownUsername');
const dropdownEmail = document.getElementById('dropdownEmail');
const dropdownAccountId = document.getElementById('dropdownAccountId');
const dropdownPlanBadge = document.getElementById('dropdownPlanBadge');
const dropdownUpgradeBtn = document.getElementById('dropdownUpgradeBtn');
const openPlansModalBtn = document.getElementById('openPlansModalBtn');
const headerUpgradeBtn = document.getElementById('headerUpgradeBtn');
const sidebarUpgradeBtn = document.getElementById('sidebarUpgradeBtn');
const bannerUpgradeBtn = document.getElementById('bannerUpgradeBtn');
const adminDashboardBtn = document.getElementById('adminDashboardBtn');
const logoutBtn = document.getElementById('logoutBtn');

const newUploadBtn = document.getElementById('newUploadBtn');
const emptyUploadBtn = document.getElementById('emptyUploadBtn');
const fileUploadInput = document.getElementById('fileUploadInput');

const storagePercentText = document.getElementById('storagePercentText');
const storageProgressBar = document.getElementById('storageProgressBar');
const segPhotos = document.getElementById('segPhotos');
const segDocs = document.getElementById('segDocs');
const segMedia = document.getElementById('segMedia');
const segAudio = document.getElementById('segAudio');
const segOther = document.getElementById('segOther');
const storageUsageDetails = document.getElementById('storageUsageDetails');
const quotaWarningBanner = document.getElementById('quotaWarningBanner');
const quotaWarningText = document.getElementById('quotaWarningText');

const mainWorkspace = document.getElementById('mainWorkspace');
const dropzoneOverlay = document.getElementById('dropzoneOverlay');
const currentViewTitle = document.getElementById('currentViewTitle');
const fileCountBadge = document.getElementById('fileCountBadge');
const sortBySelect = document.getElementById('sortBySelect');
const viewGridBtn = document.getElementById('viewGridBtn');
const viewListBtn = document.getElementById('viewListBtn');
const filesGrid = document.getElementById('filesGrid');
const filesListContainer = document.getElementById('filesListContainer');
const filesTableBody = document.getElementById('filesTableBody');
const emptyState = document.getElementById('emptyState');

const uploadDrawer = document.getElementById('uploadDrawer');
const uploadDrawerStatus = document.getElementById('uploadDrawerStatus');
const uploadDrawerBody = document.getElementById('uploadDrawerBody');
const closeUploadDrawerBtn = document.getElementById('closeUploadDrawerBtn');

const plansModal = document.getElementById('plansModal');
const upiModal = document.getElementById('upiModal');
const upiModalPlanTitle = document.getElementById('upiModalPlanTitle');
const upiModalAmountText = document.getElementById('upiModalAmountText');
const upiQrCodeImg = document.getElementById('upiQrCodeImg');
const copyUpiBtn = document.getElementById('copyUpiBtn');
const payUpiDeepLink = document.getElementById('payUpiDeepLink');
const whatsappVerifyBtn = document.getElementById('whatsappVerifyBtn');
const upiConfirmForm = document.getElementById('upiConfirmForm');
const utrInput = document.getElementById('utrInput');

const previewModal = document.getElementById('previewModal');
const previewTitle = document.getElementById('previewTitle');
const previewContainer = document.getElementById('previewContainer');
const previewDownloadBtn = document.getElementById('previewDownloadBtn');

const renameModal = document.getElementById('renameModal');
const renameForm = document.getElementById('renameForm');
const renameInput = document.getElementById('renameInput');

const deleteModal = document.getElementById('deleteModal');
const confirmDeleteBtn = document.getElementById('confirmDeleteBtn');

const referralModal = document.getElementById('referralModal');
const referralLinkInput = document.getElementById('referralLinkInput');
const copyReferralBtn = document.getElementById('copyReferralBtn');
const referralStatsText = document.getElementById('referralStatsText');
const shareReferralWaBtn = document.getElementById('shareReferralWaBtn');

const adminModal = document.getElementById('adminModal');
const adminTotalUsers = document.getElementById('adminTotalUsers');
const adminTotalFiles = document.getElementById('adminTotalFiles');
const adminTotalStorage = document.getElementById('adminTotalStorage');
const adminUsersTableBody = document.getElementById('adminUsersTableBody');

const fileContextMenu = document.getElementById('fileContextMenu');

// =============================================
// FORMATTING HELPERS
// =============================================
function formatBytes(bytes, decimals = 1) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(decimals))} ${sizes[i]}`;
}

function formatDate(iso) {
  if (!iso) return 'Just now';
  const d = new Date(iso);
  return d.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  });
}

function getFileCategory(mime, filename = '') {
  const m = (mime || '').toLowerCase();
  const ext = (filename.split('.').pop() || '').toLowerCase();

  if (m.startsWith('image/') || ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico'].includes(ext)) {
    return 'images';
  }
  if (
    m.includes('pdf') ||
    m.includes('word') ||
    m.includes('officedocument') ||
    m.includes('text/') ||
    ['pdf', 'doc', 'docx', 'txt', 'rtf', 'odt', 'csv', 'xlsx', 'pptx'].includes(ext)
  ) {
    return 'documents';
  }
  if (m.startsWith('video/') || ['mp4', 'mov', 'mkv', 'avi', 'webm'].includes(ext)) {
    return 'videos';
  }
  if (m.startsWith('audio/') || ['mp3', 'wav', 'ogg', 'm4a', 'flac', 'aac'].includes(ext)) {
    return 'audio';
  }
  if (m.includes('zip') || m.includes('compressed') || ['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) {
    return 'archives';
  }
  return 'other';
}

function getFileIconMeta(mime, filename = '') {
  const cat = getFileCategory(mime, filename);
  switch (cat) {
    case 'images':
      return { icon: 'fa-regular fa-file-image', color: '#0ea5e9', label: 'Image' };
    case 'documents':
      return { icon: 'fa-regular fa-file-lines', color: '#38bdf8', label: 'Document' };
    case 'videos':
      return { icon: 'fa-regular fa-file-video', color: '#6366f1', label: 'Video' };
    case 'audio':
      return { icon: 'fa-regular fa-file-audio', color: '#ec4899', label: 'Audio' };
    case 'archives':
      return { icon: 'fa-regular fa-file-zipper', color: '#f59e0b', label: 'Archive' };
    default:
      return { icon: 'fa-regular fa-file', color: '#94a3b8', label: 'File' };
  }
}

// =============================================
// TERABOX STYLE STORAGE USAGE TRACKER
// =============================================
function updateStorageUI(p) {
  if (!p) return;
  profile = p;
  const used = Number(p.usedStorageBytes || p.storageUsed || 0);
  const limit = Number(p.storageLimitBytes || p.storageLimit || DEFAULT_STORAGE_BYTES);
  const percent = Math.min(100, Math.round((used / limit) * 100));

  // Percentage badge
  if (storagePercentText) storagePercentText.textContent = `${percent}%`;

  // Fallback linear bar
  if (storageProgressBar) {
    storageProgressBar.style.width = `${percent}%`;
    if (percent >= 90) {
      storageProgressBar.style.background = '#ef4444';
    } else if (percent >= 75) {
      storageProgressBar.style.background = '#f59e0b';
    } else {
      storageProgressBar.style.background = 'linear-gradient(90deg, #0ea5e9, #38bdf8)';
    }
  }

  // Multi-Category Segmented Calculation (TeraBox visual)
  let photoBytes = 0;
  let docBytes = 0;
  let mediaBytes = 0;
  let audioBytes = 0;
  let otherBytes = 0;

  allFiles.forEach((file) => {
    const sz = Number(file.size || 0);
    const cat = getFileCategory(file.mimetype || file.type, file.name);
    if (cat === 'images') photoBytes += sz;
    else if (cat === 'documents') docBytes += sz;
    else if (cat === 'videos') mediaBytes += sz;
    else if (cat === 'audio') audioBytes += sz;
    else otherBytes += sz;
  });

  const photoPct = limit > 0 ? ((photoBytes / limit) * 100).toFixed(1) : 0;
  const docPct = limit > 0 ? ((docBytes / limit) * 100).toFixed(1) : 0;
  const mediaPct = limit > 0 ? ((mediaBytes / limit) * 100).toFixed(1) : 0;
  const audioPct = limit > 0 ? ((audioBytes / limit) * 100).toFixed(1) : 0;
  const otherPct = limit > 0 ? ((otherBytes / limit) * 100).toFixed(1) : 0;

  if (segPhotos) segPhotos.style.width = `${photoPct}%`;
  if (segDocs) segDocs.style.width = `${docPct}%`;
  if (segMedia) segMedia.style.width = `${mediaPct}%`;
  if (segAudio) segAudio.style.width = `${audioPct}%`;
  if (segOther) segOther.style.width = `${otherPct}%`;

  // Quota Warning Banner
  if (percent >= 90) {
    if (quotaWarningBanner) {
      quotaWarningBanner.className = 'storage-banner danger';
      if (quotaWarningText) quotaWarningText.textContent = `Critical: ${percent}% of your allocated cloud space is full. Upgrade now.`;
      quotaWarningBanner.style.display = 'flex';
    }
  } else if (percent >= 75) {
    if (quotaWarningBanner) {
      quotaWarningBanner.className = 'storage-banner warning';
      if (quotaWarningText) quotaWarningText.textContent = `Notice: You have used ${percent}% of your cloud storage.`;
      quotaWarningBanner.style.display = 'flex';
    }
  } else {
    if (quotaWarningBanner) quotaWarningBanner.style.display = 'none';
  }

  if (storageUsageDetails) {
    storageUsageDetails.innerHTML = `<b>${formatBytes(used)}</b> of ${formatBytes(limit, 0)} used`;
  }

  const isUserAdmin = isAdmin(p);
  const tierName = isUserAdmin ? 'Admin' : (p.planType || (limit > 5 * 1024 ** 3 ? 'Pro' : 'Starter'));
  if (dropdownPlanBadge) {
    dropdownPlanBadge.textContent = `${tierName} · ${formatBytes(limit, 0)}`;
    if (isUserAdmin) dropdownPlanBadge.classList.add('admin');
  }
}

// =============================================
// USER IDENTITY UI
// =============================================
function setupUserUI(user, prof) {
  const email = prof?.email || user?.email || '';
  const emailPrefix = email.split('@')[0] || 'user';
  const displayName = prof?.displayName || user?.displayName || emailPrefix;
  const username = prof?.username || deriveUsername(user);
  const accountId = prof?.accountId || deriveAccountId(user);
  const initial = (displayName.charAt(0) || email.charAt(0) || 'Z').toUpperCase();

  // Avatar button
  if (user?.photoURL) {
    if (userAvatarBtn) {
      userAvatarBtn.innerHTML = `<img src="${user.photoURL}" alt="${displayName}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
    }
  } else {
    if (userInitials) userInitials.textContent = initial;
  }

  // Dropdown header elements
  if (dropdownInitials) dropdownInitials.textContent = initial;
  if (dropdownName) dropdownName.textContent = displayName;
  if (dropdownUsername) dropdownUsername.textContent = username;
  if (dropdownEmail) dropdownEmail.textContent = email;
  if (dropdownAccountId) dropdownAccountId.textContent = `Account: ${accountId}`;

  // Admin badge & Console link
  if (isAdmin(prof) || email.toLowerCase() === ADMIN_EMAIL) {
    if (adminDashboardBtn) adminDashboardBtn.style.display = 'flex';
  } else {
    if (adminDashboardBtn) adminDashboardBtn.style.display = 'none';
  }
}

// =============================================
// AUTH ATTACHMENT DIRECTLY ON WINDOW LOAD
// =============================================
function initAuthLifecycle() {
  onAuthChange(async (user) => {
    if (!user) {
      window.location.replace('login.html');
      return;
    }

    setupUserUI(user, {
      email: user.email,
      displayName: user.displayName || user.email.split('@')[0],
      username: deriveUsername(user),
      accountId: deriveAccountId(user)
    });

    try {
      profile = await bootstrapUser();
    } catch (err) {
      console.warn('[Zulora App] bootstrapUser notice:', err.message);
      profile = {
        uid: user.uid,
        email: user.email,
        displayName: user.displayName || user.email.split('@')[0] || 'User',
        username: deriveUsername(user),
        accountId: deriveAccountId(user),
        photoURL: user.photoURL || '',
        storageLimitBytes: DEFAULT_STORAGE_BYTES,
        usedStorageBytes: 0,
        planType: 'Starter',
        tier: 'free',
        isAdmin: (user.email || '').toLowerCase() === ADMIN_EMAIL
      };
    }

    setupUserUI(user, profile);
    updateStorageUI(profile);
    await loadUserFiles(user.uid);
  });
}

if (document.readyState === 'complete') {
  initAuthLifecycle();
} else {
  window.addEventListener('load', initAuthLifecycle);
}

// Background storage refresher
setInterval(async () => {
  try {
    const refreshed = await refreshProfile();
    if (refreshed) updateStorageUI(refreshed);
  } catch (_) {}
}, 45000);

// =============================================
// FIRESTORE FILES DATA LOADER
// =============================================
async function loadUserFiles(uid) {
  if (!uid) return;
  try {
    const filesSnap = await getDocs(collection(db, 'users', uid, 'files'));
    allFiles = [];
    filesSnap.forEach((docSnap) => {
      const d = docSnap.data();
      let iso = new Date().toISOString();
      if (d.uploadedAt?.toDate) iso = d.uploadedAt.toDate().toISOString();
      else if (typeof d.uploadedAt === 'string') iso = d.uploadedAt;

      allFiles.push({
        id: docSnap.id,
        name: d.name || d.originalName || 'Untitled File',
        originalName: d.originalName || d.name || 'Untitled File',
        size: Number(d.size || 0),
        type: d.type || d.mimetype || 'application/octet-stream',
        mimetype: d.mimetype || d.type || 'application/octet-stream',
        url: d.url || '',
        storagePath: d.storagePath || '',
        isStarred: Boolean(d.isStarred),
        isTrash: Boolean(d.isTrash),
        uploadedAt: iso
      });
    });

    applyFiltersAndRender();
    if (profile) updateStorageUI(profile);
  } catch (err) {
    console.error('[Zulora Files] loadUserFiles notice:', err.message);
  }
}

// =============================================
// FILTERING, SORTING & RENDERING
// =============================================
function applyFiltersAndRender() {
  const query = (globalSearchInput?.value || '').trim().toLowerCase();

  filteredFiles = allFiles.filter((file) => {
    // Trash filter
    if (currentNav === 'trash') {
      if (!file.isTrash) return false;
    } else {
      if (file.isTrash) return false;
    }

    // Navigation filters
    if (currentNav === 'starred' && !file.isStarred) return false;

    // Category filter
    if (currentCategory !== 'all') {
      const cat = getFileCategory(file.mimetype || file.type, file.name);
      if (cat !== currentCategory) return false;
    }

    // Search query filter
    if (query) {
      const matchName = (file.name || '').toLowerCase().includes(query);
      const matchType = (file.type || '').toLowerCase().includes(query);
      if (!matchName && !matchType) return false;
    }

    return true;
  });

  // Sorting
  filteredFiles.sort((a, b) => {
    switch (currentSort) {
      case 'date-asc':
        return new Date(a.uploadedAt) - new Date(b.uploadedAt);
      case 'name-asc':
        return (a.name || '').localeCompare(b.name || '');
      case 'name-desc':
        return (b.name || '').localeCompare(a.name || '');
      case 'size-desc':
        return (b.size || 0) - (a.size || 0);
      case 'size-asc':
        return (a.size || 0) - (b.size || 0);
      case 'date-desc':
      default:
        return new Date(b.uploadedAt) - new Date(a.uploadedAt);
    }
  });

  // Update counter
  if (fileCountBadge) fileCountBadge.textContent = `${filteredFiles.length} file${filteredFiles.length === 1 ? '' : 's'}`;

  renderFilesView();
}

function renderFilesView() {
  const hasFiles = filteredFiles.length > 0;

  if (emptyState) emptyState.style.display = hasFiles ? 'none' : 'flex';
  if (filesGrid) filesGrid.style.display = hasFiles && currentViewMode === 'grid' ? 'grid' : 'none';
  if (filesListContainer) filesListContainer.style.display = hasFiles && currentViewMode === 'list' ? 'block' : 'none';

  if (!hasFiles) {
    if (filesGrid) filesGrid.innerHTML = '';
    if (filesTableBody) filesTableBody.innerHTML = '';
    return;
  }

  if (currentViewMode === 'grid') {
    renderGridView();
  } else {
    renderListView();
  }
}

// Render TeraBox Style Grid Cards
function renderGridView() {
  if (!filesGrid) return;
  filesGrid.innerHTML = '';

  filteredFiles.forEach((file) => {
    const meta = getFileIconMeta(file.mimetype || file.type, file.name);
    const isImg = getFileCategory(file.mimetype || file.type, file.name) === 'images';

    const card = document.createElement('div');
    card.className = 'file-card';
    card.dataset.fileId = file.id;

    card.innerHTML = `
      <div class="file-card-preview-box">
        ${
          isImg && file.url
            ? `<img src="${file.url}" alt="${file.name}" class="file-card-thumb" loading="lazy">`
            : `<i class="${meta.icon} file-card-icon-large" style="color: ${meta.color};"></i>`
        }
      </div>
      <div class="file-card-actions">
        <span class="file-card-type-tag">${meta.label}</span>
        <div class="file-card-buttons">
          <button class="star-btn ${file.isStarred ? 'starred' : ''}" data-action="toggle-star" title="${file.isStarred ? 'Unstar' : 'Star'}">
            <i class="${file.isStarred ? 'fa-solid' : 'fa-regular'} fa-star"></i>
          </button>
          <button class="menu-btn" data-action="open-menu" title="More options">
            <i class="fa-solid fa-ellipsis-vertical"></i>
          </button>
        </div>
      </div>
      <div class="file-card-info">
        <div class="file-card-title" title="${file.name}">${file.name}</div>
        <div class="file-card-meta">
          <span>${formatBytes(file.size)}</span>
          <span>${formatDate(file.uploadedAt)}</span>
        </div>
      </div>
    `;

    // Click to preview
    card.addEventListener('click', (e) => {
      if (e.target.closest('button')) return;
      openPreviewModal(file);
    });

    // Star button
    const starBtn = card.querySelector('[data-action="toggle-star"]');
    starBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleStar(file);
    });

    // Context menu trigger
    const menuBtn = card.querySelector('[data-action="open-menu"]');
    menuBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      showContextMenu(e, file);
    });

    filesGrid.appendChild(card);
  });
}

// Render Google Drive Style List Table
function renderListView() {
  if (!filesTableBody) return;
  filesTableBody.innerHTML = '';

  filteredFiles.forEach((file) => {
    const meta = getFileIconMeta(file.mimetype || file.type, file.name);
    const tr = document.createElement('tr');
    tr.dataset.fileId = file.id;

    tr.innerHTML = `
      <td>
        <div class="table-name-cell">
          <i class="${meta.icon} table-file-icon" style="color: ${meta.color};"></i>
          <span title="${file.name}">${file.name}</span>
        </div>
      </td>
      <td>${formatBytes(file.size)}</td>
      <td>${formatDate(file.uploadedAt)}</td>
      <td>
        <div class="table-actions">
          <button class="star-btn ${file.isStarred ? 'starred' : ''}" data-action="toggle-star" title="Star">
            <i class="${file.isStarred ? 'fa-solid' : 'fa-regular'} fa-star"></i>
          </button>
          <button class="btn-icon" data-action="preview" title="Preview">
            <i class="fa-regular fa-eye"></i>
          </button>
          <button class="btn-icon" data-action="download" title="Download">
            <i class="fa-solid fa-download"></i>
          </button>
          <button class="menu-btn" data-action="open-menu" title="More options">
            <i class="fa-solid fa-ellipsis-vertical"></i>
          </button>
        </div>
      </td>
    `;

    tr.addEventListener('click', (e) => {
      if (e.target.closest('button')) return;
      openPreviewModal(file);
    });

    tr.querySelector('[data-action="toggle-star"]')?.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleStar(file);
    });

    tr.querySelector('[data-action="preview"]')?.addEventListener('click', (e) => {
      e.stopPropagation();
      openPreviewModal(file);
    });

    tr.querySelector('[data-action="download"]')?.addEventListener('click', (e) => {
      e.stopPropagation();
      downloadFile(file);
    });

    tr.querySelector('[data-action="open-menu"]')?.addEventListener('click', (e) => {
      e.stopPropagation();
      showContextMenu(e, file);
    });

    filesTableBody.appendChild(tr);
  });
}

// =============================================
// FILE ACTIONS (Preview, Download, Star, Rename, Delete)
// =============================================
function openPreviewModal(file) {
  selectedFile = file;
  const name = file.originalName || file.name || 'File Preview';
  const url = file.url;

  if (previewTitle) previewTitle.textContent = name;
  if (previewDownloadBtn) {
    previewDownloadBtn.href = url;
    previewDownloadBtn.download = name;
  }
  if (previewContainer) {
    previewContainer.innerHTML = '<div style="color:var(--text-muted);"><i class="fa-solid fa-circle-notch fa-spin"></i> Loading file preview...</div>';
  }
  if (previewModal) previewModal.classList.add('show');

  const cat = getFileCategory(file.mimetype || file.type, name);

  if (cat === 'images') {
    previewContainer.innerHTML = `<img src="${url}" alt="${name}" style="max-width:100%;max-height:55vh;object-fit:contain;border-radius:8px;">`;
  } else if (cat === 'videos') {
    previewContainer.innerHTML = `<video controls autoplay style="max-width:100%;max-height:55vh;border-radius:8px;"><source src="${url}" type="${file.mimetype || 'video/mp4'}">Preview not supported.</video>`;
  } else if (cat === 'audio') {
    previewContainer.innerHTML = `<audio controls autoplay style="width:85%;"><source src="${url}" type="${file.mimetype || 'audio/mpeg'}">Audio preview not supported.</audio>`;
  } else if (name.endsWith('.pdf') || (file.mimetype || '').includes('pdf')) {
    previewContainer.innerHTML = `<iframe src="${url}" style="width:100%;height:55vh;border:none;border-radius:8px;"></iframe>`;
  } else {
    fetch(url)
      .then((r) => (r.headers.get('content-type')?.includes('text') ? r.text() : null))
      .then((text) => {
        if (typeof text === 'string') {
          previewContainer.innerHTML = `<pre style="width:100%;height:50vh;overflow:auto;padding:14px;background:#ffffff;border:1px solid var(--border-soft);border-radius:8px;font-family:var(--font-mono);font-size:0.85rem;text-align:left;">${text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>`;
        } else {
          const m = getFileIconMeta(file.mimetype || file.type, name);
          previewContainer.innerHTML = `
            <div style="display:flex;flex-direction:column;align-items:center;gap:12px;">
              <i class="${m.icon}" style="font-size:4.5rem;color:${m.color}"></i>
              <div style="font-weight:700;font-size:1rem;">${name}</div>
              <div style="font-size:0.85rem;color:var(--text-muted);">${formatBytes(file.size)}</div>
            </div>`;
        }
      })
      .catch(() => {
        previewContainer.innerHTML = '<div>Preview unavailable for this format. Please download to view.</div>';
      });
  }
}

function downloadFile(file) {
  if (!file?.url) return;
  const a = document.createElement('a');
  a.href = file.url;
  a.download = file.name || 'download';
  a.target = '_blank';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

async function toggleStar(file) {
  const user = getCurrentUser();
  if (!user || !file) return;
  const newStarred = !file.isStarred;
  file.isStarred = newStarred;
  applyFiltersAndRender();

  try {
    await updateDoc(doc(db, 'users', user.uid, 'files', file.id), {
      isStarred: newStarred,
      updatedAt: serverTimestamp()
    });
  } catch (err) {
    console.warn('[Zulora] toggleStar notice:', err.message);
  }
}

function openRenameModal(file) {
  selectedFile = file;
  const name = file.originalName || file.name || '';
  if (renameInput) renameInput.value = name;
  if (renameModal) {
    renameModal.classList.add('show');
    renameInput?.focus();
  }
}

if (renameForm) {
  renameForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!selectedFile) return;
    const newName = renameInput?.value.trim();
    if (!newName) return;
    const user = getCurrentUser();

    try {
      if (user) {
        await updateDoc(doc(db, 'users', user.uid, 'files', selectedFile.id), {
          name: newName,
          originalName: newName,
          updatedAt: serverTimestamp()
        });
      }
      renameModal?.classList.remove('show');
      await loadUserFiles(user?.uid);
    } catch (err) {
      alert(err.message || 'Failed to rename file.');
    }
  });
}

function openDeleteModal(file) {
  selectedFile = file;
  const name = file.originalName || file.name || 'this file';
  const prompt = document.getElementById('deletePromptText');
  if (prompt) {
    prompt.textContent = `Delete "${name}" permanently? This cannot be undone and your storage quota will be reclaimed immediately.`;
  }
  if (deleteModal) deleteModal.classList.add('show');
}

if (confirmDeleteBtn) {
  confirmDeleteBtn.addEventListener('click', async () => {
    if (!selectedFile) return;
    confirmDeleteBtn.disabled = true;
    confirmDeleteBtn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Deleting...';
    const user = getCurrentUser();

    try {
      // 1. Delete from Cloud Storage
      if (selectedFile.storagePath) {
        try {
          await deleteObject(storageRef(storage, selectedFile.storagePath));
        } catch (storErr) {
          console.warn('[Zulora Storage] Delete object notice:', storErr.message);
        }
      }

      // 2. Delete from Firestore users/{uid}/files/{fileId}
      if (user) {
        await deleteDoc(doc(db, 'users', user.uid, 'files', selectedFile.id));
        await updateDoc(doc(db, 'users', user.uid), {
          usedStorageBytes: increment(-Number(selectedFile.size || 0)),
          storageUsed: increment(-Number(selectedFile.size || 0)),
          updatedAt: serverTimestamp()
        }).catch(() => {});
      }

      deleteModal?.classList.remove('show');
      const updated = await refreshProfile().catch(() => null);
      if (updated) updateStorageUI(updated);
      await loadUserFiles(user?.uid);
    } catch (err) {
      alert(err.message || 'Failed to delete file.');
    } finally {
      confirmDeleteBtn.disabled = false;
      confirmDeleteBtn.innerHTML = 'Delete File';
    }
  });
}

// Context Menu Control
function showContextMenu(e, file) {
  selectedFile = file;
  if (!fileContextMenu) return;
  const rect = e.target.getBoundingClientRect();
  fileContextMenu.style.top = `${rect.bottom + window.scrollY + 4}px`;
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

if (fileContextMenu) {
  fileContextMenu.addEventListener('click', (e) => {
    const item = e.target.closest('.context-item');
    if (!item || !selectedFile) return;
    fileContextMenu.classList.remove('show');
    const action = item.dataset.action;
    if (action === 'preview') openPreviewModal(selectedFile);
    if (action === 'download') downloadFile(selectedFile);
    if (action === 'rename') openRenameModal(selectedFile);
    if (action === 'star') toggleStar(selectedFile);
    if (action === 'delete') openDeleteModal(selectedFile);
  });
}

// =============================================
// DIRECT CLIENT-SIDE FIREBASE STORAGE UPLOADS
// =============================================
if (newUploadBtn) newUploadBtn.addEventListener('click', () => fileUploadInput?.click());
if (emptyUploadBtn) emptyUploadBtn.addEventListener('click', () => fileUploadInput?.click());

if (fileUploadInput) {
  fileUploadInput.addEventListener('change', (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) uploadFilesBatch(files);
    fileUploadInput.value = '';
  });
}

// Fullscreen Workspace Drag & Drop
let dragCounter = 0;
if (mainWorkspace) {
  ['dragenter', 'dragover', 'dragleave', 'drop'].forEach((event) => {
    mainWorkspace.addEventListener(event, (e) => {
      e.preventDefault();
      e.stopPropagation();
    });
  });

  mainWorkspace.addEventListener('dragenter', () => {
    dragCounter++;
    dropzoneOverlay?.classList.add('active');
  });

  mainWorkspace.addEventListener('dragleave', () => {
    if (--dragCounter <= 0) {
      dragCounter = 0;
      dropzoneOverlay?.classList.remove('active');
    }
  });

  mainWorkspace.addEventListener('drop', (e) => {
    dragCounter = 0;
    dropzoneOverlay?.classList.remove('active');
    const files = Array.from(e.dataTransfer?.files || []);
    if (files.length > 0) uploadFilesBatch(files);
  });
}

/**
 * Direct Client-Side Storage Upload Pipeline
 * Checks 500 MB single file limit for Starter users
 */
async function uploadFilesBatch(files) {
  const user = getCurrentUser();
  if (!user) {
    alert('Please sign in first!');
    return;
  }

  if (!uploadDrawer) return;
  uploadDrawer.style.display = 'block';
  uploadDrawer.classList.add('show');
  if (uploadDrawerStatus) {
    uploadDrawerStatus.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin text-azure"></i> Uploading to Firebase Storage...';
  }
  if (uploadDrawerBody) uploadDrawerBody.innerHTML = '';

  for (const file of files) {
    const limit = Number(profile?.storageLimitBytes || profile?.storageLimit || DEFAULT_STORAGE_BYTES);
    const used = Number(profile?.usedStorageBytes || profile?.storageUsed || 0);

    // Check single file size limit for Free Starter plan (500 MB max)
    if (limit <= DEFAULT_STORAGE_BYTES && file.size > MAX_STARTER_FILE_BYTES) {
      alert(`Single file limit exceeded: Free Starter plan allows maximum 500 MB per file. "${file.name}" is ${formatBytes(file.size)}. Please upgrade to Storage Lite or Business Pro for unlimited file sizes.`);
      openPlansModal();
      continue;
    }

    // Check storage quota client-side
    if (used + file.size > limit) {
      alert(`Storage quota exceeded: "${file.name}" requires ${formatBytes(file.size)}, but your drive has only ${formatBytes(Math.max(0, limit - used))} remaining. Upgrade your plan to continue.`);
      openPlansModal();
      continue;
    }

    const row = document.createElement('div');
    row.className = 'upload-item-row';
    row.innerHTML = `
      <div class="upload-item-info">
        <span class="upload-item-name" title="${file.name}">${file.name}</span>
        <span class="upload-status-text" style="font-size:0.78rem;font-weight:600;color:var(--azure-primary);">0%</span>
      </div>
      <div class="upload-item-progress-track">
        <div class="upload-item-progress-bar"></div>
      </div>`;
    uploadDrawerBody.appendChild(row);

    const bar = row.querySelector('.upload-item-progress-bar');
    const status = row.querySelector('.upload-status-text');

    try {
      await uploadFileToFirebaseStorage(file, (progress) => {
        if (bar) bar.style.width = `${progress}%`;
        if (status) status.textContent = `${progress}%`;
      });

      if (status) status.innerHTML = '<i class="fa-solid fa-circle-check" style="color:#10b981;"></i> Done';
      if (bar) bar.style.background = '#10b981';
    } catch (err) {
      console.error('Upload failure:', err);
      if (status) status.innerHTML = '<i class="fa-solid fa-circle-xmark" style="color:#ef4444;"></i> Failed';
      if (bar) bar.style.background = '#ef4444';
      alert(`Failed to upload "${file.name}": ${err.message}`);
    }
  }

  if (uploadDrawerStatus) {
    uploadDrawerStatus.innerHTML = '<i class="fa-solid fa-check" style="color:#10b981;"></i> Uploads finished';
  }

  try {
    const updated = await refreshProfile();
    updateStorageUI(updated);
  } catch (_) {}
  await loadUserFiles(user.uid);
}

if (closeUploadDrawerBtn) {
  closeUploadDrawerBtn.addEventListener('click', () => {
    uploadDrawer?.classList.remove('show');
    setTimeout(() => { if (uploadDrawer) uploadDrawer.style.display = 'none'; }, 200);
  });
}

// =============================================
// SEARCH, FILTER CHIPS, SORT & VIEW SWITCHER
// =============================================
if (globalSearchInput) {
  globalSearchInput.addEventListener('input', () => {
    if (searchClearBtn) searchClearBtn.style.display = globalSearchInput.value ? 'block' : 'none';
    applyFiltersAndRender();
  });
}

if (searchClearBtn) {
  searchClearBtn.addEventListener('click', () => {
    globalSearchInput.value = '';
    searchClearBtn.style.display = 'none';
    applyFiltersAndRender();
    globalSearchInput.focus();
  });
}

// Google Drive Filter Chips
document.querySelectorAll('.filter-chip').forEach((chip) => {
  chip.addEventListener('click', () => {
    document.querySelectorAll('.filter-chip').forEach((c) => c.classList.remove('active'));
    chip.classList.add('active');
    currentCategory = chip.dataset.filter;
    applyFiltersAndRender();
  });
});

// Sidebar Navigation Items
document.querySelectorAll('.sidebar-nav .nav-item').forEach((item) => {
  item.addEventListener('click', () => {
    if (item.hasAttribute('data-open-referral')) return;
    document.querySelectorAll('.sidebar-nav .nav-item').forEach((i) => i.classList.remove('active'));
    item.classList.add('active');

    if (item.dataset.nav) {
      currentNav = item.dataset.nav;
      currentCategory = 'all';
      // Sync filter chip
      document.querySelectorAll('.filter-chip').forEach((c) => c.classList.remove('active'));
      document.querySelector('.filter-chip[data-filter="all"]')?.classList.add('active');
      if (currentViewTitle) {
        currentViewTitle.textContent = item.querySelector('span')?.textContent || 'My Drive';
      }
    } else if (item.dataset.category) {
      currentNav = 'my-drive';
      currentCategory = item.dataset.category;
      // Sync filter chip
      document.querySelectorAll('.filter-chip').forEach((c) => c.classList.remove('active'));
      document.querySelector(`.filter-chip[data-filter="${currentCategory}"]`)?.classList.add('active');
      if (currentViewTitle) {
        currentViewTitle.textContent = item.querySelector('span')?.textContent || 'My Drive';
      }
    }

    applyFiltersAndRender();

    // Close mobile sidebar if open
    if (window.innerWidth <= 900) {
      appSidebar?.classList.remove('open');
    }
  });
});

// Sort Selector
if (sortBySelect) {
  sortBySelect.addEventListener('change', () => {
    currentSort = sortBySelect.value;
    applyFiltersAndRender();
  });
}

// View Toggle Switcher (Grid vs List)
function setViewMode(mode) {
  currentViewMode = mode;
  localStorage.setItem('zulora_view_mode', mode);

  if (mode === 'grid') {
    viewGridBtn?.classList.add('active');
    viewListBtn?.classList.remove('active');
  } else {
    viewListBtn?.classList.add('active');
    viewGridBtn?.classList.remove('active');
  }

  renderFilesView();
}

if (viewGridBtn) viewGridBtn.addEventListener('click', () => setViewMode('grid'));
if (viewListBtn) viewListBtn.addEventListener('click', () => setViewMode('list'));

// Set initial view state
setViewMode(currentViewMode);

// Mobile Sidebar Hamburger Toggle
if (mobileMenuBtn) {
  mobileMenuBtn.addEventListener('click', () => {
    appSidebar?.classList.toggle('open');
  });
}

// User Avatar Dropdown
if (userAvatarBtn) {
  userAvatarBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    userDropdown?.classList.toggle('show');
  });
}

// Sign Out
if (logoutBtn) {
  logoutBtn.addEventListener('click', async () => {
    try {
      await logOut();
      window.location.replace('login.html');
    } catch (err) {
      alert(err.message || 'Logout failed.');
    }
  });
}

// =============================================
// STORAGE PLANS & UPI PAYMENT FLOW
// =============================================
function openPlansModal() {
  plansModal?.classList.add('show');
}

[openPlansModalBtn, headerUpgradeBtn, sidebarUpgradeBtn, bannerUpgradeBtn, dropdownUpgradeBtn].forEach((btn) => {
  if (btn) btn.addEventListener('click', openPlansModal);
});

// Select Plan Buttons in Pricing Modal
document.querySelectorAll('.select-plan-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    const planKey = btn.dataset.plan;
    const planName = btn.dataset.name;
    const amount = btn.dataset.amount;
    openUpiPayment(planKey, planName, amount);
  });
});

function openUpiPayment(planKey, planName, amount) {
  activePlan = { key: planKey, name: planName, amount };
  plansModal?.classList.remove('show');

  if (upiModalPlanTitle) upiModalPlanTitle.textContent = `Upgrade to ${planName}`;
  if (upiModalAmountText) upiModalAmountText.textContent = `Pay: ₹${amount} / month`;

  const upiUrl = `upi://pay?pa=${SUPPORT_UPI_ID}&pn=Zulora%20Drive&am=${amount}&cu=INR&tn=Zulora%20Drive%20${encodeURIComponent(planName)}`;
  if (payUpiDeepLink) payUpiDeepLink.href = upiUrl;
  if (upiQrCodeImg) {
    upiQrCodeImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(upiUrl)}`;
  }

  // Exact WhatsApp Link specified:
  // https://wa.me/916395211325?text=Hello%20Zulora%20Support,%20I%20have%20paid%20for%20[PlanName]%20via%20UPI.
  if (whatsappVerifyBtn) {
    const waText = `Hello Zulora Support, I have paid for ${planName} via UPI.`;
    whatsappVerifyBtn.href = `https://wa.me/916395211325?text=${encodeURIComponent(waText)}`;
  }

  if (utrInput) utrInput.value = '';
  upiModal?.classList.add('show');
}

// Copy UPI ID
if (copyUpiBtn) {
  copyUpiBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(SUPPORT_UPI_ID);
    copyUpiBtn.innerHTML = '<i class="fa-solid fa-check"></i> Copied!';
    setTimeout(() => {
      copyUpiBtn.innerHTML = '<i class="fa-regular fa-copy"></i> Copy UPI ID';
    }, 2000);
  });
}

// UTR Form Submission
if (upiConfirmForm) {
  upiConfirmForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const utr = utrInput?.value.trim();
    const user = getCurrentUser();
    if (!utr || !activePlan || !user) return;

    const submitBtn = document.getElementById('submitUtrBtn');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Submitting...';
    }

    try {
      await addDoc(collection(db, 'upgradeRequests'), {
        userUid: user.uid,
        email: user.email,
        accountId: profile?.accountId || deriveAccountId(user),
        plan: activePlan.key,
        planLabel: activePlan.name,
        amount: Number(activePlan.amount),
        paymentReference: utr,
        upiId: SUPPORT_UPI_ID,
        status: 'pending',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      upiModal?.classList.remove('show');
      alert(`Payment reference for ${activePlan.name} (UTR: ${utr}) submitted successfully. Your quota will be verified and upgraded shortly.`);
    } catch (err) {
      alert(err.message || 'Submission failed. Please try again.');
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i class="fa-solid fa-check"></i> Submit Verification Request';
      }
    }
  });
}

// =============================================
// REFERRAL & BONUS STORAGE MODAL
// =============================================
document.querySelectorAll('[data-open-referral]').forEach((btn) => {
  btn.addEventListener('click', () => {
    userDropdown?.classList.remove('show');
    const user = getCurrentUser();
    const link = getReferralLink(user);

    if (referralLinkInput) referralLinkInput.value = link;

    if (shareReferralWaBtn) {
      const waMsg = `Hey! Join me on Zulora Drive for secure cloud storage and get 5 GB free storage: ${link}`;
      shareReferralWaBtn.href = `https://wa.me/?text=${encodeURIComponent(waMsg)}`;
    }

    if (referralStatsText) {
      const bonus = formatBytes(profile?.referralBonusBytes || 0);
      const count = profile?.totalReferrals || 0;
      referralStatsText.textContent = `You have earned ${bonus} bonus storage across ${count} referral${count === 1 ? '' : 's'}.`;
    }

    referralModal?.classList.add('show');
  });
});

if (copyReferralBtn) {
  copyReferralBtn.addEventListener('click', () => {
    const link = referralLinkInput?.value;
    if (!link) return;
    navigator.clipboard.writeText(link);
    copyReferralBtn.innerHTML = '<i class="fa-solid fa-check"></i> Copied!';
    setTimeout(() => {
      copyReferralBtn.innerHTML = '<i class="fa-regular fa-copy"></i> Copy Link';
    }, 2000);
  });
}

// =============================================
// ADMIN CONSOLE & QUOTA OVERRIDE (zulora.help@gmail.com)
// =============================================
if (adminDashboardBtn) {
  adminDashboardBtn.addEventListener('click', async () => {
    userDropdown?.classList.remove('show');
    adminModal?.classList.add('show');

    try {
      const usersSnap = await getDocs(collection(db, 'users'));
      const users = usersSnap.docs.map((d) => ({ uid: d.id, ...d.data() }));

      let totalStorage = 0;
      let totalFileCount = 0;

      users.forEach((u) => {
        totalStorage += Number(u.usedStorageBytes || u.storageUsed || 0);
      });

      if (adminTotalUsers) adminTotalUsers.textContent = users.length;
      if (adminTotalFiles) adminTotalFiles.textContent = allFiles.length || '—';
      if (adminTotalStorage) adminTotalStorage.textContent = formatBytes(totalStorage);

      if (adminUsersTableBody) {
        adminUsersTableBody.innerHTML = '';
        users.forEach((u) => {
          const tr = document.createElement('tr');
          const used = formatBytes(u.usedStorageBytes || u.storageUsed || 0);
          const limitGb = Math.round((u.storageLimitBytes || u.storageLimit || DEFAULT_STORAGE_BYTES) / (1024 ** 3));

          tr.innerHTML = `
            <td style="font-weight:600;">${u.email || u.uid}</td>
            <td>${used}</td>
            <td><strong>${limitGb} GB</strong></td>
            <td>
              <button class="btn btn-azure-soft btn-sm" data-uid="${u.uid}" data-email="${u.email}" data-limit="${limitGb}">
                <i class="fa-solid fa-pen"></i> Override Quota
              </button>
            </td>
          `;

          tr.querySelector('button')?.addEventListener('click', () => {
            promptEditQuota(u.uid, u.email, limitGb);
          });

          adminUsersTableBody.appendChild(tr);
        });
      }
    } catch (err) {
      alert('Admin data load notice: ' + err.message);
    }
  });
}

async function promptEditQuota(uid, email, currentGb) {
  const input = prompt(`Set custom storage quota (in GB) for ${email}:`, currentGb);
  if (!input) return;
  const newGb = parseInt(input, 10);
  if (isNaN(newGb) || newGb < 1 || newGb > 50000) {
    alert('Please enter a valid number between 1 and 50,000 GB.');
    return;
  }

  try {
    const newLimitBytes = Math.floor(newGb * 1024 ** 3);
    await updateUserQuota(uid, newLimitBytes);
    alert(`Storage quota for ${email} successfully overridden to ${newGb} GB!`);
    if (adminDashboardBtn) adminDashboardBtn.click();
    const updated = await refreshProfile().catch(() => null);
    if (updated) updateStorageUI(updated);
  } catch (err) {
    alert(err.message || 'Quota override update failed.');
  }
}

// =============================================
// MODAL CLOSE CONTROLS
// =============================================
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
