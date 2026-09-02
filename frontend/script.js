import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js';
import {
  GoogleAuthProvider,
  getAuth,
  onAuthStateChanged,
  setPersistence,
  browserLocalPersistence,
  signInWithPopup,
  signOut
} from 'https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js';

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
const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

const API_BASE = String(
  window.ZULORA_API_BASE_URL || document.querySelector('meta[name="zulora-api-base"]')?.content ||
  (window.location.protocol === 'file:' ? 'http://localhost:5000' : window.location.origin)
).replace(/\/$/, '');
const PLANS = {
  starter: { label: 'Starter', amount: 0, storage: 10 },
  storage_lite: { label: 'Storage Lite', amount: 70, storage: 50 },
  business_pro: { label: 'Business Pro', amount: 140, storage: 100 },
  ultra_max: { label: 'Ultra Max', amount: 240, storage: 200 }
};
const WHATSAPP = '916395211325';
const UPI_ID = 'shivenpanwar@fam';

let currentUser = null;
let currentProfile = null;
let previewUrl = null;
let selectedFile = null;
let toastTimer = null;

function $(selector, parent = document) { return parent.querySelector(selector); }
function $all(selector, parent = document) { return [...parent.querySelectorAll(selector)]; }

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  }[character]));
}

function formatBytes(bytes) {
  const value = Number(bytes || 0);
  if (!value) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  return `${(value / (1024 ** index)).toFixed(index ? 1 : 0)} ${units[index]}`;
}

function initials(name) {
  return String(name || 'ZD').split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'ZD';
}

function showToast(message, isError = false) {
  const toast = $('#toast');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.toggle('error', isError);
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => { toast.hidden = true; }, 4500);
}

function showModal(id) { const modal = document.getElementById(id); if (modal) modal.hidden = false; }
function closeModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.hidden = true;
  if (id === 'previewModal' && previewUrl) {
    URL.revokeObjectURL(previewUrl);
    previewUrl = null;
    selectedFile = null;
  }
}

async function getToken() {
  const user = auth.currentUser || currentUser;
  if (!user) throw new Error('Please sign in to continue.');
  return user.getIdToken();
}

