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

Ensure the following secrets/vars are migrated to Cloud Run:

| Variable | Description |
| :--- | :--- |
| `GCS_BUCKET_NAME` | The bucket for storing generated images and user uploads. |
| `GOOGLE_CLOUD_PROJECT` | Automatically set by Cloud Run, but needed locally. |

## 🔑 Authentication

1. **Enable Firebase Auth** in the new project console.
2. Add the **Google** provider (or others as needed).
3. Ensure the Frontend (`.env.local`) points to the new Firebase Project config.
