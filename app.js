/**
 * Zulora Drive — Primary Application Logic (Google Drive & OneDrive Inspired)
 *
 * Implements:
 *   • Authentication verification & profile bootstrapping
 *   • Real-time drive usage monitoring & storage progress ring/bar
 *   • File listing, filtering, search, and sorting
 *   • Grid vs List view switching
 *   • Drag-and-drop & file picker uploads with bottom-right progress drawer
 *   • File actions: Preview, Download, Star, Rename, Delete
 *   • Monthly data packages & UPI payment modal (shivenpanwar@fam)
 *   • Admin console with live quota updating
 */

import {
  onAuthChange,
  logOut,
  api,
  bootstrapUser,
  refreshProfile,
  getCurrentUser,
  getCurrentProfile,
  isAdmin,
  ADMIN_EMAIL
} from './auth.js';

// ==========================================
// STATE MANAGEMENT
// ==========================================
let allFiles = [];
let filteredFiles = [];
let currentCategory = 'all'; // all, documents, images, videos, audio, archives
let currentNav = 'my-drive'; // my-drive, starred, recent
let currentViewMode = localStorage.getItem('zulora_view_mode') || 'grid'; // grid, list
let currentSort = 'date-desc';
let selectedFile = null;
let activePlan = null;
let profile = null;

// DOM Elements
const mobileMenuBtn = document.getElementById('mobileMenuBtn');
const appSidebar = document.getElementById('appSidebar');
const globalSearchInput = document.getElementById('globalSearchInput');
const searchClearBtn = document.getElementById('searchClearBtn');
const userAvatarBtn = document.getElementById('userAvatarBtn');
const userInitials = document.getElementById('userInitials');
const userDropdown = document.getElementById('userDropdown');
const dropdownInitials = document.getElementById('dropdownInitials');
const dropdownName = document.getElementById('dropdownName');
const dropdownEmail = document.getElementById('dropdownEmail');
const dropdownAccountId = document.getElementById('dropdownAccountId');
const dropdownPlanBadge = document.getElementById('dropdownPlanBadge');
const dropdownUpgradeBtn = document.getElementById('dropdownUpgradeBtn');
const openPlansModalBtn = document.getElementById('openPlansModalBtn');
const sidebarUpgradeBtn = document.getElementById('sidebarUpgradeBtn');
const bannerUpgradeBtn = document.getElementById('bannerUpgradeBtn');
const adminDashboardBtn = document.getElementById('adminDashboardBtn');
const logoutBtn = document.getElementById('logoutBtn');

// Sidebar & Upload
const newUploadBtn = document.getElementById('newUploadBtn');
const emptyUploadBtn = document.getElementById('emptyUploadBtn');
const fileUploadInput = document.getElementById('fileUploadInput');
const storagePercentText = document.getElementById('storagePercentText');
const storageProgressBar = document.getElementById('storageProgressBar');
const storageUsageDetails = document.getElementById('storageUsageDetails');
const quotaWarningBanner = document.getElementById('quotaWarningBanner');
const quotaWarningText = document.getElementById('quotaWarningText');

// Workspace
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

// Upload Floating Drawer
const uploadDrawer = document.getElementById('uploadDrawer');
const uploadDrawerStatus = document.getElementById('uploadDrawerStatus');
const uploadDrawerBody = document.getElementById('uploadDrawerBody');
const closeUploadDrawerBtn = document.getElementById('closeUploadDrawerBtn');

// Modals
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

// ==========================================
// UTILITY FUNCTIONS
// ==========================================
function formatBytes(bytes, decimals = 1) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

function formatDate(isoString) {
  if (!isoString) return 'Just now';
  const d = new Date(isoString);
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: d.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined
  });
}

function getFileCategory(mimetype, filename = '') {
  const mime = String(mimetype || '').toLowerCase();
  const ext = filename.split('.').pop().toLowerCase();

  if (mime.startsWith('image/') || ['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp'].includes(ext)) return 'images';
  if (mime.startsWith('video/') || ['mp4', 'mkv', 'webm', 'mov', 'avi'].includes(ext)) return 'videos';
  if (mime.startsWith('audio/') || ['mp3', 'wav', 'ogg', 'm4a'].includes(ext)) return 'audio';
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext) || mime.includes('zip') || mime.includes('compressed')) return 'archives';
  if (
    mime.includes('pdf') ||
    mime.includes('document') ||
    mime.includes('word') ||
    mime.includes('text') ||
    ['pdf', 'doc', 'docx', 'txt', 'md', 'xls', 'xlsx', 'ppt', 'pptx'].includes(ext)
  ) return 'documents';

  return 'other';
}