async function api(path, options = {}) {
  const headers = new Headers(options.headers || {});
  headers.set('Authorization', `Bearer ${await getToken()}`);
  if (options.body && !(options.body instanceof FormData) && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const response = await fetch(`${API_BASE}${path}`, { ...options, headers });
  if (response.status === 204) return null;
  const contentType = response.headers.get('content-type') || '';
  const payload = contentType.includes('application/json') ? await response.json() : null;
  if (!response.ok) throw new Error(payload?.error || 'The request could not be completed.');
  return payload;
}

async function bootstrapUser() {
  if (!auth.currentUser) throw new Error('Please sign in to continue.');
  const data = await api('/api/users/me/bootstrap', {
    method: 'POST',
    body: JSON.stringify({ displayName: auth.currentUser.displayName || '', photoURL: auth.currentUser.photoURL || '' })
  });
  currentProfile = data.profile;
  return currentProfile;
}

async function authenticatedBlob(file) {
  const response = await fetch(`${API_BASE}/api/files/${encodeURIComponent(file.id)}/content`, {
    headers: { Authorization: `Bearer ${await getToken()}` }
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || 'Unable to retrieve this file.');
  }
  return response.blob();
}

function fileType(file) {
  const mime = String(file.mimetype || '').toLowerCase();
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/') || mime.startsWith('audio/')) return 'media';
  return 'document';
}

function fileIcon(file) {
  const type = fileType(file);
  if (type === 'image') return 'fa-regular fa-image';
  if (String(file.mimetype || '').startsWith('video/')) return 'fa-solid fa-film';
  if (String(file.mimetype || '').startsWith('audio/')) return 'fa-solid fa-headphones';
  if (String(file.mimetype || '').includes('pdf')) return 'fa-regular fa-file-pdf';
  if (String(file.originalName || '').match(/\.(zip|rar|7z|tar|gz)$/i)) return 'fa-solid fa-file-zipper';
  return 'fa-regular fa-file-lines';
}

async function setupLoginPage() {
  const button = $('#googleSignInButton');
  const message = $('#authMessage');
  if (!button) return;
  try { await setPersistence(auth, browserLocalPersistence); } catch (error) { console.warn('Unable to set auth persistence.', error); }

  button.addEventListener('click', async () => {
    button.disabled = true;
    message.textContent = '';
    try {
      await signInWithPopup(auth, googleProvider);
      await bootstrapUser();
      window.location.assign('index.html');
    } catch (error) {
      console.error(error);
      message.textContent = error.code === 'auth/popup-closed-by-user' ? 'Sign-in was cancelled.' : (error.message || 'Google sign-in failed. Please try again.');
    } finally { button.disabled = false; }
  });

  onAuthStateChanged(auth, async (user) => {
    currentUser = user;
    if (!user) return;
    button.disabled = true;
    message.textContent = 'Opening your secure drive…';
    try {
      await bootstrapUser();
      window.location.replace('index.html');
    } catch (error) {
      message.textContent = error.message || 'Your account could not be initialized.';
      button.disabled = false;
    }
  });
}

function setupDrivePage() {
  const state = { files: [], filter: 'all', query: '', sort: 'recent' };
  const grid = $('#fileGrid');
  const empty = $('#emptyState');
  const viewTitle = $('#viewTitle');
  const input = $('#fileInput');

  function filteredFiles() {
    const query = state.query.toLocaleLowerCase();
    const files = state.files.filter((file) => {
      if (state.filter === 'starred' && !file.isStarred) return false;
      if (['image', 'video', 'document'].includes(state.filter)) {
        if (state.filter === 'video' && fileType(file) !== 'media') return false;
        if (state.filter !== 'video' && fileType(file) !== state.filter) return false;
      }
      return !query || String(file.originalName).toLocaleLowerCase().includes(query);
    });
    return files.sort((a, b) => {
      if (state.sort === 'name') return a.originalName.localeCompare(b.originalName);
      if (state.sort === 'size') return b.size - a.size;
      return new Date(b.uploadedAt || 0) - new Date(a.uploadedAt || 0);
    });
  }

  function render() {
    const visible = filteredFiles();
    grid.innerHTML = visible.map((file) => `
      <article class="file-card glass" data-file-id="${escapeHtml(file.id)}" tabindex="0" role="button" aria-label="Open ${escapeHtml(file.originalName)}">
        <button class="star-button ${file.isStarred ? 'is-starred' : ''}" data-star-id="${escapeHtml(file.id)}" type="button" aria-label="${file.isStarred ? 'Remove from' : 'Add to'} starred"><i class="${file.isStarred ? 'fa-solid' : 'fa-regular'} fa-star"></i></button>
        <div class="file-icon"><i class="${fileIcon(file)}"></i></div>
        <h3 title="${escapeHtml(file.originalName)}">${escapeHtml(file.originalName)}</h3>
        <p>${formatBytes(file.size)} · ${file.uploadedAt ? new Date(file.uploadedAt).toLocaleDateString() : 'Just now'}</p>
      </article>`).join('');
    empty.hidden = visible.length > 0;
  }

  function renderProfile() {
    const profile = currentProfile;
    if (!profile) return;
    $('#userName').textContent = profile.displayName || profile.email;
    $('#userAvatar').textContent = initials(profile.displayName || profile.email);
    $('#accountId').textContent = profile.accountId || '—';
    $('#tierLabel').textContent = PLANS[profile.tier]?.label || profile.tier || 'Starter';
    $('#storageText').textContent = `${formatBytes(profile.storageUsed)} of ${formatBytes(profile.storageLimit)} used`;
    $('#storageMeter').style.width = `${Math.min(100, (Number(profile.storageUsed) / Number(profile.storageLimit || 1)) * 100)}%`;
  }

  async function refresh() {
    const data = await api('/api/files');
    state.files = data.files || [];
    render();
  }

  function setProgress(file, percentage, visible = true) {
    $('#uploadProgress').hidden = !visible;
    $('#uploadFileName').textContent = file?.name || 'Uploading…';
    $('#uploadPercent').textContent = `${percentage}%`;
    $('#uploadProgressBar').style.width = `${percentage}%`;
  }

  async function uploadOne(file) {
    const token = await getToken();
    return new Promise((resolve, reject) => {
      const form = new FormData();
      form.append('file', file, file.name);
      const request = new XMLHttpRequest();
      request.open('POST', `${API_BASE}/api/files`);
      request.setRequestHeader('Authorization', `Bearer ${token}`);
      request.upload.onprogress = (event) => { if (event.lengthComputable) setProgress(file, Math.round((event.loaded / event.total) * 100)); };
      request.onerror = () => reject(new Error('Network error during upload.'));
      request.onload = () => {
        let response = {};
        try { response = JSON.parse(request.responseText || '{}'); } catch { /* handled below */ }
        if (request.status >= 200 && request.status < 300) resolve(response.file);
        else reject(new Error(response.error || 'Upload failed.'));
      };
      request.send(form);
    });
  }

  async function uploadFiles(files) {
    const queue = [...files].filter(Boolean);
    if (!queue.length) return;
    try {
      for (const file of queue) {
        setProgress(file, 0);
        const result = await uploadOne(file);
        state.files.unshift(result);
      }
      setProgress(queue[queue.length - 1], 100);
      const userData = await api('/api/users/me');
      currentProfile = userData.profile;
      renderProfile();
      render();
      showToast(`${queue.length} file${queue.length === 1 ? '' : 's'} uploaded securely.`);
    } catch (error) {
      showToast(error.message || 'Upload failed.', true);
    } finally {
      window.setTimeout(() => { $('#uploadProgress').hidden = true; }, 900);
      input.value = '';
    }
  }

  async function openPreview(file) {
    selectedFile = file;
    $('#previewTitle').textContent = file.originalName;
    $('#previewMeta').textContent = `${formatBytes(file.size)} · ${file.mimetype || 'File'}`;
    const content = $('#previewContent');
    content.innerHTML = '<div class="preview-fallback"><i class="fa-solid fa-spinner fa-spin"></i><p>Loading private preview…</p></div>';
    showModal('previewModal');
    try {
      const blob = await authenticatedBlob(file);
      if (!selectedFile || selectedFile.id !== file.id) return;
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      previewUrl = URL.createObjectURL(blob);
      content.innerHTML = '';
      const mime = String(file.mimetype || '').toLowerCase();
      let viewer;
      if (mime.startsWith('image/')) { viewer = document.createElement('img'); viewer.alt = file.originalName; viewer.src = previewUrl; }
      else if (mime.startsWith('video/')) { viewer = document.createElement('video'); viewer.src = previewUrl; viewer.controls = true; viewer.autoplay = true; }
      else if (mime.startsWith('audio/')) { viewer = document.createElement('audio'); viewer.src = previewUrl; viewer.controls = true; }
      else if (mime === 'application/pdf') { viewer = document.createElement('iframe'); viewer.title = file.originalName; viewer.src = previewUrl; }
      else {
        viewer = document.createElement('div');
        viewer.className = 'preview-fallback';
        viewer.innerHTML = '<i class="fa-regular fa-file-lines"></i><p>This file type has no browser preview. Download it to open it safely.</p>';
      }
      content.append(viewer);
    } catch (error) {
      content.innerHTML = `<div class="preview-fallback"><p>${escapeHtml(error.message || 'Preview unavailable.')}</p></div>`;
    }
  }

  async function downloadSelected() {
    if (!selectedFile) return;
    try {
      const blob = await authenticatedBlob(selectedFile);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = selectedFile.originalName;
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) { showToast(error.message, true); }
  }

  async function saveFileChange(file, update) {
    const result = await api(`/api/files/${encodeURIComponent(file.id)}`, { method: 'PATCH', body: JSON.stringify(update) });
    const index = state.files.findIndex((item) => item.id === file.id);
    if (index >= 0) state.files[index] = result.file;
    selectedFile = result.file;
    render();
    return result.file;
  }

  $all('[data-filter]').forEach((button) => button.addEventListener('click', () => {
    state.filter = button.dataset.filter;
    state.query = '';
    $('#searchInput').value = '';
    $all('[data-filter]').forEach((item) => item.classList.toggle('active', item === button));
    viewTitle.textContent = button.textContent.trim();
    render();
  }));
  $('#searchInput').addEventListener('input', (event) => { state.query = event.target.value.trim(); render(); });
  $('#sortSelect').addEventListener('change', (event) => { state.sort = event.target.value; render(); });
  $('#newUploadButton').addEventListener('click', () => input.click());
  $('#browseButton').addEventListener('click', () => input.click());
  input.addEventListener('change', (event) => uploadFiles(event.target.files));

  const dropZone = $('#dropZone');
  ['dragenter', 'dragover'].forEach((eventName) => dropZone.addEventListener(eventName, (event) => { event.preventDefault(); dropZone.classList.add('dragging'); }));
  ['dragleave', 'drop'].forEach((eventName) => dropZone.addEventListener(eventName, (event) => { event.preventDefault(); dropZone.classList.remove('dragging'); }));
  dropZone.addEventListener('drop', (event) => uploadFiles(event.dataTransfer.files));

  grid.addEventListener('click', async (event) => {
    const star = event.target.closest('[data-star-id]');
    const card = event.target.closest('[data-file-id]');
    if (!card) return;
    const file = state.files.find((item) => item.id === card.dataset.fileId);
    if (!file) return;
    try {
      if (star) { event.stopPropagation(); await saveFileChange(file, { isStarred: !file.isStarred }); return; }
      await openPreview(file);
    } catch (error) { showToast(error.message, true); }
  });
  grid.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.target.click(); } });
  $('#downloadButton').addEventListener('click', downloadSelected);
  $('#renameButton').addEventListener('click', async () => {
    if (!selectedFile) return;
    const name = window.prompt('Rename file', selectedFile.originalName);
    if (!name || name.trim() === selectedFile.originalName) return;
    try { const file = await saveFileChange(selectedFile, { originalName: name.trim() }); $('#previewTitle').textContent = file.originalName; showToast('File renamed.'); } catch (error) { showToast(error.message, true); }
  });
  $('#deleteButton').addEventListener('click', async () => {
    if (!selectedFile || !window.confirm(`Delete “${selectedFile.originalName}”? This cannot be undone.`)) return;
    try {
      await api(`/api/files/${encodeURIComponent(selectedFile.id)}`, { method: 'DELETE' });
      state.files = state.files.filter((file) => file.id !== selectedFile.id);
      const userData = await api('/api/users/me');
      currentProfile = userData.profile;
      renderProfile(); render(); closeModal('previewModal'); showToast('File deleted.');
    } catch (error) { showToast(error.message, true); }
  });
  $('#signOutButton').addEventListener('click', async () => { await signOut(auth); window.location.assign('login.html'); });
  $all('[data-close-modal]').forEach((button) => button.addEventListener('click', () => closeModal(button.dataset.closeModal)));

  async function loadAdmin() {
    if (!currentProfile?.isAdmin) return;
    const panel = $('#adminPanel');
    panel.hidden = false;
    try {
      const [overview, users, files, requests] = await Promise.all([api('/api/admin/overview'), api('/api/admin/users'), api('/api/admin/files'), api('/api/admin/upgrade-requests')]);
      $('#adminSummary').innerHTML = [
        ['Users', overview.users], ['Files', overview.files], ['Storage used', formatBytes(overview.storageUsed)], ['Pending upgrades', overview.pendingUpgradeRequests]
      ].map(([label, value]) => `<div class="stat"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`).join('');
      $('#adminUsers').innerHTML = users.users.map((user) => `<tr>
        <td>${escapeHtml(user.displayName || '—')}<br><span class="muted">${escapeHtml(user.email)}</span></td>
        <td>${escapeHtml(user.accountId || '—')}</td><td>${formatBytes(user.storageUsed)} / ${formatBytes(user.storageLimit)}</td><td>${escapeHtml(PLANS[user.tier]?.label || user.tier)}</td>
        <td><div class="inline-form"><select data-plan-for="${escapeHtml(user.uid)}">${Object.entries(PLANS).map(([key, plan]) => `<option value="${key}" ${user.tier === key ? 'selected' : ''}>${plan.label}</option>`).join('')}</select><button class="button small" data-save-user="${escapeHtml(user.uid)}" type="button">Save</button></div></td>
      </tr>`).join('') || '<tr><td colspan="5">No users found.</td></tr>';
      $('#adminFiles').innerHTML = files.files.map((file) => `<tr><td><code>${escapeHtml(file.storageFolder)}</code></td><td>${escapeHtml(file.originalName)}</td><td>${formatBytes(file.size)}</td><td>${file.uploadedAt ? new Date(file.uploadedAt).toLocaleString() : '—'}</td></tr>`).join('') || '<tr><td colspan="4">No files found.</td></tr>';
      $('#adminRequests').innerHTML = requests.requests.map((request) => `<tr>
        <td>${escapeHtml(request.email)}<br><span class="muted">${escapeHtml(request.accountId)}</span></td><td>${escapeHtml(PLANS[request.plan]?.label || request.plan)}</td>
        <td>${escapeHtml(request.paymentReference || 'Not supplied')}</td><td>${request.createdAt ? new Date(request.createdAt).toLocaleString() : '—'}</td>
        <td>${request.status === 'pending' ? `<button class="button small" data-request="${escapeHtml(request.id)}" data-decision="approved" type="button">Approve</button> <button class="button danger small" data-request="${escapeHtml(request.id)}" data-decision="rejected" type="button">Reject</button>` : escapeHtml(request.status)}</td>
      </tr>`).join('') || '<tr><td colspan="5">No upgrade requests.</td></tr>';
    } catch (error) { showToast(`Admin data: ${error.message}`, true); }
  }

  $('#adminPanel').addEventListener('click', async (event) => {
    const save = event.target.closest('[data-save-user]');
    const decision = event.target.closest('[data-request]');
    try {
      if (save) {
        const uid = save.dataset.saveUser;
        const plan = $(`[data-plan-for="${CSS.escape(uid)}"]`).value;
        save.disabled = true;
        await api(`/api/admin/users/${encodeURIComponent(uid)}`, { method: 'PATCH', body: JSON.stringify({ plan }) });
        await loadAdmin(); showToast('User quota updated.');
      }
      if (decision) {
        await api(`/api/admin/upgrade-requests/${encodeURIComponent(decision.dataset.request)}`, { method: 'PATCH', body: JSON.stringify({ status: decision.dataset.decision }) });
        await loadAdmin(); showToast(`Upgrade request ${decision.dataset.decision}.`);
      }
    } catch (error) { showToast(error.message, true); }
  });

  onAuthStateChanged(auth, async (user) => {
    currentUser = user;
    if (!user) { window.location.replace('login.html'); return; }
    try {
      await bootstrapUser();
      renderProfile();
      await refresh();
      await loadAdmin();
    } catch (error) { showToast(error.message || 'Unable to load your drive.', true); }
  });
}

