(() => {
  const pageName = window.location.pathname.split('/').pop() || 'index.html';
  const storageKey = 'zuloraDriveAuth';

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

  function formatBytes(bytes) {
    if (!Number.isFinite(bytes) || bytes <= 0) return '0 MB';

    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let value = bytes;
    let unitIndex = 0;

    while (value >= 1024 && unitIndex < units.length - 1) {
      value /= 1024;
      unitIndex += 1;
    }

    if (unitIndex === 0) return `${Math.round(value)} ${units[unitIndex]}`;
    if (unitIndex < 2) return `${Math.round(value)} ${units[unitIndex]}`;
    return `${value.toFixed(1)} ${units[unitIndex]}`;
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
        if (icon) {
          icon.className = isPassword ? 'fas fa-eye-slash' : 'fas fa-eye';
        }
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
    const proPriceText = document.getElementById('proPriceText');
    const proPeriodText = document.getElementById('proPeriodText');
    const proPayBtn = document.getElementById('proPayBtn');
    const labelMonthly = document.getElementById('labelMonthly');
    const labelAnnual = document.getElementById('labelAnnual');

    const updatePricing = () => {
      const annual = Boolean(toggle && toggle.checked);
      const price = annual ? 79 : 99;
      const periodLabel = annual ? '/ month, billed yearly' : '/ month';

      if (proPriceText) proPriceText.textContent = `₹${price}`;
      if (proPeriodText) proPeriodText.textContent = periodLabel;
      if (proPayBtn) {
        proPayBtn.innerHTML = `<i class="fas fa-qrcode"></i> Pay via UPI (₹${price})`;
        const amountParam = annual ? '79' : '99';
        proPayBtn.setAttribute('href', `upi://pay?pa=shivenpanwar@fam&pn=Zulora%20Drive&tn=Pro%20100GB%20Upgrade&am=${amountParam}`);
      }

      if (labelMonthly) labelMonthly.classList.toggle('active', !annual);
      if (labelAnnual) labelAnnual.classList.toggle('active', annual);
    };

    if (toggle) {
      toggle.addEventListener('change', updatePricing);
    }

    updatePricing();
  }

  function setUpDashboardPage() {
    const user = requireAuth();
    if (!user) return;

    const userName = user.displayName || user.email?.split('@')[0] || 'Shiven Panwar';
    const userEmail = user.email || 'shivenpanwar412@gmail.com';
    const initials = userName
      .split(' ')
      .map((segment) => segment.charAt(0).toUpperCase())
      .slice(0, 2)
      .join('') || 'SP';

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

    const getMockFiles = () => [
      { id: 1, name: 'Quarterly Report.pdf', type: 'pdf', size: 2600000, modifiedAt: Date.now() - 1000 * 60 * 60 * 2 },
      { id: 2, name: 'Launch Banner.png', type: 'image', size: 1800000, modifiedAt: Date.now() - 1000 * 60 * 60 * 24 },
      { id: 3, name: 'Product Demo.mov', type: 'media', size: 4200000, modifiedAt: Date.now() - 1000 * 60 * 60 * 10 },
      { id: 4, name: 'Design Assets.zip', type: 'archive', size: 3200000, modifiedAt: Date.now() - 1000 * 60 * 60 * 48 },
      { id: 5, name: 'Team Notes.docx', type: 'document', size: 900000, modifiedAt: Date.now() - 1000 * 60 * 60 * 72 }
    ];

    const state = {
      files: getMockFiles(),
      view: 'grid',
      filter: 'all',
      search: '',
      sort: 'date'
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

    function getIconClass(type) {
      if (type === 'image') return 'fas fa-image text-green';
      if (type === 'media') return 'fas fa-film text-purple';
      if (type === 'archive') return 'fas fa-box-archive text-orange';
      if (type === 'pdf') return 'fas fa-file-pdf text-red';
      return 'fas fa-file-lines text-blue';
    }

    function renderFiles() {
      if (!mainGrid) return;

      let files = [...state.files];

      if (state.filter !== 'all') {
        files = files.filter((file) => file.type === state.filter);
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

      if (fileCountSummary) fileCountSummary.textContent = `${files.length} item${files.length === 1 ? '' : 's'}`;

      mainGrid.innerHTML = files.length
        ? files.map((file) => `
          <article class="file-card glass-card ${state.view === 'list' ? 'list-view' : ''}" data-file-id="${file.id}">
            <div class="file-card-top">
              <div class="file-icon-wrapper"><i class="${getIconClass(file.type)}"></i></div>
              <button class="file-fav-btn"><i class="fas fa-star"></i></button>
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
    }

    const refreshDrive = () => {
      if (loadingState) loadingState.style.display = 'block';
      setTimeout(() => {
        renderFiles();
        if (loadingState) loadingState.style.display = 'none';
      }, 300);
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
    if (sidebarUploadBtn && globalFileInput) {
      sidebarUploadBtn.addEventListener('click', () => globalFileInput.click());
    }
    if (emptyStateUploadBtn && globalFileInput) {
      emptyStateUploadBtn.addEventListener('click', () => globalFileInput.click());
    }

    if (globalFileInput) {
      globalFileInput.addEventListener('change', (event) => {
        const files = Array.from(event.target.files || []);

        files.forEach((file) => {
          state.files.unshift({
            id: Date.now() + Math.random(),
            name: file.name,
            type: file.type.includes('image') ? 'image' : file.type.includes('video') ? 'media' : file.type.includes('zip') ? 'archive' : 'document',
            size: file.size,
            modifiedAt: Date.now()
          });
        });

        renderFiles();
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
        closeProfileModalFn();
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