function getFileIconMeta(mimetype, filename = '') {
  const category = getFileCategory(mimetype, filename);
  const ext = filename.split('.').pop().toLowerCase();

  if (category === 'images') {
    return { icon: 'fa-regular fa-file-image', color: '#0ea5e9' };
  }
  if (ext === 'pdf' || (mimetype || '').includes('pdf')) {
    return { icon: 'fa-regular fa-file-pdf', color: '#ef4444' };
  }
  if (['doc', 'docx'].includes(ext) || (mimetype || '').includes('word')) {
    return { icon: 'fa-regular fa-file-word', color: '#2563eb' };
  }
  if (['xls', 'xlsx', 'csv'].includes(ext) || (mimetype || '').includes('sheet')) {
    return { icon: 'fa-regular fa-file-excel', color: '#16a34a' };
  }
  if (category === 'videos') {
    return { icon: 'fa-regular fa-file-video', color: '#8b5cf6' };
  }
  if (category === 'audio') {
    return { icon: 'fa-regular fa-file-audio', color: '#f59e0b' };
  }
  if (category === 'archives') {
    return { icon: 'fa-regular fa-file-zipper', color: '#d97706' };
  }
  return { icon: 'fa-regular fa-file-lines', color: '#64748b' };
}

// ==========================================
// REAL-TIME DRIVE USAGE MONITORING
// ==========================================
function updateStorageUI(p) {
  if (!p) return;
  profile = p;

  const used = Number(p.usedStorageBytes || p.storageUsed || 0);
  const limit = Number(p.storageLimitBytes || p.storageLimit || 10 * 1024 * 1024 * 1024);
  const percent = Math.min(100, Math.round((used / limit) * 100));

  storagePercentText.textContent = `${percent}%`;
  storageProgressBar.style.width = `${percent}%`;

  if (percent >= 90) {
    storageProgressBar.style.background = '#ef4444';
    quotaWarningBanner.className = 'storage-banner danger';
    quotaWarningText.textContent = `High Storage Alert: You have used ${percent}% of your drive space. Upgrade to prevent upload failures.`;
    quotaWarningBanner.style.display = 'flex';
  } else if (percent >= 75) {
    storageProgressBar.style.background = '#f59e0b';
    quotaWarningBanner.className = 'storage-banner warning';
    quotaWarningText.textContent = `Warning: You have used ${percent}% of your allocated drive space.`;
    quotaWarningBanner.style.display = 'flex';
  } else {
    storageProgressBar.style.background = 'linear-gradient(90deg, #0ea5e9, #38bdf8)';
    quotaWarningBanner.style.display = 'none';
  }

  storageUsageDetails.innerHTML = `<b>${formatBytes(used)}</b> of ${formatBytes(limit, 0)} used`;

  // Update user badges
  const tierName = p.planType || (limit > 10 * 1024 * 1024 * 1024 ? 'Pro' : 'Free');
  dropdownPlanBadge.textContent = `${tierName} (${formatBytes(limit, 0)})`;
}

// ==========================================
// AUTHENTICATION & INITIALIZATION
// ==========================================
onAuthChange(async (user) => {
  if (!user) {
    window.location.replace('login.html');
    return;
  }

  try {
    profile = await bootstrapUser();
    setupUserUI(user, profile);
    updateStorageUI(profile);
    await loadFiles();
  } catch (err) {
    console.error('[Zulora Drive] Initialization failed:', err);
    // Try fallback profile refresh
    try {
      profile = await refreshProfile();
      setupUserUI(user, profile);
      updateStorageUI(profile);
      await loadFiles();
    } catch (e) {
      console.error('[Zulora Drive] Profile fetch error:', e);
    }
  }
});

