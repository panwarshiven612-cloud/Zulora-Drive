import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

// Firebase Configuration by Shiven
const firebaseConfig = {
    apiKey: "AIzaSyBGOtawcfRqXTm7jw5P3DB0qhJCUTmfyDc",
    authDomain: "zulora-drive.firebaseapp.com",
    projectId: "zulora-drive",
    storageBucket: "zulora-drive.firebasestorage.app",
    messagingSenderId: "715420173020",
    appId: "1:715420173020:web:46245edda3eb0f31edaa19"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

// State Data (Will be connected to your Express API)
let filesData = [
    { name: 'Zulora_Business_Plan.pdf', size: '2.4 MB', icon: 'fa-file-pdf' },
    { name: 'App_UI_Design.fig', size: '15.2 MB', icon: 'fa-image' },
    { name: 'Client_List.xlsx', size: '1.1 MB', icon: 'fa-file-excel' }
];

document.addEventListener('DOMContentLoaded', () => {
    
    // 1. Auth Routing Logic
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const email = document.getElementById('email').value;
            const pass = document.getElementById('password').value;
            
            // Dummy bypass for quick UI testing. Use signInWithEmailAndPassword in prod.
            if(email && pass) {
                window.location.href = 'index.html';
            }
        });
    }

    // 2. Dashboard Logic
    const fileGrid = document.getElementById('fileGrid');
    if (fileGrid) {
        renderFiles(filesData);

        // Upload Logic
        const uploadBtn = document.getElementById('uploadBtn');
        const hiddenInput = document.getElementById('hiddenFileInput');
        
        uploadBtn.addEventListener('click', () => hiddenInput.click());
        
        hiddenInput.addEventListener('change', (e) => {
            const files = e.target.files;
            if(files.length > 0) {
                // Mock Upload Process
                uploadBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Uploading...';
                setTimeout(() => {
                    const newFile = {
                        name: files[0].name,
                        size: (files[0].size / (1024*1024)).toFixed(2) + ' MB',
                        icon: 'fa-file'
                    };
                    filesData.unshift(newFile); // Add to front
                    renderFiles(filesData);
                    updateStorageUI();
                    uploadBtn.innerHTML = '<i class="fas fa-plus"></i> New Upload';
                    alert('File Uploaded Successfully Bhai! ✅');
                }, 1500);
            }
        });

        // Search Logic
        const searchInput = document.getElementById('searchInput');
        searchInput.addEventListener('input', (e) => {
            const query = e.target.value.toLowerCase();
            const filtered = filesData.filter(file => file.name.toLowerCase().includes(query));
            renderFiles(filtered);
        });

        // Profile Modal Logic
        const profileBtn = document.getElementById('profileBtn');
        const profileModal = document.getElementById('profileModal');
        const closeProfile = document.getElementById('closeProfile');
        const saveProfileBtn = document.getElementById('saveProfileBtn');
        const logoutBtn = document.getElementById('logoutBtn');

        profileBtn.addEventListener('click', () => profileModal.classList.add('active'));
        closeProfile.addEventListener('click', () => profileModal.classList.remove('active'));
        
        saveProfileBtn.addEventListener('click', () => {
            const newName = document.getElementById('profileName').value;
            alert(`Profile Updated to: ${newName}`);
            profileModal.classList.remove('active');
        });

        logoutBtn.addEventListener('click', () => {
            window.location.href = 'login.html';
        });
    }
});

// Helper Functions
function renderFiles(data) {
    const grid = document.getElementById('fileGrid');
    grid.innerHTML = '';
    
    if(data.length === 0) {
        grid.innerHTML = '<p style="grid-column: 1/-1; text-align:center; color:#64748b;">No files found.</p>';
        return;
    }

    data.forEach(file => {
        const div = document.createElement('div');
        div.className = 'file-card glass-card';
        div.innerHTML = `
            <i class="fas ${file.icon} fa-3x" style="color: #0ea5e9;"></i>
            <p class="file-name">${file.name}</p>
            <span class="file-size">${file.size}</span>
        `;
        grid.appendChild(div);
    });
}

function updateStorageUI() {
    // Mock updating storage bar after upload
    const fill = document.getElementById('storageFill');
    const usedText = document.getElementById('usedStorage');
    fill.style.width = '55%';
    usedText.innerText = '5.5 GB';
}