/**
 * ZULORA DRIVE - ENTERPRISE BACKEND SERVER
 * Developed by: Shiven Panwar (CEO, Zulora AI)
 * Architecture: REST API with Express, Firebase Admin, and Multer
 */

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const multer = require('multer');
const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

// ----------------------------------------------------------------------
// 1. CONFIGURATION & CONSTANTS
// ----------------------------------------------------------------------
const PORT = process.env.PORT || 5000;
const ZULORA_HELPLINE = "+91 6395211325";
const ZULORA_EMAIL = "shivenpanwar412@gmail.com";
const FREE_STORAGE_LIMIT_BYTES = 5 * 1024 * 1024 * 1024; // 5 GB default
const PRO_STORAGE_LIMIT_BYTES = 100 * 1024 * 1024 * 1024; // 100 GB Pro

const app = express();

// Security and Logging Middleware
app.use(helmet());
app.use(cors({ origin: '*' }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));

// ----------------------------------------------------------------------
// 2. FIREBASE ADMIN SDK SETUP
// ----------------------------------------------------------------------
// Bhai, production ke liye 'firebase-adminsdk.json' download karke rakhna
// Firebase Console -> Project Settings -> Service Accounts -> Generate New Private Key
let db = null;

try {
    const serviceAccount = require('./firebase-adminsdk.json'); // Path to your key
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        storageBucket: "zulora-drive.firebasestorage.app"
    });
    db = admin.firestore();
    console.log("🔥 Firebase Admin SDK Initialized Successfully!");
} catch (error) {
    console.warn("⚠️ Warning: Firebase Admin key missing! Running in local mock mode for UI testing.");
    db = null;
}

// ----------------------------------------------------------------------
// 3. FILE UPLOAD CONFIGURATION (MULTER)
// ----------------------------------------------------------------------
// Vercel serverless environment check for /tmp directory
const uploadDir = process.env.VERCEL ? '/tmp' : path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const safeName = file.originalname.replace(/[^a-zA-Z0-9.]/g, '_');
        cb(null, `${uniqueSuffix}-${safeName}`);
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 500 * 1024 * 1024 } // 500MB max per file limit
});

// ----------------------------------------------------------------------
// 4. AUTHENTICATION MIDDLEWARE
// ----------------------------------------------------------------------
// Yeh middleware ensure karega ki sirf verified users API access karein
const verifyToken = async (req, res, next) => {
    const bearerHeader = req.headers['authorization'];
    if (!bearerHeader) {
        return res.status(403).json({ error: "Access Denied: No Token Provided. 🛑" });
    }
    const token = bearerHeader.split(' ')[1];
    try {
        if (db && admin.apps.length > 0) {
            const decodedToken = await admin.auth().verifyIdToken(token);
            req.user = decodedToken;
        } else {
            // Fallback for dev mode
            req.user = { uid: "test-user-id", email: "test@zulora.com" };
        }
        next();
    } catch (error) {
        return res.status(401).json({ error: "Invalid or Expired Token! 🔒" });
    }
};

// ----------------------------------------------------------------------
// 5. CORE API ROUTES
// ----------------------------------------------------------------------

// @route   GET /api/system/info
// @desc    Get system contact info
app.get('/api/system/info', (req, res) => {
    res.json({
        app: "Zulora Drive Enterprise",
        founder: "Shiven Panwar",
        helpline: ZULORA_HELPLINE,
        email: ZULORA_EMAIL,
        status: "Online 🟢"
    });
});

// @route   POST /api/user/profile
// @desc    Create or Update User Profile in Firestore
app.post('/api/user/profile', verifyToken, async (req, res) => {
    const { displayName, photoURL } = req.body;
    try {
        if (!db) return res.json({ success: true, message: "Profile updated (Mock Mode)" });

        const userRef = db.collection('users').doc(req.user.uid);
        const doc = await userRef.get();
        
        if (!doc.exists) {
            // New User Setup
            await userRef.set({
                uid: req.user.uid,
                email: req.user.email,
                displayName: displayName || req.user.email.split('@')[0],
                photoURL: photoURL || "",
                storageUsed: 0,
                storageLimit: FREE_STORAGE_LIMIT_BYTES,
                tier: "free",
                createdAt: admin.firestore.FieldValue.serverTimestamp()
            });
        } else {
            // Update Profile Name
            await userRef.update({
                displayName: displayName,
                photoURL: photoURL
            });
        }
        res.json({ success: true, message: "Profile Synchronized Successfully! ✨" });
    } catch (error) {
        console.error("Profile Error:", error);
        res.status(500).json({ error: "Failed to update profile." });
    }
});

// @route   GET /api/user/storage
// @desc    Get user's storage limits and usage
app.get('/api/user/storage', verifyToken, async (req, res) => {
    try {
        if (!db) {
            return res.json({
                storageUsed: 1024 * 1024 * 500, // 500MB mock
                storageLimit: FREE_STORAGE_LIMIT_BYTES,
                tier: "free"
            });
        }
        
        const userRef = db.collection('users').doc(req.user.uid);
        const doc = await userRef.get();
        
        if (doc.exists) {
            res.json(doc.data());
        } else {
            res.status(404).json({ error: "User record not found." });
        }
    } catch (error) {
        res.status(500).json({ error: "Error fetching storage data." });
    }
});