function setupUserUI(user, prof) {
  const name = prof?.displayName || user.displayName || user.email.split('@')[0];
  const initial = name.charAt(0).toUpperCase();

  userInitials.textContent = initial;
  dropdownInitials.textContent = initial;
  dropdownName.textContent = name;
  dropdownEmail.textContent = user.email;
  dropdownAccountId.textContent = `Account: ${prof?.accountId || 'ZUL-DIRECT'}`;

  if (isAdmin(prof)) {
    adminDashboardBtn.style.display = 'flex';
  }

  // Set avatar photo if present
  if (user.photoURL) {
    userAvatarBtn.innerHTML = `<img src="${user.photoURL}" alt="${name}">`;
  }
}

// Real-time drive usage background polling (every 40 seconds)
setInterval(async () => {
  try {
    const updatedProfile = await refreshProfile();
    updateStorageUI(updatedProfile);
  } catch (_) {}
}, 40000);

// ==========================================
// FILE FETCHING & RENDERING
// ==========================================
async function loadFiles() {
  try {
    const data = await api('/api/files/list');
    allFiles = Array.isArray(data?.files) ? data.files : [];
    applyFiltersAndRender();
  } catch (err) {
    console.error('[Zulora Drive] Load files error:', err);
    allFiles = [];
    applyFiltersAndRender();
  }
}

function applyFiltersAndRender() {
  const query = (globalSearchInput.value || '').trim().toLowerCase();

  filteredFiles = allFiles.filter((file) => {
    // Nav view filtering
    if (currentNav === 'starred' && !file.isStarred) return false;

    // Category filtering
    if (currentCategory !== 'all') {
      const cat = getFileCategory(file.mimetype, file.originalName);
      if (cat !== currentCategory) return false;
    }

    // Search query filtering
    if (query && !file.originalName.toLowerCase().includes(query)) {
      return false;
    }

    return true;
  });

  // Sorting
  filteredFiles.sort((a, b) => {
    if (currentSort === 'date-desc') return new Date(b.uploadedAt || 0) - new Date(a.uploadedAt || 0);
    if (currentSort === 'date-asc') return new Date(a.uploadedAt || 0) - new Date(b.uploadedAt || 0);
    if (currentSort === 'name-asc') return a.originalName.localeCompare(b.originalName);
    if (currentSort === 'size-desc') return (b.size || 0) - (a.size || 0);
    return 0;
  });

  renderFiles();
}

function renderFiles() {
  if (filteredFiles.length === 0) {
    filesGrid.style.display = 'none';
    filesListContainer.style.display = 'none';
    emptyState.style.display = 'flex';
    return;
  }

  emptyState.style.display = 'none';

  if (currentViewMode === 'grid') {
    filesListContainer.style.display = 'none';
    filesGrid.style.display = 'grid';
    renderGridView();
  } else {
    filesGrid.style.display = 'none';
    filesListContainer.style.display = 'block';
    renderListView();
  }
}

function renderGridView() {
  filesGrid.innerHTML = '';

  filteredFiles.forEach((file) => {
    const iconMeta = getFileIconMeta(file.mimetype, file.originalName);
    const card = document.createElement('div');
    card.className = 'file-card';
    card.dataset.id = file.id;

    card.innerHTML = `
      <div class="file-card-top">
        <div class="file-card-icon" style="color: ${iconMeta.color}">
          <i class="${iconMeta.icon}"></i>
        </div>
        <div class="file-card-actions">
          <button class="star-btn ${file.isStarred ? 'starred' : ''}" type="button" title="${file.isStarred ? 'Unstar' : 'Star'}" data-action="toggle-star">
            <i class="${file.isStarred ? 'fa-solid' : 'fa-regular'} fa-star"></i>
          </button>
          <button class="menu-btn" type="button" title="More actions" data-action="open-menu">
            <i class="fa-solid fa-ellipsis-vertical"></i>
          </button>
        </div>
      </div>
      <div class="file-card-info">
        <div class="file-card-title" title="${file.originalName}" data-action="preview">${file.originalName}</div>
        <div class="file-card-meta">
          <span>${formatBytes(file.size)}</span>
          <span>${formatDate(file.uploadedAt)}</span>
        </div>
      </div>
    `;

    // Click handler for card
    card.addEventListener('click', (e) => {
      const actionBtn = e.target.closest('[data-action]');
      if (!actionBtn) return;
      const action = actionBtn.dataset.action;

      if (action === 'toggle-star') {
        e.stopPropagation();
        toggleStar(file);
      } else if (action === 'open-menu') {
        e.stopPropagation();
        showContextMenu(e, file);
      } else if (action === 'preview') {
        openPreviewModal(file);
      }
    });

    card.addEventListener('dblclick', () => openPreviewModal(file));

    filesGrid.appendChild(card);
  });
}

