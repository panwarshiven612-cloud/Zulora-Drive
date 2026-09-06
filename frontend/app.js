/**
 * Zulora Drive — Primary Application Logic (Google Drive & OneDrive Style)
 *
 * Implements:
 *   • Realtime auth binding directly on window load — zero placeholder flashes
 *   • Drive usage monitoring with live progress bar & quota warnings
 *   • File listing (grid/list), filters, sort, search
 *   • Direct multipart upload stream to /api/upload with XHR progress bars
 *   • File actions: Preview, Download, Star, Rename, Delete
 *   • Monthly storage plans & UPI payment modal
 *   • Automated Referral & Dynamic Storage Reward System modal
 *   • Admin console with live quota editing
 */

import {
  onAuthChange,
  logOut,
  api,
  bootstrapUser,
  refreshProfile,
  getCurrentUser,
  isAdmin,
  ADMIN_EMAIL,
  SUPPORT_PHONE,
  SUPPORT_WHATSAPP,
  SUPPORT_EMAIL,
  SUPPORT_UPI_ID,
  deriveUsername,
  deriveAccountId,
  getReferralLink,
  getIdToken,
  getReferrerUidFromUrl
} from './auth.js';

// =============================================
// GLOBAL STATE
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
const sidebarUpgradeBtn = document.getElementById('sidebarUpgradeBtn');
const bannerUpgradeBtn = document.getElementById('bannerUpgradeBtn');
const adminDashboardBtn = document.getElementById('adminDashboardBtn');
const logoutBtn = document.getElementById('logoutBtn');
const newUploadBtn = document.getElementById('newUploadBtn');
const emptyUploadBtn = document.getElementById('emptyUploadBtn');
const fileUploadInput = document.getElementById('fileUploadInput');
const storagePercentText = document.getElementById('storagePercentText');
const storageProgressBar = document.getElementById('storageProgressBar');
const storageUsageDetails = document.getElementById('storageUsageDetails');
const quotaWarningBanner = document.getElementById('quotaWarningBanner');
const quotaWarningText = document.getElementById('quotaWarningText');
const mainWorkspace = document.getElementById('mainWorkspace');
const dropzoneOverlay = document.getElementById('dropzoneOverlay');
const currentViewTitle = document.getElementById('currentViewTitle');
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
const adminModal = document.getElementById('adminModal');
const adminTotalUsers = document.getElementById('adminTotalUsers');
const adminTotalFiles = document.getElementById('adminTotalFiles');
const adminTotalStorage = document.getElementById('adminTotalStorage');
const adminUsersTableBody = document.getElementById('adminUsersTableBody');
const fileContextMenu = document.getElementById('fileContextMenu');
const referralModal = document.getElementById('referralModal');
const referralLinkInput = document.getElementById('referralLinkInput');
const copyReferralBtn = document.getElementById('copyReferralBtn');
const referralStatsText = document.getElementById('referralStatsText');
const shareReferralWaBtn = document.getElementById('shareReferralWaBtn');

// =============================================
// UTILITY FUNCTIONS
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
    month: 'short', day: 'numeric',
    year: d.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined
  });
}

function getFileCategory(mimetype, filename = '') {
  const m = String(mimetype || '').toLowerCase();
  const ext = String(filename).split('.').pop().toLowerCase();
  if (m.startsWith('image/') || ['jpg','jpeg','png','gif','svg','webp','avif'].includes(ext)) return 'images';
  if (m.startsWith('video/') || ['mp4','mkv','webm','mov','avi','m4v'].includes(ext)) return 'videos';
  if (m.startsWith('audio/') || ['mp3','wav','ogg','m4a','flac'].includes(ext)) return 'audio';
  if (['zip','rar','7z','tar','gz'].includes(ext) || m.includes('zip') || m.includes('compressed')) return 'archives';
  if (m.includes('pdf') || m.includes('document') || m.includes('word') || m.includes('text') ||
      ['pdf','doc','docx','txt','md','xls','xlsx','ppt','pptx','csv'].includes(ext)) return 'documents';
  return 'other';
}

