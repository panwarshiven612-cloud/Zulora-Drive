const express = require("express");
const cors = require("cors");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const admin = require("firebase-admin");

const app = express();
const PORT = process.env.PORT || 5000;

// Enable JSON & CORS parsing for frontend connectivity
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve Uploaded Files Statically
const UPLOADS_BASE_DIR = path.join(__dirname, "uploads");
if (!fs.existsSync(UPLOADS_BASE_DIR)) {
  fs.mkdirSync(UPLOADS_BASE_DIR, { recursive: true });
}
app.use("/uploads", express.static(UPLOADS_BASE_DIR));

// Configure Disk Storage with Dynamic Per-User Directory Structure
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const userId = req.headers["x-user-id"] || "guest_users";
    const userDir = path.join(UPLOADS_BASE_DIR, userId);
    
    if (!fs.existsSync(userDir)) {
      fs.mkdirSync(userDir, { recursive: true });
    }
    cb(null, userDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, `${file.fieldname}-${uniqueSuffix}${ext}`);
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 100 * 1024 * 1024 } // 100MB max per upload request
});

// ------------------- API ENDPOINTS -------------------

// 1. Health Check Endpoint
app.get("/api/health", (req, res) => {
  res.status(200).json({
    status: "online",
    service: "Zulora Drive Backend Engine",
    timestamp: new Date().toISOString()
  });
});

// 2. File Upload API Endpoint (Supports Single & Multiple Files)
app.post("/api/drive/upload", upload.array("files", 10), (req, res) => {
  try {
    const userId = req.headers["x-user-id"];
    if (!userId) {
      return res.status(400).json({ error: "User ID header (x-user-id) missing" });
    }

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: "No files provided for upload" });
    }

    const uploadedFileData = req.files.map((file) => ({
      originalName: file.originalname,
      serverFileName: file.filename,
      fileSize: file.size,
      mimeType: file.mimetype,
      localFilePath: `/uploads/${userId}/${file.filename}`,
      uploadedAt: new Date()
    }));

    return res.status(200).json({
      message: "Files uploaded successfully",
      count: uploadedFileData.length,
      files: uploadedFileData
    });
  } catch (error) {
    console.error("Upload Server Error:", error);
    return res.status(500).json({ error: "Internal Server Error during upload processing" });
  }
});

// 3. User Storage Folder File Fetching Endpoint
app.get("/api/drive/files", (req, res) => {
  try {
    const userId = req.headers["x-user-id"];
    if (!userId) {
      return res.status(400).json({ error: "User ID header (x-user-id) missing" });
    }

    const userDir = path.join(UPLOADS_BASE_DIR, userId);
    if (!fs.existsSync(userDir)) {
      return res.status(200).json({ files: [] });
    }

    fs.readdir(userDir, (err, files) => {
      if (err) {
        return res.status(500).json({ error: "Unable to read directory" });
      }

      const fileList = files.map((filename) => {
        const filePath = path.join(userDir, filename);
        const stats = fs.statSync(filePath);
        return {
          fileName: filename,
          fileSize: stats.size,
          createdAt: stats.birthtime,
          fileUrl: `/uploads/${userId}/${filename}`
        };
      });

      res.status(200).json({ files: fileList });
    });
  } catch (error) {
    res.status(500).json({ error: "Error fetching user files" });
  }
});

// 4. File Delete API Endpoint
app.delete("/api/drive/delete", (req, res) => {
  try {
    const userId = req.headers["x-user-id"];
    const { filename } = req.body;

    if (!userId || !filename) {
      return res.status(400).json({ error: "Missing required parameters (userId / filename)" });
    }

    const filePath = path.join(UPLOADS_BASE_DIR, userId, filename);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      return res.status(200).json({ message: "File successfully deleted from local storage" });
    } else {
      return res.status(404).json({ error: "File not found" });
    }
  } catch (error) {
    return res.status(500).json({ error: "Error deleting file" });
  }
});

// Start Node Server
app.listen(PORT, () => {
  console.log(`=================================================`);
  console.log(`🚀 Zulora Drive Server Running on Port: ${PORT}`);
  console.log(`📁 Local Storage Base Directory: ${UPLOADS_BASE_DIR}`);
  console.log(`=================================================`);
});