function renderListView() {
  filesTableBody.innerHTML = '';

  filteredFiles.forEach((file) => {
    const iconMeta = getFileIconMeta(file.mimetype, file.originalName);
    const tr = document.createElement('tr');
    tr.dataset.id = file.id;

    tr.innerHTML = `
      <td>
        <div class="table-name-cell">
          <div class="table-file-icon" style="color: ${iconMeta.color}">
            <i class="${iconMeta.icon}"></i>
          </div>
          <span class="table-file-name" data-action="preview">${file.originalName}</span>
        </div>
      </td>
      <td style="color: var(--text-muted); font-size: 0.85rem;">${formatBytes(file.size)}</td>
      <td style="color: var(--text-muted); font-size: 0.85rem;">${formatDate(file.uploadedAt)}</td>
      <td style="text-align: right;">
        <button class="btn-icon star-btn ${file.isStarred ? 'starred' : ''}" type="button" title="Star" data-action="toggle-star">
          <i class="${file.isStarred ? 'fa-solid' : 'fa-regular'} fa-star"></i>
        </button>
        <button class="btn-icon" type="button" title="Download" data-action="download">
          <i class="fa-solid fa-download"></i>
        </button>
        <button class="btn-icon" type="button" title="More options" data-action="open-menu">
          <i class="fa-solid fa-ellipsis-vertical"></i>
        </button>
      </td>
    `;

    tr.addEventListener('click', (e) => {
      const actionBtn = e.target.closest('[data-action]');
      if (!actionBtn) return;
      const action = actionBtn.dataset.action;

      if (action === 'toggle-star') {
        e.stopPropagation();
        toggleStar(file);
      } else if (action === 'download') {
        e.stopPropagation();
        downloadFile(file);
      } else if (action === 'open-menu') {
        e.stopPropagation();
        showContextMenu(e, file);
      } else if (action === 'preview') {
        openPreviewModal(file);
      }
    });

    tr.addEventListener('dblclick', () => openPreviewModal(file));

    filesTableBody.appendChild(tr);
  });
}