function setupPricingPage() {
  let activePlan = null;
  function upiUri(plan) {
    const note = `Zulora Drive ${plan.label} | ${currentProfile?.accountId || 'account'}`;
    return `upi://pay?${new URLSearchParams({ pa: UPI_ID, pn: 'Zulora Drive', am: String(plan.amount), cu: 'INR', tn: note }).toString()}`;
  }
  async function openCheckout(planKey) {
    if (!auth.currentUser) { window.location.assign('login.html'); return; }
    try {
      if (!currentProfile) await bootstrapUser();
      activePlan = PLANS[planKey];
      const url = upiUri(activePlan);
      $('#checkoutPlan').textContent = `${activePlan.label} · ₹${activePlan.amount}/month · ${activePlan.storage} GB`;
      $('#checkoutAccount').textContent = currentProfile.accountId;
      $('#upiLink').textContent = url;
      $('#upiAppLink').href = url;
      $('#upiQr').src = `https://api.qrserver.com/v1/create-qr-code/?size=440x440&format=png&data=${encodeURIComponent(url)}`;
      $('#paymentReference').value = '';
      showModal('checkoutModal');
    } catch (error) { showToast(error.message || 'Sign in before selecting a plan.', true); }
  }
  $all('.payment-button').forEach((button) => button.addEventListener('click', () => openCheckout(button.dataset.plan)));
  $all('[data-close-modal]').forEach((button) => button.addEventListener('click', () => closeModal(button.dataset.closeModal)));
  $('#confirmPaymentButton').addEventListener('click', async () => {
    if (!activePlan || !currentProfile) return;
    const button = $('#confirmPaymentButton');
    button.disabled = true;
    try {
      await api('/api/upgrade-requests', { method: 'POST', body: JSON.stringify({ plan: activePlan.key, paymentReference: $('#paymentReference').value.trim() }) });
      const text = `Hello Zulora Drive,%0A%0APlease verify my storage upgrade.%0AAccount ID: ${encodeURIComponent(currentProfile.accountId)}%0APlan: ${encodeURIComponent(activePlan.label)}%0AAmount: ₹${activePlan.amount}%0AUPI ID paid to: ${encodeURIComponent(UPI_ID)}%0A%0AI will attach my payment screenshot and transaction ID here.`;
      window.location.assign(`https://wa.me/${WHATSAPP}?text=${text}`);
    } catch (error) {
      showToast(error.message || 'Unable to submit the upgrade request.', true);
      button.disabled = false;
    }
  });
  onAuthStateChanged(auth, async (user) => {
    currentUser = user;
    if (!user) return;
    try { await bootstrapUser(); } catch (error) { showToast(error.message, true); }
  });
}

const page = document.body.dataset.page;
if (page === 'login') setupLoginPage();
if (page === 'drive') setupDrivePage();
if (page === 'pricing') setupPricingPage();