function getFileIconMeta(mimetype, filename = '') {
  const cat = getFileCategory(mimetype, filename);
  const ext = String(filename).split('.').pop().toLowerCase();
  if (cat === 'images') return { icon: 'fa-regular fa-file-image', color: '#0ea5e9' };
  if (ext === 'pdf' || (mimetype || '').includes('pdf')) return { icon: 'fa-regular fa-file-pdf', color: '#ef4444' };
  if (['doc','docx'].includes(ext) || (mimetype || '').includes('word')) return { icon: 'fa-regular fa-file-word', color: '#2563eb' };
  if (['xls','xlsx','csv'].includes(ext)) return { icon: 'fa-regular fa-file-excel', color: '#16a34a' };
  if (cat === 'videos') return { icon: 'fa-regular fa-file-video', color: '#8b5cf6' };
  if (cat === 'audio') return { icon: 'fa-regular fa-file-audio', color: '#f59e0b' };
  if (cat === 'archives') return { icon: 'fa-regular fa-file-zipper', color: '#d97706' };
  return { icon: 'fa-regular fa-file-lines', color: '#64748b' };
}

// =============================================
// REALTIME STORAGE UI
// =============================================
function updateStorageUI(p) {
  if (!p) return;
  profile = p;
  const used = Number(p.usedStorageBytes || p.storageUsed || 0);
  const limit = Number(p.storageLimitBytes || p.storageLimit || 10 * 1024 ** 3);
  const percent = Math.min(100, Math.round((used / limit) * 100));

  if (storagePercentText) storagePercentText.textContent = `${percent}%`;
  if (storageProgressBar) storageProgressBar.style.width = `${percent}%`;

  if (percent >= 90) {
    if (storageProgressBar) storageProgressBar.style.background = '#ef4444';
    if (quotaWarningBanner) {
      quotaWarningBanner.className = 'storage-banner danger';
      if (quotaWarningText) quotaWarningText.textContent = `Critical: ${percent}% of your drive is full. Upload failures imminent — upgrade now.`;
      quotaWarningBanner.style.display = 'flex';
    }
  } else if (percent >= 75) {
    if (storageProgressBar) storageProgressBar.style.background = '#f59e0b';
    if (quotaWarningBanner) {
      quotaWarningBanner.className = 'storage-banner warning';
      if (quotaWarningText) quotaWarningText.textContent = `Notice: You have used ${percent}% of your allocated drive space.`;
      quotaWarningBanner.style.display = 'flex';
    }
  } else {
    if (storageProgressBar) storageProgressBar.style.background = 'linear-gradient(90deg, #0ea5e9, #38bdf8)';
    if (quotaWarningBanner) quotaWarningBanner.style.display = 'none';
  }

  if (storageUsageDetails) storageUsageDetails.innerHTML = `<b>${formatBytes(used)}</b> of ${formatBytes(limit, 0)} used`;
  const tierName = p.planType || (limit > 10 * 1024 ** 3 ? 'Pro' : 'Free');
  if (dropdownPlanBadge) dropdownPlanBadge.textContent = `${tierName} · ${formatBytes(limit, 0)}`;
}