// ==========================================
// FILE ACTIONS (Preview, Star, Rename, Delete)
// ==========================================
async function toggleStar(file) {
  try {
    const updatedStarred = !file.isStarred;
    file.isStarred = updatedStarred;
    renderFiles();

    await api(`/api/files/${file.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ isStarred: updatedStarred })
    });
  } catch (err) {
    console.error('Star toggle failed:', err);
    await loadFiles();
  }
}

function downloadFile(file) {
  window.open(`/api/files/${file.id}/content?download=1`, '_blank');
}

function openPreviewModal(file) {
  selectedFile = file;
  previewTitle.textContent = file.originalName;
  previewDownloadBtn.href = `/api/files/${file.id}/content?download=1`;
  previewDownloadBtn.download = file.originalName;

  previewContainer.innerHTML = '<div style="color: var(--text-muted);"><i class="fa-solid fa-circle-notch fa-spin"></i> Loading preview...</div>';
  previewModal.classList.add('show');

  const cat = getFileCategory(file.mimetype, file.originalName);
  const contentUrl = `/api/files/${file.id}/content`;

  if (cat === 'images') {
    previewContainer.innerHTML = `<img src="${contentUrl}" alt="${file.originalName}">`;
  } else if (cat === 'videos') {
    previewContainer.innerHTML = `<video controls autoplay style="max-width: 100%; max-height: 55vh;"><source src="${contentUrl}" type="${file.mimetype}">Your browser does not support HTML5 video.</video>`;
  } else if (cat === 'audio') {
    previewContainer.innerHTML = `<audio controls autoplay style="width: 80%;"><source src="${contentUrl}" type="${file.mimetype}">Your browser does not support audio.</audio>`;
  } else if ((file.originalName || '').endsWith('.pdf')) {
    previewContainer.innerHTML = `<iframe src="${contentUrl}" title="${file.originalName}"></iframe>`;
  } else {
    // Attempt text preview or fallback icon
    fetch(contentUrl)
      .then((res) => (res.headers.get('content-type')?.includes('text') ? res.text() : null))
      .then((text) => {
        if (typeof text === 'string') {
          previewContainer.innerHTML = `<pre style="width: 100%; height: 50vh; overflow: auto; padding: 14px; background: #ffffff; border: 1px solid var(--border-soft); border-radius: 8px; font-family: var(--font-mono); font-size: 0.85rem; text-align: left;">${escapeHtml(text)}</pre>`;
        } else {
          const iconMeta = getFileIconMeta(file.mimetype, file.originalName);
          previewContainer.innerHTML = `
            <div style="display: flex; flex-direction: column; align-items: center; gap: 12px;">
              <i class="${iconMeta.icon}" style="font-size: 4rem; color: ${iconMeta.color}"></i>
              <div style="font-weight: 600;">${file.originalName}</div>
              <div style="font-size: 0.85rem; color: var(--text-muted);">${formatBytes(file.size)}</div>
            </div>
          `;
        }
      })
      .catch(() => {
        previewContainer.innerHTML = `<div>Cannot preview this file directly. Please download to view.</div>`;
      });
  }
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function openRenameModal(file) {
  selectedFile = file;
  renameInput.value = file.originalName;
  renameModal.classList.add('show');
  renameInput.focus();
}

renameForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!selectedFile) return;
  const newName = renameInput.value.trim();
  if (!newName) return;

  try {
    await api(`/api/files/${selectedFile.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ originalName: newName })
    });
    renameModal.classList.remove('show');
    await loadFiles();
  } catch (err) {
    alert(err.message || 'Failed to rename file.');
  }
});

function openDeleteModal(file) {
  selectedFile = file;
  document.getElementById('deletePromptText').textContent =
    `Are you sure you want to permanently delete "${file.originalName}"? Your drive storage will be reclaimed immediately.`;
  deleteModal.classList.add('show');
}

confirmDeleteBtn.addEventListener('click', async () => {
  if (!selectedFile) return;
  confirmDeleteBtn.disabled = true;
  confirmDeleteBtn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Deleting...';

  try {
    await api(`/api/files/${selectedFile.id}`, { method: 'DELETE' });
    deleteModal.classList.remove('show');
    // Live update profile storage and reload files
    const updatedProfile = await refreshProfile();
    updateStorageUI(updatedProfile);
    await loadFiles();
  } catch (err) {
    alert(err.message || 'Failed to delete file.');
  } finally {
    confirmDeleteBtn.disabled = false;
    confirmDeleteBtn.innerHTML = '<i class="fa-regular fa-trash-can"></i> Delete Permanently';
  }
});

// Context Menu
function showContextMenu(e, file) {
  selectedFile = file;
  const rect = e.target.getBoundingClientRect();
  fileContextMenu.style.top = `${rect.bottom + window.scrollY + 4}px`;
  fileContextMenu.style.left = `${Math.min(window.innerWidth - 190, rect.left + window.scrollX - 80)}px`;
  fileContextMenu.classList.add('show');
}

document.addEventListener('click', (e) => {
  if (!e.target.closest('#fileContextMenu') && !e.target.closest('[data-action="open-menu"]')) {
    fileContextMenu.classList.remove('show');
  }
  if (!e.target.closest('#userDropdown') && !e.target.closest('#userAvatarBtn')) {
    userDropdown.classList.remove('show');
  }
});

fileContextMenu.addEventListener('click', (e) => {
  const item = e.target.closest('.context-menu-item');
  if (!item || !selectedFile) return;
  const action = item.dataset.action;
  fileContextMenu.classList.remove('show');

  if (action === 'preview') openPreviewModal(selectedFile);
  if (action === 'download') downloadFile(selectedFile);
  if (action === 'rename') openRenameModal(selectedFile);
  if (action === 'star') toggleStar(selectedFile);
  if (action === 'delete') openDeleteModal(selectedFile);
});