// @route   POST /api/files/upload
// @desc    Upload file & track storage
app.post('/api/files/upload', verifyToken, upload.single('file'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: "No file detected! 📂" });

    try {
        const fileSize = req.file.size;
        
        if (db) {
            const userRef = db.collection('users').doc(req.user.uid);
            const doc = await userRef.get();
            const userData = doc.data();
            
            // Check limit before saving metadata
            if (userData.storageUsed + fileSize > userData.storageLimit) {
                // Delete the temporarily uploaded file
                fs.unlinkSync(req.file.path);
                return res.status(403).json({ 
                    error: "Storage limit exceeded! Please upgrade your plan. ⚠️" 
                });
            }

            // Save file metadata to Firestore
            const fileData = {
                fileId: uuidv4(),
                uid: req.user.uid,
                originalName: req.file.originalname,
                fileName: req.file.filename,
                size: fileSize,
                mimetype: req.file.mimetype,
                uploadDate: admin.firestore.FieldValue.serverTimestamp(),
                isStarred: false
            };

            await db.collection('files').add(fileData);
            
            // Update user's total storage used
            await userRef.update({
                storageUsed: admin.firestore.FieldValue.increment(fileSize)
            });
        }

        res.json({
            success: true,
            message: "File successfully secured in Zulora Drive! 🚀",
            file: req.file.filename
        });

    } catch (error) {
        console.error("Upload Error:", error);
        res.status(500).json({ error: "Server encountered an issue during upload." });
    }
});

// @route   GET /api/files/list
// @desc    Get all files for user
app.get('/api/files/list', verifyToken, async (req, res) => {
    try {
        if (!db) {
            return res.json({ files: [] });
        }
        
        const filesRef = db.collection('files').where('uid', '==', req.user.uid);
        const snapshot = await filesRef.get();
        
        const filesList = [];
        snapshot.forEach(doc => {
            filesList.push({ id: doc.id, ...doc.data() });
        });
        
        res.json({ files: filesList });
    } catch (error) {
        res.status(500).json({ error: "Failed to retrieve files." });
    }
});

// @route   GET /api/files/search
// @desc    Search files by name
app.get('/api/files/search', verifyToken, async (req, res) => {
    const query = req.query.q ? req.query.q.toLowerCase() : '';
    try {
        if (!db) return res.json({ files: [] });
        
        // Fetch all user files and filter (Firestore doesn't support native partial text search easily)
        const snapshot = await db.collection('files').where('uid', '==', req.user.uid).get();
        const results = [];
        
        snapshot.forEach(doc => {
            const data = doc.data();
            if (data.originalName.toLowerCase().includes(query)) {
                results.push({ id: doc.id, ...data });
            }
        });
        
        res.json({ files: results });
    } catch (error) {
        res.status(500).json({ error: "Search execution failed." });
    }
});

// ----------------------------------------------------------------------
// 6. ADMIN UTILITIES (For Shiven only)
// ----------------------------------------------------------------------

// @route   POST /api/admin/upgrade
// @desc    Manual trigger to upgrade user storage after UPI Payment verification
app.post('/api/admin/upgrade', async (req, res) => {
    const { adminSecret, targetUid, tier } = req.body;
    
    // Simple admin secret check
    if (adminSecret !== process.env.ADMIN_SECRET) {
        return res.status(403).json({ error: "Unauthorized Admin Attempt! 🚨" });
    }

    try {
        let newLimit = FREE_STORAGE_LIMIT_BYTES;
        if (tier === 'pro') newLimit = PRO_STORAGE_LIMIT_BYTES;
        
        if (db) {
            await db.collection('users').doc(targetUid).update({
                tier: tier,
                storageLimit: newLimit
            });
        }
        
        res.json({ success: true, message: `User upgraded to ${tier.toUpperCase()} successfully!` });
    } catch (error) {
        res.status(500).json({ error: "Database update failed." });
    }
});

// 404 Handler
app.use((req, res) => {
    res.status(404).json({ error: "API Endpoint not found in Zulora Drive 🌌" });
});

// ----------------------------------------------------------------------
// 7. SERVER INITIALIZATION
// ----------------------------------------------------------------------
app.listen(PORT, () => {
    console.log(`\n======================================================`);
    console.log(`🚀 ZULORA DRIVE BACKEND IS LIVE!`);
    console.log(`👨‍💻 Founder: Shiven Panwar`);
    console.log(`📞 Support: ${ZULORA_HELPLINE}`);
    console.log(`📧 Email: ${ZULORA_EMAIL}`);
    console.log(`🌍 Server running on Port: ${PORT}`);
    console.log(`======================================================\n`);
});

module.exports = app;