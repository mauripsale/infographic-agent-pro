# Migration Guide

This document tracks changes required when moving between environments (e.g., from Dev to Prod) or updating infrastructure.

## 🗄️ Database (Firestore)

This project uses **Firestore in Native Mode** for session persistence and project history.

### 1. Enable Firestore
When setting up a new GCP Project:
1. Go to **Firestore** in the Google Cloud Console.
2. Click **Select Native Mode** (Do NOT select Datastore Mode).
3. Choose a location (e.g., `eur3` or `us-central1`) ideally close to your Cloud Run region.

### 2. Deploy Indexes
The application performs complex queries (e.g., filtering sessions by user/app and sorting by time). These require **Composite Indexes**.

We have defined them in `firestore.indexes.json`. To apply them to your new project:

```bash
# Using Firebase CLI (Recommended)
firebase use <NEW_PROJECT_ID>
firebase deploy --only firestore:indexes
```

*Alternatively*: If you run the app without deploying indexes, the first request to `list_sessions` will fail. Check the Cloud Run logs; Firestore provides a direct URL to create the missing index automatically.

## 🔐 Environment Variables

Ensure the following secrets/vars are migrated to Cloud Run / Frontend:

### Backend (Cloud Run Secrets)
| Variable | Description |
| :--- | :--- |
| `GOOGLE_CLOUD_PROJECT` | GCP Project ID. |
| `ENCRYPTION_KEY` | **CRITICAL**: 32-byte string for AES (user key encryption). |
| `GCS_BUCKET_NAME` | The bucket for storing generated images and user uploads. |
| `FIREBASE_SERVICE_ACCOUNT` | (Optional) Full JSON key, provided as a **single line** (no newlines). |

### Frontend (Environment Variables)
| Variable | Description |
| :--- | :--- |
| `NEXT_PUBLIC_BACKEND_URL` | The public URL of your Cloud Run service. |
| `NEXT_PUBLIC_FIREBASE_API_KEY` | From Firebase Console -> Project Settings. |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | e.g. `<project-id>.firebaseapp.com` |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | Your GCP/Firebase Project ID. |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | e.g. `<project-id>.firebasestorage.app` |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | Numeric ID from config. |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | App ID from Firebase config. |

## 🔑 Authentication

1. **Enable Firebase Auth** in the new project console.
2. Add the **Google** provider (or others as needed).
3. Ensure the Frontend points to the new Firebase Project config via the variables above.