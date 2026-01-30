# Migration Guide

This document tracks changes required when moving between environments (e.g., from Dev to Prod), switching GCP projects, or updating infrastructure.

## 🚀 Quick Project Switch Guide

The architecture is designed to be **project-agnostic**. You do **not** need to modify the source code logic to switch environments. Just update these 3 configuration points:

### 1. Frontend Connection
The frontend connects to the backend via an Environment Variable. The default hardcoded URL in `page.tsx` is just a fallback.
*   **Action:** Set the `NEXT_PUBLIC_BACKEND_URL` environment variable in your frontend deployment platform (Vercel, Firebase Hosting, or Cloud Run) to your new Backend URL.
    *   *Example:* `https://infographic-agent-backend-new-project-id.us-central1.run.app`

### 2. Firebase Deployment (.firebaserc)
If you use Firebase Hosting, the project alias is stored in `.firebaserc`.
*   **Action:** Edit `.firebaserc` in the `frontend` folder:
    ```json
    {
      "projects": {
        "default": "your-new-project-id"
      }
    }
    ```
    *   *Alternatively:* Run `firebase use <NEW_PROJECT_ID>` in your terminal.

### 3. Backend Deployment (gcloud)
The Python backend automatically detects its GCP Project ID at runtime using the `google-cloud` libraries.
*   **Action:** Before running `gcloud run deploy`, simply switch your active CLI configuration:
    ```bash
    gcloud config set project <NEW_PROJECT_ID>
    # Then deploy as normal
    gcloud run deploy infographic-agent-backend ...
    ```

---

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

## 🔄 CI/CD Pipeline (GitHub Actions & Cloud Build)

The project uses **Kaniko caching** via Cloud Build for fast deployments.

### 1. Enable APIs
Enable the following APIs in your new GCP Project:
*   Cloud Build API
*   Artifact Registry API
*   Cloud Run API
*   Secret Manager API

### 2. Create Artifact Registry
Ensure an Artifact Registry repository exists for Docker images.
*   **Name:** `cloud-run-source-deploy` (Default) or custom.
*   **Format:** Docker
*   **Region:** Same as your Cloud Run service (Default: `us-central1`).

**Important:** If you use a different Region or Repo Name, update `cloudbuild.yaml` substitutions (`_REGION`, `_ARTIFACT_REPO`).

### 3. GitHub Secrets
Configure these secrets in your GitHub Repo:
*   `GCP_PROJECT_ID`: The new Project ID.
*   `GCP_WORKLOAD_IDENTITY_PROVIDER`: Full path to the WIF provider.
*   `GCP_SERVICE_ACCOUNT`: Email of the Service Account used by GitHub Actions (must have `Cloud Build Editor`, `Service Account User`, `Cloud Run Admin`, `Secret Manager Secret Accessor` roles).

### 4. Configure Secrets (Secret Manager)
For security, sensitive environment variables like `ENCRYPTION_KEY` and `GCS_BUCKET_NAME` are managed by Google Secret Manager and injected into Cloud Run at runtime.

1.  **Create Secrets:**
    ```bash
    # Replace with your actual values
    export ENCRYPTION_KEY="your-super-secret-32-byte-key"
    export GCS_BUCKET_NAME="your-gcs-bucket-name"

    gcloud secrets create infographic-agent-encryption-key --data-file=- <<< "$ENCRYPTION_KEY"
gcloud secrets create infographic-agent-gcs-bucket-name --data-file=- <<< "$GCS_BUCKET_NAME"
    ```
    *Note: The secret names (`infographic-agent-encryption-key`, etc.) correspond to the defaults in `cloudbuild.yaml`. If you change them, update the `_ENCRYPTION_KEY_SECRET` and `_GCS_BUCKET_NAME_SECRET` substitutions.*

2.  **Grant Permissions:** The Cloud Build service account needs permission to access these secrets during deployment.
    ```bash
    PROJECT_NUMBER=$(gcloud projects describe $GCP_PROJECT_ID --format='value(projectNumber)')
    GCP_CLOUD_BUILD_SA="$PROJECT_NUMBER@cloudbuild.gserviceaccount.com"

    gcloud secrets add-iam-policy-binding infographic-agent-encryption-key \
      --member="serviceAccount:$GCP_CLOUD_BUILD_SA" \
      --role="roles/secretmanager.secretAccessor"

    gcloud secrets add-iam-policy-binding infographic-agent-gcs-bucket-name \
      --member="serviceAccount:$GCP_CLOUD_BUILD_SA" \
      --role="roles/secretmanager.secretAccessor"
    ```

## 🔐 Environment Variables

Ensure the following secrets/vars are migrated to Cloud Run / Frontend:

### Backend (Cloud Run Secrets)
Managed via Secret Manager (see above).
| Variable | Description |
| :--- | :--- |
| `GOOGLE_CLOUD_PROJECT` | GCP Project ID (Auto-set by Cloud Run). |
| `ENCRYPTION_KEY` | **CRITICAL**: 32-byte string for AES. |
| `GCS_BUCKET_NAME` | The bucket for storing generated images. |
| `FIREBASE_SERVICE_ACCOUNT` | (Optional) Full JSON key (Single Line) if standard auth fails. |

### Frontend (Environment Variables)
These must be set in your CI/CD or Hosting configuration (e.g., `.env.local` for dev, Dashboard vars for prod).

| Variable | Description |
| :--- | :--- |
| `NEXT_PUBLIC_BACKEND_URL` | **Crucial:** The public URL of your Cloud Run service. |
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