// =============================================
// USER IDENTITY UI — deterministic, zero placeholder flashes
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
    if (userAvatarBtn) userAvatarBtn.innerHTML = `<img src="${user.photoURL}" alt="${displayName}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
  } else {
    if (userInitials) userInitials.textContent = initial;
  }

  // Dropdown header elements
  if (dropdownInitials) dropdownInitials.textContent = initial;
  if (dropdownName) dropdownName.textContent = displayName;
  if (dropdownUsername) dropdownUsername.textContent = username;
  if (dropdownEmail) dropdownEmail.textContent = email;
  if (dropdownAccountId) dropdownAccountId.textContent = `Account: ${accountId}`;

  // Admin link
  if (isAdmin(prof) && adminDashboardBtn) {
    adminDashboardBtn.style.display = 'flex';
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

    // Instantly bind identity so @username, user, and ZUL-000000 NEVER flash
    setupUserUI(user, {
      email: user.email,
      displayName: user.displayName || user.email.split('@')[0],
      username: deriveUsername(user),
      accountId: deriveAccountId(user)
    });

    try {
      profile = await bootstrapUser();
    } catch (err) {
      console.warn('[Zulora App] bootstrapUser failed — trying refreshProfile:', err.message);
      try {
        profile = await refreshProfile();
      } catch (e2) {
        console.warn('[Zulora App] refreshProfile fallback to local profile:', e2.message);
        profile = {
          uid: user.uid,
          email: user.email,
          displayName: user.displayName || user.email.split('@')[0] || 'User',
          username: deriveUsername(user),
          accountId: deriveAccountId(user),
          photoURL: user.photoURL || '',
          storageLimitBytes: 10 * 1024 ** 3,
          usedStorageBytes: 0,
          planType: 'Free',
          tier: 'free',
          isAdmin: (user.email || '').toLowerCase() === ADMIN_EMAIL
        };
      }
    }

    setupUserUI(user, profile);
    updateStorageUI(profile);
    await loadFiles();
  });
}

// Attach directly to window load as specified
if (document.readyState === 'complete') {
  initAuthLifecycle();
} else {
  window.addEventListener('load', initAuthLifecycle);
}

// Background storage refresher
setInterval(async () => {
  try {
    const updated = await refreshProfile();
    updateStorageUI(updated);
  } catch (_) {}
}, 45000);

// =============================================
// FILE LOADING & DISPLAY
// =============================================
async function loadFiles() {
  try {
    const data = await api('/api/files');
    allFiles = Array.isArray(data?.files) ? data.files : [];
    applyFiltersAndRender();
  } catch (err) {
    console.error('[Zulora App] loadFiles error:', err.message);
    allFiles = [];
    applyFiltersAndRender();
  }
}

function applyFiltersAndRender() {
  const query = (globalSearchInput?.value || '').trim().toLowerCase();

  filteredFiles = allFiles.filter((file) => {
    const fileName = file.originalName || file.name || '';
    if (currentNav === 'starred' && !file.isStarred) return false;
    if (currentCategory !== 'all' && getFileCategory(file.mimetype || file.mimeType, fileName) !== currentCategory) return false;
    if (query && !fileName.toLowerCase().includes(query)) return false;
    return true;
  });

  filteredFiles.sort((a, b) => {
    const aName = a.originalName || a.name || '';
    const bName = b.originalName || b.name || '';
    const aDate = new Date(a.uploadedAt || a.uploadDate || 0);
    const bDate = new Date(b.uploadedAt || b.uploadDate || 0);
    if (currentSort === 'date-desc') return bDate - aDate;
    if (currentSort === 'date-asc') return aDate - bDate;
    if (currentSort === 'name-asc') return aName.localeCompare(bName);
    if (currentSort === 'size-desc') return (b.size || 0) - (a.size || 0);
    return 0;
  });

  renderFiles();
}

function renderFiles() {
  if (filteredFiles.length === 0) {
    if (filesGrid) filesGrid.style.display = 'none';
    if (filesListContainer) filesListContainer.style.display = 'none';
    if (emptyState) emptyState.style.display = 'flex';
    return;
  }
  if (emptyState) emptyState.style.display = 'none';

  if (currentViewMode === 'grid') {
    if (filesListContainer) filesListContainer.style.display = 'none';
    if (filesGrid) { filesGrid.style.display = 'grid'; renderGridView(); }
  } else {
    if (filesGrid) filesGrid.style.display = 'none';
    if (filesListContainer) { filesListContainer.style.display = 'block'; renderListView(); }
  }
}

function renderGridView() {
  if (!filesGrid) return;
  filesGrid.innerHTML = '';
  filteredFiles.forEach((file) => {
    const name = file.originalName || file.name || 'Untitled';
    const meta = getFileIconMeta(file.mimetype || file.mimeType, name);
    const card = document.createElement('div');
    card.className = 'file-card';
    card.dataset.id = file.id;
    card.innerHTML = `
      <div class="file-card-top">
        <div class="file-card-icon" style="color:${meta.color}"><i class="${meta.icon}"></i></div>
        <div class="file-card-actions">
          <button class="star-btn ${file.isStarred ? 'starred' : ''}" type="button" data-action="toggle-star">
            <i class="${file.isStarred ? 'fa-solid' : 'fa-regular'} fa-star"></i>
          </button>
          <button class="menu-btn" type="button" data-action="open-menu">
            <i class="fa-solid fa-ellipsis-vertical"></i>
          </button>
        </div>
      </div>
      <div class="file-card-info">
        <div class="file-card-title" title="${name}" data-action="preview">${name}</div>
        <div class="file-card-meta">
          <span>${formatBytes(file.size)}</span>
          <span>${formatDate(file.uploadedAt || file.uploadDate)}</span>
        </div>
      </div>`;
    card.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const action = btn.dataset.action;
      if (action === 'toggle-star') { e.stopPropagation(); toggleStar(file); }
      else if (action === 'open-menu') { e.stopPropagation(); showContextMenu(e, file); }
      else if (action === 'preview') openPreviewModal(file);
    });
    card.addEventListener('dblclick', () => openPreviewModal(file));
    filesGrid.appendChild(card);
  });
}

function renderListView() {
  if (!filesTableBody) return;
  filesTableBody.innerHTML = '';
  filteredFiles.forEach((file) => {
    const name = file.originalName || file.name || 'Untitled';
    const meta = getFileIconMeta(file.mimetype || file.mimeType, name);
    const tr = document.createElement('tr');
    tr.dataset.id = file.id;
    tr.innerHTML = `
      <td>
        <div class="table-name-cell">
          <div class="table-file-icon" style="color:${meta.color}"><i class="${meta.icon}"></i></div>
          <span class="table-file-name" data-action="preview">${name}</span>
        </div>
      </td>
      <td style="color:var(--text-muted);font-size:0.85rem;">${formatBytes(file.size)}</td>
      <td style="color:var(--text-muted);font-size:0.85rem;">${formatDate(file.uploadedAt || file.uploadDate)}</td>
      <td style="text-align:right;">
        <button class="btn-icon star-btn ${file.isStarred ? 'starred' : ''}" type="button" data-action="toggle-star" title="Star">
          <i class="${file.isStarred ? 'fa-solid' : 'fa-regular'} fa-star"></i>
        </button>
        <button class="btn-icon" type="button" data-action="download" title="Download">
          <i class="fa-solid fa-download"></i>
        </button>
        <button class="btn-icon" type="button" data-action="open-menu" title="More">
          <i class="fa-solid fa-ellipsis-vertical"></i>
        </button>
      </td>`;
    tr.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const action = btn.dataset.action;
      if (action === 'toggle-star') { e.stopPropagation(); toggleStar(file); }
      else if (action === 'download') { e.stopPropagation(); downloadFile(file); }
      else if (action === 'open-menu') { e.stopPropagation(); showContextMenu(e, file); }
      else if (action === 'preview') openPreviewModal(file);
    });
    filesTableBody.appendChild(tr);
  });
}

// =============================================
// FILE ACTIONS
// =============================================
async function toggleStar(file) {
  file.isStarred = !file.isStarred;
  renderFiles();
  try {
    await api(`/api/files/${file.id}`, { method: 'PATCH', body: JSON.stringify({ isStarred: file.isStarred }) });
  } catch (err) {
    console.error('Star toggle failed:', err.message);
    await loadFiles();
  }
}

function downloadFile(file) {
  window.open(`/api/files/${file.id}/content?download=1`, '_blank');
}

function openPreviewModal(file) {
  selectedFile = file;
  const name = file.originalName || file.name || 'File';
  if (previewTitle) previewTitle.textContent = name;
  if (previewDownloadBtn) {
    previewDownloadBtn.href = `/api/files/${file.id}/content?download=1`;
    previewDownloadBtn.download = name;
  }
  if (previewContainer) previewContainer.innerHTML = '<div style="color:var(--text-muted);"><i class="fa-solid fa-circle-notch fa-spin"></i> Loading preview...</div>';
  if (previewModal) previewModal.classList.add('show');

  const cat = getFileCategory(file.mimetype || file.mimeType, name);
  const url = `/api/files/${file.id}/content`;
  if (cat === 'images') {
    previewContainer.innerHTML = `<img src="${url}" alt="${name}" style="max-width:100%;max-height:55vh;object-fit:contain;">`;
  } else if (cat === 'videos') {
    previewContainer.innerHTML = `<video controls autoplay style="max-width:100%;max-height:55vh;"><source src="${url}" type="${file.mimetype || 'video/mp4'}">Preview not supported.</video>`;
  } else if (cat === 'audio') {
    previewContainer.innerHTML = `<audio controls autoplay style="width:80%;"><source src="${url}" type="${file.mimetype || 'audio/mpeg'}">Preview not supported.</audio>`;
  } else if (name.endsWith('.pdf') || (file.mimetype || '').includes('pdf')) {
    previewContainer.innerHTML = `<iframe src="${url}" style="width:100%;height:55vh;border:none;"></iframe>`;
  } else {
    fetch(url).then((r) => r.headers.get('content-type')?.includes('text') ? r.text() : null)
      .then((text) => {
        if (typeof text === 'string') {
          previewContainer.innerHTML = `<pre style="width:100%;height:50vh;overflow:auto;padding:14px;background:#fff;border:1px solid var(--border-soft);border-radius:8px;font-family:var(--font-mono);font-size:0.85rem;text-align:left;">${text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</pre>`;
        } else {
          const m = getFileIconMeta(file.mimetype || file.mimeType, name);
          previewContainer.innerHTML = `<div style="display:flex;flex-direction:column;align-items:center;gap:12px;"><i class="${m.icon}" style="font-size:4rem;color:${m.color}"></i><div style="font-weight:600;">${name}</div><div style="font-size:0.85rem;color:var(--text-muted);">${formatBytes(file.size)}</div></div>`;
        }
      }).catch(() => { previewContainer.innerHTML = '<div>Cannot preview. Please download to view.</div>'; });
  }
}

function openRenameModal(file) {
  selectedFile = file;
  const name = file.originalName || file.name || '';
  if (renameInput) renameInput.value = name;
  if (renameModal) { renameModal.classList.add('show'); renameInput.focus(); }
}

if (renameForm) {
  renameForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!selectedFile) return;
    const newName = renameInput?.value.trim();
    if (!newName) return;
    try {
      await api(`/api/files/${selectedFile.id}`, { method: 'PATCH', body: JSON.stringify({ originalName: newName }) });
      renameModal.classList.remove('show');
      await loadFiles();
    } catch (err) { alert(err.message || 'Failed to rename file.'); }
  });
}

function openDeleteModal(file) {
  selectedFile = file;
  const name = file.originalName || file.name || 'this file';
  const prompt = document.getElementById('deletePromptText');
  if (prompt) prompt.textContent = `Delete "${name}" permanently? This cannot be undone and your storage quota will be reclaimed immediately.`;
  if (deleteModal) deleteModal.classList.add('show');
}

if (confirmDeleteBtn) {
  confirmDeleteBtn.addEventListener('click', async () => {
    if (!selectedFile) return;
    confirmDeleteBtn.disabled = true;
    confirmDeleteBtn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Deleting...';
    try {
      await api(`/api/files/${selectedFile.id}`, { method: 'DELETE' });
      if (deleteModal) deleteModal.classList.remove('show');
      const updated = await refreshProfile();
      updateStorageUI(updated);
      await loadFiles();
    } catch (err) { alert(err.message || 'Failed to delete file.'); }
    finally {
      confirmDeleteBtn.disabled = false;
      confirmDeleteBtn.innerHTML = '<i class="fa-regular fa-trash-can"></i> Delete Permanently';
    }
  });
}

// Context Menu
function showContextMenu(e, file) {
  selectedFile = file;
  if (!fileContextMenu) return;
  const rect = e.target.getBoundingClientRect();
  fileContextMenu.style.top = `${rect.bottom + window.scrollY + 4}px`;
  fileContextMenu.style.left = `${Math.min(window.innerWidth - 190, rect.left + window.scrollX - 80)}px`;
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
    const item = e.target.closest('.context-menu-item');
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
// FILE UPLOADS — Direct FormData Stream to /api/upload
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

// Fullscreen workspace drag & drop
let dragCounter = 0;
if (mainWorkspace) {
  ['dragenter', 'dragover', 'dragleave', 'drop'].forEach((event) => {
    mainWorkspace.addEventListener(event, (e) => { e.preventDefault(); e.stopPropagation(); });
  });
  mainWorkspace.addEventListener('dragenter', () => { dragCounter++; dropzoneOverlay?.classList.add('active'); });
  mainWorkspace.addEventListener('dragleave', () => { if (--dragCounter <= 0) { dragCounter = 0; dropzoneOverlay?.classList.remove('active'); } });
  mainWorkspace.addEventListener('drop', (e) => {
    dragCounter = 0;
    dropzoneOverlay?.classList.remove('active');
    const files = Array.from(e.dataTransfer?.files || []);
    if (files.length > 0) uploadFilesBatch(files);
  });
}

async function uploadFilesBatch(files) {
  if (!uploadDrawer) return;
  uploadDrawer.classList.add('show');
  if (uploadDrawerStatus) uploadDrawerStatus.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin text-azure"></i> Uploading to Zulora Drive...';
  if (uploadDrawerBody) uploadDrawerBody.innerHTML = '';

  for (const file of files) {
    const row = document.createElement('div');
    row.className = 'upload-item-row';
    row.innerHTML = `
      <div class="upload-item-info">
        <span class="upload-item-name" title="${file.name}">${file.name}</span>
        <span class="upload-status-text" style="font-size:0.78rem;color:var(--azure-primary);">0%</span>
      </div>
      <div class="upload-item-progress-track">
        <div class="upload-item-progress-bar"></div>
      </div>`;
    uploadDrawerBody.appendChild(row);

    const bar = row.querySelector('.upload-item-progress-bar');
    const status = row.querySelector('.upload-status-text');

    try {
      await uploadSingleFileXHR(file, (pct) => {
        if (bar) bar.style.width = `${pct}%`;
        if (status) status.textContent = `${pct}%`;
      });
      if (status) status.innerHTML = '<i class="fa-solid fa-circle-check" style="color:#10b981;"></i>';
      if (bar) bar.style.background = '#10b981';
    } catch (err) {
      if (status) status.innerHTML = '<i class="fa-solid fa-circle-xmark" style="color:#ef4444;"></i>';
      if (bar) bar.style.background = '#ef4444';
      if (err.status === 413 || (err.message || '').includes('quota')) {
        openPlansModal();
        setTimeout(() => alert(`Storage quota reached: ${err.message || 'Upgrade to upload more files.'}`), 300);
      } else {
        alert(`Failed to upload "${file.name}": ${err.message}`);
      }
    }
  }

  if (uploadDrawerStatus) uploadDrawerStatus.innerHTML = '<i class="fa-solid fa-check" style="color:#10b981;"></i> Uploads complete';
  try {
    const updated = await refreshProfile();
    updateStorageUI(updated);
  } catch (_) {}
  await loadFiles();
}

/**
 * Uploads single file directly to /api/upload with real-time XHR progress tracking
 */
function uploadSingleFileXHR(file, onProgress) {
  return new Promise(async (resolve, reject) => {
    try {
      const token = await getIdToken();
      const xhr = new XMLHttpRequest();
      xhr.open('POST', '/api/upload', true); // Direct endpoint to /api/upload
      xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      xhr.setRequestHeader('Bypass-Tunnel-Reminder', 'true');
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try { resolve(JSON.parse(xhr.responseText)); } catch (_) { resolve({}); }
        } else {
          try {
            const d = JSON.parse(xhr.responseText);
            const err = new Error(d.error || 'Upload failed.');
            err.status = xhr.status; err.code = d.code;
            reject(err);
          } catch (_) {
            const err = new Error(`Upload failed (${xhr.status}).`);
            err.status = xhr.status;
            reject(err);
          }
        }
      };
      xhr.onerror = () => reject(new Error('Network error during upload. Please check your internet connection.'));
      const formData = new FormData();
      formData.append('file', file);
      xhr.send(formData);
    } catch (err) { reject(err); }
  });
}

if (closeUploadDrawerBtn) {
  closeUploadDrawerBtn.addEventListener('click', () => uploadDrawer?.classList.remove('show'));
}

// =============================================
// SEARCH, FILTER, SORT & VIEW
// =============================================
if (globalSearchInput) {
  globalSearchInput.addEventListener('input', () => {
    if (searchClearBtn) searchClearBtn.style.display = globalSearchInput.value ? 'block' : 'none';
    applyFiltersAndRender();
  });
}
if (searchClearBtn) {
  searchClearBtn.addEventListener('click', () => {
    if (globalSearchInput) globalSearchInput.value = '';
    searchClearBtn.style.display = 'none';
    applyFiltersAndRender();
  });
}
if (sortBySelect) {
  sortBySelect.addEventListener('change', (e) => { currentSort = e.target.value; applyFiltersAndRender(); });
}
if (viewGridBtn) {
  viewGridBtn.addEventListener('click', () => {
    currentViewMode = 'grid';
    localStorage.setItem('zulora_view_mode', 'grid');
    viewGridBtn.classList.add('active');
    viewListBtn?.classList.remove('active');
    renderFiles();
  });
}
if (viewListBtn) {
  viewListBtn.addEventListener('click', () => {
    currentViewMode = 'list';
    localStorage.setItem('zulora_view_mode', 'list');
    viewListBtn.classList.add('active');
    viewGridBtn?.classList.remove('active');
    renderFiles();
  });
}

document.querySelectorAll('.pill-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.pill-btn').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    currentCategory = btn.dataset.filter;
    applyFiltersAndRender();
  });
});

document.querySelectorAll('.nav-item').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.nav-item').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    currentNav = btn.dataset.nav;
    if (currentViewTitle) {
      const titles = { 'my-drive': 'My Drive', 'starred': 'Starred Files', 'recent': 'Recent Files' };
      currentViewTitle.textContent = titles[currentNav] || 'My Drive';
    }
    applyFiltersAndRender();
    if (window.innerWidth <= 992) appSidebar?.classList.remove('open');
  });
});

if (mobileMenuBtn) mobileMenuBtn.addEventListener('click', () => appSidebar?.classList.toggle('open'));
if (userAvatarBtn) {
  userAvatarBtn.addEventListener('click', (e) => { e.stopPropagation(); userDropdown?.classList.toggle('show'); });
}
if (logoutBtn) {
  logoutBtn.addEventListener('click', async () => { await logOut(); window.location.replace('login.html'); });
}

// =============================================
// STORAGE UPGRADE & UPI PAYMENT
// =============================================
function openPlansModal() { plansModal?.classList.add('show'); }

[openPlansModalBtn, sidebarUpgradeBtn, bannerUpgradeBtn, dropdownUpgradeBtn].forEach((btn) => {
  if (btn) btn.addEventListener('click', openPlansModal);
});

document.querySelectorAll('.select-plan-btn').forEach((btn) => {
  btn.addEventListener('click', () => openUpiPayment(btn.dataset.plan, btn.dataset.name, btn.dataset.amount));
});

function openUpiPayment(planKey, planName, amount) {
  activePlan = { key: planKey, name: planName, amount };
  plansModal?.classList.remove('show');
  if (upiModalPlanTitle) upiModalPlanTitle.textContent = `Upgrade to ${planName}`;
  if (upiModalAmountText) upiModalAmountText.textContent = `Pay: ₹${amount} / month`;

  const upiUrl = `upi://pay?pa=${SUPPORT_UPI_ID}&pn=Zulora%20Drive&am=${amount}&cu=INR&tn=Zulora%20Drive%20${encodeURIComponent(planName)}`;
  if (payUpiDeepLink) payUpiDeepLink.href = upiUrl;
  if (upiQrCodeImg) upiQrCodeImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(upiUrl)}`;

  const waLink = document.getElementById('whatsappHelpLink');
  if (waLink) waLink.href = `${SUPPORT_WHATSAPP.split('?')[0]}?text=Hi%20Zulora%20Support%2C%20I%20have%20paid%20%E2%82%B9${amount}%20for%20${encodeURIComponent(planName)}.`;

  if (utrInput) utrInput.value = '';
  upiModal?.classList.add('show');
}

if (copyUpiBtn) {
  copyUpiBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(SUPPORT_UPI_ID);
    copyUpiBtn.innerHTML = '<i class="fa-solid fa-check"></i> Copied!';
    setTimeout(() => { copyUpiBtn.innerHTML = '<i class="fa-regular fa-copy"></i> Copy'; }, 2000);
  });
}

if (upiConfirmForm) {
  upiConfirmForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const utr = utrInput?.value.trim();
    if (!utr || !activePlan) return;
    const submitBtn = document.getElementById('submitUtrBtn');
    if (submitBtn) { submitBtn.disabled = true; submitBtn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Submitting...'; }
    try {
      await api('/api/upgrade-requests', {
        method: 'POST',
        body: JSON.stringify({ plan: activePlan.key, paymentReference: utr })
      });
      upiModal?.classList.remove('show');
      alert(`Thank you! Payment request for ${activePlan.name} (UTR: ${utr}) submitted. Storage will be activated after verification.`);
    } catch (err) {
      alert(err.message || 'Submission failed. Please try again.');
    } finally {
      if (submitBtn) { submitBtn.disabled = false; submitBtn.innerHTML = '<i class="fa-solid fa-check"></i> Submit Verification Request'; }
    }
  });
}

// =============================================
// REFERRAL & FREE STORAGE SYSTEM MODAL
// =============================================
function openReferralModal() {
  if (!referralModal) return;
  const user = getCurrentUser();
  const link = profile?.referralLink || getReferralLink(user);
  const totalReferrals = profile?.totalReferrals || 0;
  const bonusBytes = profile?.referralBonusBytes || 0;

  if (referralLinkInput) referralLinkInput.value = link;
  if (referralStatsText) {
    referralStatsText.textContent = `You've invited ${totalReferrals} user${totalReferrals !== 1 ? 's' : ''} and earned ${formatBytes(bonusBytes)} in free bonus storage!`;
  }
  if (shareReferralWaBtn) {
    const waText = encodeURIComponent(`Join Zulora Drive with my referral link and get 5 GB free storage bonus! ${link}`);
    shareReferralWaBtn.href = `https://wa.me/?text=${waText}`;
  }
  userDropdown?.classList.remove('show');
  referralModal.classList.add('show');
}