// ==========================================
// FILE UPLOADS & DRAG AND DROP
// ==========================================
newUploadBtn.addEventListener('click', () => fileUploadInput.click());
emptyUploadBtn.addEventListener('click', () => fileUploadInput.click());

fileUploadInput.addEventListener('change', (e) => {
  const files = Array.from(e.target.files);
  if (files.length > 0) {
    uploadFilesBatch(files);
  }
  fileUploadInput.value = '';
});

// Drag & Drop Setup
let dragCounter = 0;

['dragenter', 'dragover', 'dragleave', 'drop'].forEach((eventName) => {
  mainWorkspace.addEventListener(eventName, (e) => {
    e.preventDefault();
    e.stopPropagation();
  });
});

mainWorkspace.addEventListener('dragenter', () => {
  dragCounter++;
  dropzoneOverlay.classList.add('active');
});

mainWorkspace.addEventListener('dragleave', () => {
  dragCounter--;
  if (dragCounter <= 0) {
    dropzoneOverlay.classList.remove('active');
    dragCounter = 0;
  }
});

mainWorkspace.addEventListener('drop', (e) => {
  dragCounter = 0;
  dropzoneOverlay.classList.remove('active');
  const files = Array.from(e.dataTransfer.files);
  if (files.length > 0) {
    uploadFilesBatch(files);
  }
});

async function uploadFilesBatch(files) {
  uploadDrawer.classList.add('show');
  uploadDrawerStatus.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin text-azure"></i> Uploading to Zulora Drive...';
  uploadDrawerBody.innerHTML = '';

  for (const file of files) {
    const itemRow = document.createElement('div');
    itemRow.className = 'upload-item-row';
    itemRow.innerHTML = `
      <div class="upload-item-info">
        <span class="upload-item-name">${file.name}</span>
        <span class="upload-status-text" style="font-size: 0.78rem; color: var(--azure-primary);">0%</span>
      </div>
      <div class="upload-item-progress-track">
        <div class="upload-item-progress-bar"></div>
      </div>
    `;
    uploadDrawerBody.appendChild(itemRow);

    const progressBar = itemRow.querySelector('.upload-item-progress-bar');
    const statusText = itemRow.querySelector('.upload-status-text');

    try {
      await uploadSingleFile(file, (percent) => {
        progressBar.style.width = `${percent}%`;
        statusText.textContent = `${percent}%`;
      });
      statusText.innerHTML = '<i class="fa-solid fa-circle-check text-success"></i>';
      progressBar.style.background = '#10b981';
    } catch (err) {
      statusText.innerHTML = '<i class="fa-solid fa-circle-xmark text-danger"></i>';
      progressBar.style.background = '#ef4444';
      if (err.status === 413 || err.message?.includes('quota')) {
        openPlansModal();
        alert(err.message || 'Storage limit reached. Please upgrade your plan.');
      } else {
        alert(`Failed to upload "${file.name}": ${err.message}`);
      }
    }
  }

  uploadDrawerStatus.innerHTML = '<i class="fa-solid fa-check text-success"></i> All uploads completed';

  // Live storage refresh & files refresh
  try {
    const updatedProfile = await refreshProfile();
    updateStorageUI(updatedProfile);
  } catch (_) {}
  await loadFiles();
}

function uploadSingleFile(file, onProgress) {
  return new Promise(async (resolve, reject) => {
    try {
      const { getIdToken } = await import('./auth.js');
      const token = await getIdToken();
      const xhr = new XMLHttpRequest();

      xhr.open('POST', '/api/files/upload', true);
      xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      xhr.setRequestHeader('Bypass-Tunnel-Reminder', 'true');

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          const percent = Math.round((e.loaded / e.total) * 100);
          onProgress(percent);
        }
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(JSON.parse(xhr.responseText));
        } else {
          try {
            const errData = JSON.parse(xhr.responseText);
            const err = new Error(errData.error || 'Upload failed.');
            err.status = xhr.status;
            reject(err);
          } catch (_) {
            const err = new Error(`Upload failed with status ${xhr.status}`);
            err.status = xhr.status;
            reject(err);
          }
        }
      };

      xhr.onerror = () => reject(new Error('Network error during upload.'));

      const formData = new FormData();
      formData.append('file', file);
      xhr.send(formData);
    } catch (err) {
      reject(err);
    }
  });
}

