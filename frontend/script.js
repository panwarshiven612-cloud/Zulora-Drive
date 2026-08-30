import { initializeApp } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";

// Firebase Config
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
const BACKEND_URL = "http://localhost:5000";

let currentUser = null;
let currentTabMode = 'login';
let selectedPlanTier = '50GB';
let selectedPlanPrice = '70';

// Auth Observer
onAuthStateChanged(auth, (user) => {
    currentUser = user;
    const currentPath = window.location.pathname;

    if (user) {
        if (currentPath.includes('login.html')) {
            window.location.href = 'index.html';
        }
        updateUIWithUser(user);
        fetchUserFiles();
    } else {
        if (!currentPath.includes('login.html') && !currentPath.includes('pricing.html')) {
            window.location.href = 'login.html';
        }
    }
});

// Update UI
function updateUIWithUser(user) {
    const avatarInitial = document.getElementById('avatar-initial');
    const modalAvatar = document.getElementById('modal-avatar');
    const userEmail = document.getElementById('user-display-email');
    const userName = document.getElementById('user-display-name');
    const badge = document.getElementById('admin-role-badge');

    const displayName = user.displayName || user.email.split('@')[0];
    const initial = displayName.charAt(0).toUpperCase();

    if (avatarInitial) avatarInitial.innerText = initial;
    if (modalAvatar) modalAvatar.innerText = initial;
    if (userEmail) userEmail.innerText = user.email;
    if (userName) userName.innerText = displayName;

    if (user.email === 'zulora.help@gmail.com' && badge) {
        badge.innerText = "System Admin";
        badge.style.background = "#0ea5e9";
    }
}

// Auth Actions
window.switchAuthTab = function(mode) {
    currentTabMode = mode;
    document.getElementById('tab-login').classList.toggle('active', mode === 'login');
    document.getElementById('tab-signup').classList.toggle('active', mode === 'signup');
    document.getElementById('auth-submit-btn').querySelector('span').innerText = mode === 'login' ? 'Sign In to Drive' : 'Create Account';
};

window.handleAuthSubmit = async function(event) {
    event.preventDefault();
    const email = document.getElementById('auth-email').value;
    const password = document.getElementById('auth-password').value;

    try {
        if (currentTabMode === 'login') {
            await signInWithEmailAndPassword(auth, email, password);
        } else {
            await createUserWithEmailAndPassword(auth, email, password);
        }
    } catch (err) {
        alert("Auth Error: " + err.message);
    }
};

window.handleGoogleSignIn = async function() {
    const provider = new GoogleAuthProvider();
    try {
        await signInWithPopup(auth, provider);
    } catch (err) {
        alert("Google Sign-In Error: " + err.message);
    }
};

window.handleSignOut = function() {
    signOut(auth).then(() => {
        window.location.href = 'login.html';
    });
};

// File Actions Bridge to Node Server
window.triggerFileInput = function() {
    document.getElementById('file-upload-input').click();
};

window.handleFileUpload = async function(event) {
    const files = event.target.files;
    if (!files || files.length === 0 || !currentUser) return;

    const formData = new FormData();
    for (let i = 0; i < files.length; i++) {
        formData.append('files', files[i]);
    }

    try {
        const response = await fetch(`${BACKEND_URL}/api/drive/upload`, {
            method: 'POST',
            headers: {
                'x-user-id': currentUser.uid
            },
            body: formData
        });

        const result = await response.json();
        if (response.ok) {
            alert("Files uploaded successfully!");
            fetchUserFiles();
        } else {
            alert("Upload failed: " + result.error);
        }
    } catch (err) {
        alert("Server error uploading file!");
    }
};

async function fetchUserFiles() {
    if (!currentUser) return;
    const container = document.getElementById('files-list-container');
    if (!container) return;

    try {
        const response = await fetch(`${BACKEND_URL}/api/drive/files`, {
            headers: {
                'x-user-id': currentUser.uid
            }
        });
        const data = await response.json();

        if (data.files && data.files.length > 0) {
            container.innerHTML = data.files.map(file => `
                <div class="file-card">
                    <i class="fa-solid fa-file file-icon"></i>
                    <span class="file-name">${file.fileName}</span>
                    <small>${(file.fileSize / (1024*1024)).toFixed(2)} MB</small>
                </div>
            `).join('');
        }
    } catch (err) {
        console.log("Error loading user files");
    }
}

// Pricing Toggle
window.toggleBillingCycle = function() {
    const isAnnual = document.getElementById('billing-toggle').checked;
    document.getElementById('monthly-label').classList.toggle('active', !isAnnual);
    document.getElementById('annual-label').classList.toggle('active', isAnnual);

    if (isAnnual) {
        document.getElementById('price-50').innerText = '₹600';
        document.getElementById('dur-50').innerText = '/ year';
        document.getElementById('price-100').innerText = '₹1300';
        document.getElementById('dur-100').innerText = '/ year';
        document.getElementById('price-200').innerText = '₹2300';
        document.getElementById('dur-200').innerText = '/ year';
    } else {
        document.getElementById('price-50').innerText = '₹70';
        document.getElementById('dur-50').innerText = '/ month';
        document.getElementById('price-100').innerText = '₹140';
        document.getElementById('dur-100').innerText = '/ month';
        document.getElementById('price-200').innerText = '₹240';
        document.getElementById('dur-200').innerText = '/ month';
    }
};

// UI Modals
window.toggleProfileModal = function() {
    document.getElementById('profile-modal').classList.toggle('active');
};

window.openPaymentModal = function(plan, price) {
    selectedPlanTier = plan;
    selectedPlanPrice = price;
    document.getElementById('payment-modal').classList.toggle('active');
};

window.closePaymentModal = function() {
    document.getElementById('payment-modal').classList.remove('active');
};

window.copyUPI = function() {
    navigator.clipboard.writeText('shivenpanwar@fam');
    alert("UPI ID copied: shivenpanwar@fam");
};

window.redirectToWhatsApp = function() {
    const text = `Hi, I paid for Zulora Drive ${selectedPlanTier} Plan (₹${selectedPlanPrice}). Attached is my transaction screenshot for activation.`;
    window.open(`https://wa.me/916395211325?text=${encodeURIComponent(text)}`, '_blank');
};