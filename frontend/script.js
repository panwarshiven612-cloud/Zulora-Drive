(() => {
  const pageName = window.location.pathname.split('/').pop() || 'index.html';
  const storageKey = 'zuloraDriveAuth';
  const fileStorageKey = 'zuloraDriveFiles';

  function parseStoredUser() {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return null;

    try {
      return JSON.parse(raw);
    } catch (error) {
      return null;
    }
  }

  function requireAuth() {
    const user = parseStoredUser();
    if (!user && pageName !== 'login.html') {
      window.location.href = 'login.html';
      return null;
    }
    return user;
  }

  function showToast(message) {
    const toast = document.getElementById('toast');
    if (!toast) return;

    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2200);
  }

  function formatBytes(bytes) {
    if (!Number.isFinite(bytes) || bytes <= 0) return '0 MB';

    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let value = bytes;
    let unitIndex = 0;

    while (value >= 1024 && unitIndex < units.length - 1) {
      value /= 1024;
      unitIndex += 1;
    }

    if (unitIndex <= 1) {
      return `${Math.round(value)} ${units[unitIndex]}`;
    }

    return `${value.toFixed(1)} ${units[unitIndex]}`;
  }

  function getInitials(name) {
    return (name || 'SP')
      .split(' ')
      .filter(Boolean)
      .map((word) => word[0].toUpperCase())
      .slice(0, 2)
      .join('') || 'SP';
  }

  function getFileTypeFromName(fileName) {
    const extension = (fileName.split('.').pop() || '').toLowerCase();
    if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'].includes(extension)) return 'image';
    if (['mp4', 'mov', 'avi', 'mkv', 'webm', 'mp3', 'wav', 'aac'].includes(extension)) return 'media';
    if (['zip', 'rar', '7z', 'tar', 'gz', 'bz2'].includes(extension)) return 'archive';
    if (extension === 'pdf') return 'pdf';
    return 'document';
  }

  function getIconClass(type) {
    if (type === 'image') return 'fas fa-image text-green';
    if (type === 'media') return 'fas fa-film text-purple';
    if (type === 'archive') return 'fas fa-box-archive text-orange';
    if (type === 'pdf') return 'fas fa-file-pdf text-red';
    return 'fas fa-file-lines text-blue';
  }

  function buildInitialFiles() {
    const today = Date.now();
    return [
      { id: 1, name: 'Quarterly Report.pdf', type: 'pdf', size: 2600000, modifiedAt: today - 1000 * 60 * 60 * 2, starred: true, shared: true, category: 'document' },
      { id: 2, name: 'Launch Banner.png', type: 'image', size: 1800000, modifiedAt: today - 1000 * 60 * 60 * 24, starred: false, shared: false, category: 'image' },
      { id: 3, name: 'Product Demo.mov', type: 'media', size: 4200000, modifiedAt: today - 1000 * 60 * 60 * 10, starred: true, shared: true, category: 'media' },
      { id: 4, name: 'Design Assets.zip', type: 'archive', size: 3200000, modifiedAt: today - 1000 * 60 * 60 * 48, starred: false, shared: false, category: 'archive' },
      { id: 5, name: 'Team Notes.docx', type: 'document', size: 900000, modifiedAt: today - 1000 * 60 * 60 * 72, starred: false, shared: true, category: 'document' },
      { id: 6, name: 'Team Calendar.xlsx', type: 'document', size: 1400000, modifiedAt: today - 1000 * 60 * 60 * 96, starred: true, shared: false, category: 'document' }
    ];
  }

  function loadFiles() {
    const raw = localStorage.getItem(fileStorageKey);
    if (!raw) {
      localStorage.setItem(fileStorageKey, JSON.stringify(buildInitialFiles()));
      return buildInitialFiles();
    }

    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) && parsed.length ? parsed : buildInitialFiles();
    } catch (error) {
      return buildInitialFiles();
    }
  }

  function saveFiles(files) {
    localStorage.setItem(fileStorageKey, JSON.stringify(files));
  }

  function setUpAuthPage() {
    const loginForm = document.getElementById('authLoginForm');
    const passwordInput = document.getElementById('loginPassword');
    const togglePasswordBtn = document.getElementById('togglePasswordBtn');
    const alertBox = document.getElementById('authAlert');
    const alertText = document.getElementById('authAlertText');

    if (parseStoredUser()) {
      window.location.href = 'index.html';
      return;
    }

    if (togglePasswordBtn && passwordInput) {
      togglePasswordBtn.addEventListener('click', () => {
        const isPassword = passwordInput.type === 'password';
        passwordInput.type = isPassword ? 'text' : 'password';
        const icon = document.getElementById('togglePasswordIcon');
        if (icon) icon.className = isPassword ? 'fas fa-eye-slash' : 'fas fa-eye';
      });
    }

    if (loginForm) {
      loginForm.addEventListener('submit', (event) => {
        event.preventDefault();

        const emailInput = document.getElementById('loginEmail');
        const passwordInputField = document.getElementById('loginPassword');
        const email = emailInput ? emailInput.value.trim() : '';
        const password = passwordInputField ? passwordInputField.value : '';

        if (!email || !password) {
          if (alertBox && alertText) {
            alertText.textContent = 'Please enter both email and password.';
            alertBox.style.display = 'flex';
          }
          return;
        }

        const user = {
          email,
          displayName: email.split('@')[0] || 'Zulora User',
          authToken: 'mock-demo-token'
        };

        localStorage.setItem(storageKey, JSON.stringify(user));
        window.location.href = 'index.html';
      });
    }
  }

  function setUpPricingPage() {
    const toggle = document.getElementById('billingCycleToggle');
    const labelMonthly = document.getElementById('labelMonthly');
    const labelAnnual = document.getElementById('labelAnnual');

    const plans = [
      {
        id: '50',
        storage: '50 GB',
        monthly: 70,
        yearly: 700,
        priceEl: document.getElementById('plan50PriceText'),
        periodEl: document.getElementById('plan50PeriodText'),
        payBtn: document.getElementById('plan50PayBtn')
      },
      {
        id: '100',
        storage: '100 GB',
        monthly: 140,
        yearly: 1400,
        priceEl: document.getElementById('plan100PriceText'),
        periodEl: document.getElementById('plan100PeriodText'),
        payBtn: document.getElementById('plan100PayBtn')
      },
      {
        id: '200',
        storage: '200 GB',
        monthly: 240,
        yearly: 2400,
        priceEl: document.getElementById('plan200PriceText'),
        periodEl: document.getElementById('plan200PeriodText'),
        payBtn: document.getElementById('plan200PayBtn')
      }
    ];

    const updatePricing = () => {
      const annual = !!(toggle && toggle.checked);

      plans.forEach((plan) => {
        const amount = annual ? plan.yearly : plan.monthly;
        const periodLabel = annual ? '/ year' : '/ month';

        if (plan.priceEl) plan.priceEl.textContent = `₹${amount}`;
        if (plan.periodEl) plan.periodEl.textContent = periodLabel;
        if (plan.payBtn) {
          plan.payBtn.innerHTML = `<i class="fas fa-qrcode"></i> Pay via UPI (₹${amount})`;
          plan.payBtn.setAttribute('href', `upi://pay?pa=shivenpanwar@fam&pn=Zulora%20Drive&tn=${plan.storage}%20Plan&am=${amount}`);
        }
      });

      if (labelMonthly) labelMonthly.classList.toggle('active', !annual);
      if (labelAnnual) labelAnnual.classList.toggle('active', annual);
    };

    if (toggle) toggle.addEventListener('change', updatePricing);
    updatePricing();
  }

  function setUpDashboardPage() {
    const user = requireAuth();
    if (!user) return;

    const userName = user.displayName || user.email?.split('@')[0] || 'Shiven Panwar';
    const userEmail = user.email || 'shivenpanwar412@gmail.com';
    const initials = getInitials(userName);

    const userNameHeader = document.getElementById('userNameHeader');
    const userAvatarInitials = document.getElementById('userAvatarInitials');
    const modalUserName = document.getElementById('modalUserName');
    const modalUserEmail = document.getElementById('modalUserEmail');
    const modalAvatarPreview = document.getElementById('modalAvatarPreview');
    const inputDisplayName = document.getElementById('inputDisplayName');

    if (userNameHeader) userNameHeader.textContent = userName;
    if (userAvatarInitials) userAvatarInitials.textContent = initials;
    if (modalUserName) modalUserName.textContent = userName;
    if (modalUserEmail) modalUserEmail.textContent = userEmail;
    if (modalAvatarPreview) modalAvatarPreview.textContent = initials;
    if (inputDisplayName) inputDisplayName.value = userName;

    const storageMetrics = {
      used: 500 * 1024 * 1024,
      total: 5 * 1024 * 1024 * 1024,
      tier: 'FREE TIER'
    };

    const storageMeterFill = document.getElementById('storageMeterFill');
    const storageUsedText = document.getElementById('storageUsedText');
    const storageTotalText = document.getElementById('storageTotalText');
    const userTierBadge = document.getElementById('userTierBadge');

    const usagePercent = Math.min((storageMetrics.used / storageMetrics.total) * 100, 100);
    if (storageMeterFill) storageMeterFill.style.width = `${usagePercent}%`;
    if (storageUsedText) storageUsedText.textContent = formatBytes(storageMetrics.used);
    if (storageTotalText) storageTotalText.textContent = '5 GB';
    if (userTierBadge) userTierBadge.textContent = storageMetrics.tier;

    const state = {
      files: loadFiles(),
      view: 'grid',
      filter: 'all',
      search: '',
      sort: 'date',
      selectedFileId: null
    };

    const mainGrid = document.getElementById('mainFileGrid');
    const fileCountSummary = document.getElementById('fileCountSummary');
    const globalSearchInput = document.getElementById('globalSearchInput');
    const sortBySelect = document.getElementById('sortBySelect');
    const emptyState = document.getElementById('emptyState');
    const loadingState = document.getElementById('loadingState');
    const profileModal = document.getElementById('profileModal');
    const uploadModal = document.getElementById('uploadModal');
    const globalFileInput = document.getElementById('globalFileInput');
    const previewPanel = document.getElementById('previewPanel');
    const previewTitle = document.getElementById('previewTitle');
    const previewIconLarge = document.getElementById('previewIconLarge');
    const previewType = document.getElementById('previewType');
    const previewSize = document.getElementById('previewSize');
    const previewModified = document.getElementById('previewModified');
    const previewShared = document.getElementById('previewShared');
    const closePreviewBtn = document.getElementById('closePreviewBtn');

    function getFilteredFiles() {
      let files = [...state.files];

      if (state.filter === 'starred') {
        files = files.filter((file) => file.starred);
      } else if (state.filter === 'shared') {
        files = files.filter((file) => file.shared);
      } else if (state.filter !== 'all') {
        files = files.filter((file) => file.category === state.filter || file.type === state.filter);
      }

      if (state.search) {
        const query = state.search.toLowerCase();
        files = files.filter((file) => file.name.toLowerCase().includes(query));
      }

      if (state.sort === 'name') {
        files.sort((a, b) => a.name.localeCompare(b.name));
      } else if (state.sort === 'size') {
        files.sort((a, b) => b.size - a.size);
      } else {
        files.sort((a, b) => b.modifiedAt - a.modifiedAt);
      }

      return files;
    }

    function renderPreviewPanel() {
      const file = state.files.find((item) => item.id === state.selectedFileId) || null;

      if (!previewPanel || !previewTitle || !previewIconLarge || !previewType || !previewSize || !previewModified || !previewShared) return;

      if (!file) {
        previewTitle.textContent = 'Select a file';
        previewIconLarge.innerHTML = '<i class="fas fa-file"></i>';
        previewType.textContent = '—';
        previewSize.textContent = '—';
        previewModified.textContent = '—';
        previewShared.textContent = 'Private';
        previewPanel.classList.remove('active');
        return;
      }

      previewTitle.textContent = file.name;
      previewIconLarge.innerHTML = `<i class="${getIconClass(file.type)}"></i>`;
      previewType.textContent = file.type.toUpperCase();
      previewSize.textContent = formatBytes(file.size);
      previewModified.textContent = new Date(file.modifiedAt).toLocaleDateString();
      previewShared.textContent = file.shared ? 'Shared' : 'Private';
      previewPanel.classList.add('active');
    }

    function renderFiles() {
      if (!mainGrid) return;

      const files = getFilteredFiles();
      if (fileCountSummary) fileCountSummary.textContent = `${files.length} item${files.length === 1 ? '' : 's'}`;

      if (!state.selectedFileId && files[0]) {
        state.selectedFileId = files[0].id;
      }

      if (state.selectedFileId && !files.some((file) => file.id === state.selectedFileId)) {
        state.selectedFileId = files[0] ? files[0].id : null;
      }

      mainGrid.innerHTML = files.length
        ? files.map((file) => `
          <article class="file-card glass-card ${state.view === 'list' ? 'list-view' : ''} ${state.selectedFileId === file.id ? 'selected' : ''}" data-file-id="${file.id}">
            <div class="file-card-top">
              <div class="file-icon-wrapper"><i class="${getIconClass(file.type)}"></i></div>
              <button class="file-fav-btn ${file.starred ? 'active' : ''}" data-fav-id="${file.id}" aria-label="Toggle favorite">
                <i class="fas fa-star"></i>
              </button>
            </div>
            <div class="file-card-body">
              <h4>${file.name}</h4>
              <p>${formatBytes(file.size)} • ${new Date(file.modifiedAt).toLocaleDateString()}</p>
            </div>
          </article>
        `).join('')
        : '';

      if (emptyState) {
        emptyState.style.display = files.length ? 'none' : 'block';
      }

      renderPreviewPanel();

      mainGrid.querySelectorAll('.file-card').forEach((card) => {
        card.addEventListener('click', (event) => {
          if (event.target.closest('.file-fav-btn')) return;
          const fileId = Number(card.dataset.fileId);
          state.selectedFileId = fileId;
          renderFiles();
        });
      });

      mainGrid.querySelectorAll('.file-fav-btn').forEach((button) => {
        button.addEventListener('click', (event) => {
          event.stopPropagation();
          const fileId = Number(button.dataset.favId);
          const file = state.files.find((item) => item.id === fileId);
          if (!file) return;
          file.starred = !file.starred;
          saveFiles(state.files);
          renderFiles();
        });
      });
    }

    const refreshDrive = () => {
      if (loadingState) loadingState.style.display = 'block';
      setTimeout(() => {
        renderFiles();
        if (loadingState) loadingState.style.display = 'none';
      }, 280);
    };

    if (globalSearchInput) {
      globalSearchInput.addEventListener('input', (event) => {
        state.search = event.target.value.trim();
        renderFiles();
      });
    }

    if (sortBySelect) {
      sortBySelect.addEventListener('change', (event) => {
        state.sort = event.target.value;
        renderFiles();
      });
    }

    document.querySelectorAll('.nav-item[data-filter]').forEach((item) => {
      item.addEventListener('click', (event) => {
        event.preventDefault();
        document.querySelectorAll('.nav-item[data-filter]').forEach((nav) => nav.classList.remove('active'));
        item.classList.add('active');
        state.filter = item.dataset.filter || 'all';
        if (state.filter === 'all') {
          document.querySelectorAll('.quick-pill').forEach((pill) => pill.classList.toggle('active', pill.dataset.filter === 'all'));
        }
        renderFiles();
      });
    });

    document.querySelectorAll('.quick-pill').forEach((pill) => {
      pill.addEventListener('click', () => {
        document.querySelectorAll('.quick-pill').forEach((item) => item.classList.remove('active'));
        pill.classList.add('active');
        const filter = pill.dataset.filter || 'all';
        state.filter = filter;
        document.querySelectorAll('.nav-item[data-filter]').forEach((item) => item.classList.toggle('active', (item.dataset.filter || 'all') === filter));
        renderFiles();
      });
    });

    document.querySelectorAll('.view-btn').forEach((button) => {
      button.addEventListener('click', () => {
        document.querySelectorAll('.view-btn').forEach((btn) => btn.classList.remove('active'));
        button.classList.add('active');
        state.view = button.id === 'viewListBtn' ? 'list' : 'grid';
        renderFiles();
      });
    });

    const dismissBannerBtn = document.getElementById('dismissBannerBtn');
    const welcomeBanner = document.getElementById('welcomeBanner');
    if (dismissBannerBtn && welcomeBanner) {
      dismissBannerBtn.addEventListener('click', () => {
        welcomeBanner.style.display = 'none';
      });
    }

    const sidebarUploadBtn = document.getElementById('sidebarUploadBtn');
    const emptyStateUploadBtn = document.getElementById('emptyStateUploadBtn');
    const createFolderBtn = document.getElementById('createFolderBtn');

    if (sidebarUploadBtn && globalFileInput) {
      sidebarUploadBtn.addEventListener('click', () => globalFileInput.click());
    }
    if (emptyStateUploadBtn && globalFileInput) {
      emptyStateUploadBtn.addEventListener('click', () => globalFileInput.click());
    }
    if (createFolderBtn) {
      createFolderBtn.addEventListener('click', () => {
        const folderName = window.prompt('Folder name', 'New Folder');
        if (!folderName || !folderName.trim()) return;
        state.files.unshift({
          id: Date.now() + Math.random(),
          name: folderName.trim(),
          type: 'document',
          size: 0,
          modifiedAt: Date.now(),
          starred: false,
          shared: false,
          category: 'document'
        });
        saveFiles(state.files);
        renderFiles();
        showToast('Folder created');
      });
    }

    if (globalFileInput) {
      globalFileInput.addEventListener('change', (event) => {
        const files = Array.from(event.target.files || []);

        files.forEach((file) => {
          const type = getFileTypeFromName(file.name);
          state.files.unshift({
            id: Date.now() + Math.random(),
            name: file.name,
            type,
            category: type === 'pdf' ? 'document' : type,
            size: file.size,
            modifiedAt: Date.now(),
            starred: false,
            shared: false
          });
        });

        saveFiles(state.files);
        renderFiles();
        if (uploadModal) {
          const uploadName = files[0]?.name || 'file';
          const uploadProgress = document.getElementById('uploadingFileName');
          const uploadPercent = document.getElementById('uploadPercent');
          const uploadFill = document.getElementById('uploadProgressFill');
          if (uploadName) {
            uploadModal.style.display = 'flex';
            if (uploadProgress) uploadProgress.textContent = uploadName;
            if (uploadPercent) uploadPercent.textContent = '100%';
            if (uploadFill) uploadFill.style.width = '100%';
            setTimeout(() => {
              uploadModal.style.display = 'none';
            }, 900);
          }
        }
        showToast(`${files.length} file${files.length > 1 ? 's' : ''} uploaded`);
        event.target.value = '';
      });
    }

    const profileTrigger = document.getElementById('profileTrigger');
    const closeProfileModal = document.getElementById('closeProfileModal');
    const cancelProfileBtn = document.getElementById('cancelProfileBtn');
    const profileUpdateForm = document.getElementById('profileUpdateForm');
    const modalLogoutBtn = document.getElementById('modalLogoutBtn');

    const openProfileModal = () => {
      if (profileModal) profileModal.style.display = 'flex';
    };
    const closeProfileModalFn = () => {
      if (profileModal) profileModal.style.display = 'none';
    };

    if (profileTrigger) profileTrigger.addEventListener('click', openProfileModal);
    if (closeProfileModal) closeProfileModal.addEventListener('click', closeProfileModalFn);
    if (cancelProfileBtn) cancelProfileBtn.addEventListener('click', closeProfileModalFn);

    if (profileUpdateForm) {
      profileUpdateForm.addEventListener('submit', (event) => {
        event.preventDefault();
        const newName = inputDisplayName ? inputDisplayName.value.trim() : userName;
        if (!newName) return;

        const updatedUser = { ...user, displayName: newName };
        localStorage.setItem(storageKey, JSON.stringify(updatedUser));
        const updatedNameDisplay = document.getElementById('userNameHeader');
        if (updatedNameDisplay) updatedNameDisplay.textContent = newName;

        const updatedInitials = getInitials(newName);
        const userAvatar = document.getElementById('userAvatarInitials');
        if (userAvatar) userAvatar.textContent = updatedInitials;
        if (modalAvatarPreview) modalAvatarPreview.textContent = updatedInitials;
        closeProfileModalFn();
        showToast('Profile updated');
      });
    }

    if (modalLogoutBtn) {
      modalLogoutBtn.addEventListener('click', () => {
        localStorage.removeItem(storageKey);
        window.location.href = 'login.html';
      });
    }

    const refreshDriveBtn = document.getElementById('refreshDriveBtn');
    if (refreshDriveBtn) refreshDriveBtn.addEventListener('click', refreshDrive);

    const searchClearBtn = document.getElementById('searchClearBtn');
    if (searchClearBtn && globalSearchInput) {
      searchClearBtn.addEventListener('click', () => {
        globalSearchInput.value = '';
        state.search = '';
        searchClearBtn.style.display = 'none';
        renderFiles();
      });
      globalSearchInput.addEventListener('input', (event) => {
        searchClearBtn.style.display = event.target.value ? 'flex' : 'none';
      });
    }

    if (closePreviewBtn) {
      closePreviewBtn.addEventListener('click', () => {
        state.selectedFileId = null;
        renderFiles();
      });
    }

    const openBtn = document.getElementById('previewOpenBtn');
    if (openBtn) {
      openBtn.addEventListener('click', () => {
        const file = state.files.find((item) => item.id === state.selectedFileId);
        if (!file) return;
        showToast(`Opening ${file.name}`);
      });
    }

    const renameBtn = document.getElementById('previewRenameBtn');
    if (renameBtn) {
      renameBtn.addEventListener('click', () => {
        const file = state.files.find((item) => item.id === state.selectedFileId);
        if (!file) return;
        const newName = window.prompt('Rename file', file.name);
        if (!newName || !newName.trim()) return;
        file.name = newName.trim();
        saveFiles(state.files);
        renderFiles();
        showToast('File renamed');
      });
    }

    const shareBtn = document.getElementById('previewShareBtn');
    if (shareBtn) {
      shareBtn.addEventListener('click', () => {
        const file = state.files.find((item) => item.id === state.selectedFileId);
        if (!file) return;
        file.shared = true;
        saveFiles(state.files);
        renderFiles();
        showToast(`Shared ${file.name}`);
      });
    }

    const deleteBtn = document.getElementById('previewDeleteBtn');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', () => {
        const file = state.files.find((item) => item.id === state.selectedFileId);
        if (!file) return;
        const confirmed = window.confirm(`Delete ${file.name}?`);
        if (!confirmed) return;
        state.files = state.files.filter((item) => item.id !== file.id);
        state.selectedFileId = state.files[0] ? state.files[0].id : null;
        saveFiles(state.files);
        renderFiles();
        showToast('File deleted');
      });
    }

    document.querySelectorAll('.nav-item[data-view]').forEach((item) => {
      item.addEventListener('click', (event) => {
        event.preventDefault();
        document.querySelectorAll('.nav-item[data-view]').forEach((nav) => nav.classList.remove('active'));
        item.classList.add('active');
        const view = item.dataset.view || 'mydrive';
        if (view === 'starred') state.filter = 'starred';
        else if (view === 'shared') state.filter = 'shared';
        else state.filter = 'all';
        if (document.getElementById('currentViewTitle')) {
          document.getElementById('currentViewTitle').textContent = view === 'mydrive' ? 'My Drive' : view.charAt(0).toUpperCase() + view.slice(1);
        }
        renderFiles();
      });
    });

    renderFiles();
  }

  if (pageName.endsWith('login.html')) {
    setUpAuthPage();
  } else if (pageName.endsWith('pricing.html')) {
    setUpPricingPage();
  } else if (pageName.endsWith('index.html') || pageName === '') {
    setUpDashboardPage();
  }
})();