closeUploadDrawerBtn.addEventListener('click', () => {
  uploadDrawer.classList.remove('show');
});

// ==========================================
// SEARCH, SORT, FILTER & VIEW TOGGLES
// ==========================================
globalSearchInput.addEventListener('input', () => {
  searchClearBtn.style.display = globalSearchInput.value ? 'block' : 'none';
  applyFiltersAndRender();
});

searchClearBtn.addEventListener('click', () => {
  globalSearchInput.value = '';
  searchClearBtn.style.display = 'none';
  applyFiltersAndRender();
});

sortBySelect.addEventListener('change', (e) => {
  currentSort = e.target.value;
  applyFiltersAndRender();
});

viewGridBtn.addEventListener('click', () => {
  currentViewMode = 'grid';
  localStorage.setItem('zulora_view_mode', 'grid');
  viewGridBtn.classList.add('active');
  viewListBtn.classList.remove('active');
  renderFiles();
});

viewListBtn.addEventListener('click', () => {
  currentViewMode = 'list';
  localStorage.setItem('zulora_view_mode', 'list');
  viewListBtn.classList.add('active');
  viewGridBtn.classList.remove('active');
  renderFiles();
});

// Category pills
document.querySelectorAll('.pill-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.pill-btn').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    currentCategory = btn.dataset.filter;
    applyFiltersAndRender();
  });
});

// Sidebar Nav tabs
document.querySelectorAll('.nav-item').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.nav-item').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    currentNav = btn.dataset.nav;

    if (currentNav === 'my-drive') currentViewTitle.textContent = 'My Drive';
    if (currentNav === 'starred') currentViewTitle.textContent = 'Starred Files';
    if (currentNav === 'recent') currentViewTitle.textContent = 'Recent Files';

    applyFiltersAndRender();

    // Close mobile sidebar if open
    if (window.innerWidth <= 992) {
      appSidebar.classList.remove('open');
    }
  });
});

// Mobile menu toggle
mobileMenuBtn.addEventListener('click', () => {
  appSidebar.classList.toggle('open');
});

// User dropdown toggle
userAvatarBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  userDropdown.classList.toggle('show');
});

logoutBtn.addEventListener('click', async () => {
  await logOut();
  window.location.replace('login.html');
});

// ==========================================
// STORAGE UPGRADE & UPI PAYMENT INTEGRATION
// ==========================================
function openPlansModal() {
  plansModal.classList.add('show');
}

[openPlansModalBtn, sidebarUpgradeBtn, bannerUpgradeBtn, dropdownUpgradeBtn].forEach((btn) => {
  if (btn) btn.addEventListener('click', openPlansModal);
});

document.querySelectorAll('.select-plan-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    const plan = btn.dataset.plan;
    const name = btn.dataset.name;
    const amount = btn.dataset.amount;
    openUpiPayment(plan, name, amount);
  });
});

function openUpiPayment(planKey, planName, amount) {
  activePlan = { key: planKey, name: planName, amount };
  plansModal.classList.remove('show');

  upiModalPlanTitle.textContent = `Upgrade to ${planName}`;
  upiModalAmountText.textContent = `Pay: ₹${amount} / month`;

  const upiUrl = `upi://pay?pa=shivenpanwar@fam&pn=Zulora%20Drive&am=${amount}&cu=INR&tn=Zulora%20Drive%20${encodeURIComponent(planName)}`;
  payUpiDeepLink.href = upiUrl;

  // Generate dynamic QR Code for UPI
  const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(upiUrl)}`;
  upiQrCodeImg.src = qrApiUrl;

  // WhatsApp link with prefilled context
  const whatsappUrl = `https://wa.me/919999999999?text=Hello%20Zulora%20Support%2C%20I%20have%20paid%20%E2%82%B9${amount}%20for%20${encodeURIComponent(planName)}%20storage%20upgrade.`;
  document.getElementById('whatsappHelpLink').href = whatsappUrl;

  utrInput.value = '';
  upiModal.classList.add('show');
}

