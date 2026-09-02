# Zulora Drive

Zulora Drive is a Firebase-authenticated private cloud drive. The browser only receives files through authenticated API calls; upload bytes are kept on the server in a separate directory for each Firebase user.

## What is included

- Google sign-in with Firebase Authentication
- Server-issued account IDs such as `ZUL-123456` and automatic 10 GB Starter quota
- Per-user local storage at `backend/uploads/<Firebase UID>/`
- Server-side token, ownership, quota, download, preview, rename, favourite, and delete checks
- UPI checkout link/QR for `shivenpanwar@fam`, plus a WhatsApp verification hand-off
- Admin-only global statistics, user quota controls, logical server file-tree inspection, and upgrade request approval for `zulora.help@gmail.com`

## Prerequisites

- Node.js 22 or newer
- A Firebase project with Google as an enabled sign-in provider
- Firestore in the Firebase project
- A Firebase Admin service account, or workload/application default credentials on the server

## Run locally

```bash
cd backend
copy .env.example .env
npm ci
npm start
```

Open [http://localhost:5000](http://localhost:5000). The Express server hosts the frontend and API together in local development.

Put the Firebase service-account JSON at `backend/firebase-adminsdk.json` **or** set either `FIREBASE_SERVICE_ACCOUNT_JSON` (the complete JSON, appropriate for a secret manager) or `GOOGLE_APPLICATION_CREDENTIALS` (a path available to the server process). Never commit the key.

Before sign-in works, add the local and production domains to Firebase Authentication's Authorized domains list. In production also set `CORS_ORIGINS` to the exact comma-separated client origins.

## Production notes

This project deliberately stores file bytes on local disk. Deploy the backend to a Node 22+ host with a persistent, access-restricted volume mounted for `UPLOAD_DIR` (or leave it as `backend/uploads`). **Do not run this local-disk backend on Vercel/serverless functions**: their temporary filesystems cannot provide durable Drive storage. For horizontally scaled or serverless production, replace the disk adapter with a private object-store implementation while retaining the same ownership checks.

The browser does not use Firestore directly. A restrictive Firestore rule is appropriate, because only the Admin SDK should access metadata:

```text
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

## Plans

| Plan | Price | Storage |
| --- | ---: | ---: |
| Starter | ₹0 | 10 GB |
| Storage Lite | ₹70/month | 50 GB |
| Business Pro | ₹140/month | 100 GB |
| Ultra Max | ₹240/month | 200 GB |