document.querySelectorAll('[data-open-referral]').forEach((btn) => {
  btn.addEventListener('click', openReferralModal);
});

if (copyReferralBtn) {
  copyReferralBtn.addEventListener('click', () => {
    const link = referralLinkInput?.value;
    if (!link) return;
    navigator.clipboard.writeText(link);
    copyReferralBtn.innerHTML = '<i class="fa-solid fa-check"></i> Copied!';
    setTimeout(() => { copyReferralBtn.innerHTML = '<i class="fa-solid fa-copy"></i> Copy Link'; }, 2500);
  });
}

// =============================================
// ADMIN CONSOLE
// =============================================
if (adminDashboardBtn) {
  adminDashboardBtn.addEventListener('click', async () => {
    userDropdown?.classList.remove('show');
    adminModal?.classList.add('show');
    try {
      const [overview, usersData] = await Promise.all([api('/api/admin/overview'), api('/api/admin/users')]);
      if (adminTotalUsers) adminTotalUsers.textContent = overview.users || 0;
      if (adminTotalFiles) adminTotalFiles.textContent = overview.files || 0;
      if (adminTotalStorage) adminTotalStorage.textContent = formatBytes(overview.storageUsed || 0);
      if (adminUsersTableBody) {
        adminUsersTableBody.innerHTML = '';
        (usersData.users || []).forEach((u) => {
          const tr = document.createElement('tr');
          const used = formatBytes(u.usedStorageBytes || u.storageUsed || 0);
          const limitGb = Math.round((u.storageLimitBytes || u.storageLimit || 0) / (1024 ** 3));
          tr.innerHTML = `<td style="font-weight:500;">${u.email}</td><td>${used}</td><td><b>${limitGb} GB</b></td>
            <td><button class="btn btn-azure-soft" style="height:28px;padding:0 8px;font-size:0.78rem;" data-uid="${u.uid}" data-email="${u.email}" data-limit="${limitGb}">Edit</button></td>`;
          tr.querySelector('button').addEventListener('click', () => promptEditQuota(u.uid, u.email, limitGb));
          adminUsersTableBody.appendChild(tr);
        });
      }
    } catch (err) { alert('Admin data load failed: ' + err.message); }
  });
}

async function promptEditQuota(uid, email, currentGb) {
  const input = prompt(`New storage quota (GB) for ${email}:`, currentGb);
  if (!input) return;
  const newGb = parseInt(input, 10);
  if (isNaN(newGb) || newGb < 1 || newGb > 50000) { alert('Enter a number between 1 and 50000.'); return; }
  try {
    await api('/api/admin/update-quota', { method: 'POST', body: JSON.stringify({ uid, storageLimitGb: newGb }) });
    alert(`Storage for ${email} updated to ${newGb} GB.`);
    adminDashboardBtn.click();
  } catch (err) { alert(err.message || 'Update failed.'); }
}

// =============================================
// MODAL CLOSE CONTROLS
// =============================================
document.querySelectorAll('.modal-close').forEach((btn) => {
  btn.addEventListener('click', (e) => e.target.closest('.modal-backdrop')?.classList.remove('show'));
});
document.querySelectorAll('.modal-backdrop').forEach((modal) => {
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.classList.remove('show'); });
});