copyUpiBtn.addEventListener('click', () => {
  navigator.clipboard.writeText('shivenpanwar@fam');
  copyUpiBtn.innerHTML = '<i class="fa-solid fa-check"></i> Copied!';
  setTimeout(() => {
    copyUpiBtn.innerHTML = '<i class="fa-regular fa-copy"></i> Copy';
  }, 2000);
});

upiConfirmForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const utr = utrInput.value.trim();
  if (!utr || !activePlan) return;

  const submitUtrBtn = document.getElementById('submitUtrBtn');
  submitUtrBtn.disabled = true;
  submitUtrBtn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Submitting...';

  try {
    const res = await api('/api/upgrade-requests', {
      method: 'POST',
      body: JSON.stringify({
        plan: activePlan.key,
        paymentReference: utr
      })
    });

    upiModal.classList.remove('show');
    alert(`Thank you! Your payment request for ${activePlan.name} (UTR: ${utr}) has been submitted. Our team will verify and activate your extra storage immediately.`);
  } catch (err) {
    alert(err.message || 'Failed to submit payment request.');
  } finally {
    submitUtrBtn.disabled = false;
    submitUtrBtn.innerHTML = '<i class="fa-solid fa-check"></i> Submit Verification Request';
  }
});

// ==========================================
// ADMIN CONSOLE
// ==========================================
adminDashboardBtn.addEventListener('click', async () => {
  userDropdown.classList.remove('show');
  adminModal.classList.add('show');

  try {
    const [overview, usersData] = await Promise.all([
      api('/api/admin/overview'),
      api('/api/admin/users')
    ]);

    adminTotalUsers.textContent = overview.users || 0;
    adminTotalFiles.textContent = overview.files || 0;
    adminTotalStorage.textContent = formatBytes(overview.storageUsed || 0);

    adminUsersTableBody.innerHTML = '';
    (usersData.users || []).forEach((u) => {
      const tr = document.createElement('tr');
      const usedFormatted = formatBytes(u.usedStorageBytes || u.storageUsed || 0);
      const limitGb = Math.round((u.storageLimitBytes || u.storageLimit || 0) / (1024 ** 3));

      tr.innerHTML = `
        <td style="font-weight: 500;">${u.email}</td>
        <td>${usedFormatted}</td>
        <td><b>${limitGb} GB</b></td>
        <td>
          <button class="btn btn-azure-soft" style="height: 28px; padding: 0 8px; font-size: 0.78rem;" data-uid="${u.uid}" data-email="${u.email}" data-limit="${limitGb}">
            Edit Quota
          </button>
        </td>
      `;

      tr.querySelector('button').addEventListener('click', () => {
        promptEditQuota(u.uid, u.email, limitGb);
      });

      adminUsersTableBody.appendChild(tr);
    });
  } catch (err) {
    console.error('Admin fetch error:', err);
    alert('Failed to load admin data: ' + err.message);
  }
});

async function promptEditQuota(uid, email, currentGb) {
  const input = prompt(`Enter new storage quota in GB for ${email}:`, currentGb);
  if (!input) return;
  const newGb = parseInt(input, 10);
  if (isNaN(newGb) || newGb < 1 || newGb > 50000) {
    alert('Please enter a valid number between 1 and 50000.');
    return;
  }

  try {
    await api('/api/admin/update-quota', {
      method: 'POST',
      body: JSON.stringify({ uid, storageLimitGb: newGb })
    });
    alert(`Storage quota for ${email} updated to ${newGb} GB.`);
    adminDashboardBtn.click(); // refresh
  } catch (err) {
    alert(err.message || 'Failed to update quota.');
  }
}

// ==========================================
// MODAL CLOSE CONTROLS
// ==========================================
document.querySelectorAll('.modal-close').forEach((btn) => {
  btn.addEventListener('click', (e) => {
    const modal = e.target.closest('.modal-backdrop');
    if (modal) modal.classList.remove('show');
  });
});

document.querySelectorAll('.modal-backdrop').forEach((modal) => {
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.classList.remove('show');
  });
});

