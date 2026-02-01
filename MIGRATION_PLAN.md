# Comprehensive Migration Plan

This guide details the steps to migrate "Infographic Agent Pro" to a new Google Cloud Platform (GCP) and Firebase project.

## Prerequisites
*   A new GCP Project created.
*   Access to the GitHub Repository (Admin/Secrets access).
*   `gcloud` and `firebase` CLI tools installed locally.

---

## Phase 1: GCP Infrastructure Setup (New Project)

1.  **Enable APIs:**
    Run the following in your terminal (ensure you are logged in to the NEW project):
    ```bash
    gcloud config set project <NEW_PROJECT_ID>
    gcloud services enable \
      cloudbuild.googleapis.com \
      artifactregistry.googleapis.com \
      run.googleapis.com \
      secretmanager.googleapis.com \
      firestore.googleapis.com \
      storage.googleapis.com \
      aiplatform.googleapis.com
    ```

2.  **Setup Firestore:**
    *   Go to Console -> Firestore.
    *   Select **Native Mode**.
    *   Choose a region (e.g., `us-central1` or `eur3`).

3.  **Create Artifact Registry:**
    ```bash
    gcloud artifacts repositories create infographic-agent-backend \
      --repository-format=docker \
      --location=us-central1 \
      --description="Docker repository for backend"
    ```

4.  **Create Secrets (Secret Manager):**
    These secrets are injected into Cloud Run at runtime.
    ```bash
    # Generate a random encryption key
    openssl rand -hex 32 | gcloud secrets create infographic-agent-encryption-key --data-file=-

    # Define the GCS bucket name (Backend will create it if missing, but setting it is good practice)
    echo "<NEW_PROJECT_ID>-infographic-assets" | gcloud secrets create infographic-agent-gcs-bucket-name --data-file=-
    ```

5.  **Service Account Permissions:**
    Grant Cloud Build access to Secret Manager:
    ```bash
    PROJECT_NUMBER=$(gcloud projects describe <NEW_PROJECT_ID> --format='value(projectNumber)')
    CLOUD_BUILD_SA="$PROJECT_NUMBER@cloudbuild.gserviceaccount.com"

    gcloud secrets add-iam-policy-binding infographic-agent-encryption-key \
      --member="serviceAccount:$CLOUD_BUILD_SA" \
      --role="roles/secretmanager.secretAccessor"

    gcloud secrets add-iam-policy-binding infographic-agent-gcs-bucket-name \
      --member="serviceAccount:$CLOUD_BUILD_SA" \
      --role="roles/secretmanager.secretAccessor"
    ```

---

## Phase 2: Firebase Setup

1.  **Create Firebase Project:**
    *   Go to [Firebase Console](https://console.firebase.google.com/).
    *   "Add Project" -> Select your existing GCP Project `<NEW_PROJECT_ID>`.
    *   Enable **Authentication** (Google Provider).
    *   Enable **Hosting** (Set up a site).

2.  **Get Credentials:**
    *   Project Settings -> General -> Your Apps -> Web App (Create one).
    *   Copy the `firebaseConfig` object (apiKey, authDomain, etc.). You will need these for GitHub Secrets.

---

## Phase 3: Codebase Updates (Local)

1.  **Update `.firebaserc`:**
    Edit `frontend/.firebaserc`:
    ```json
    {
      "projects": {
        "default": "<NEW_PROJECT_ID>"
      }
    }
    ```

2.  **Deploy Firestore Indexes:**
    ```bash
    firebase use <NEW_PROJECT_ID>
    firebase deploy --only firestore:indexes
    ```

---

## Phase 4: CI/CD Configuration (GitHub)

Go to your GitHub Repository -> Settings -> Secrets and Variables -> Actions. Update/Create the following secrets:

| Secret Name | Value |
| :--- | :--- |
| `GCP_PROJECT_ID` | `<NEW_PROJECT_ID>` |
| `GCP_SERVICE_ACCOUNT` | Email of your WIF-enabled Service Account (or create a new one).* |
| `GCP_WORKLOAD_IDENTITY_PROVIDER` | Path to your WIF Provider.* |
| `NEXT_PUBLIC_BACKEND_URL` | `https://infographic-agent-backend-xyz...run.app` (You might need to deploy once to get this URL, initially use a placeholder). |
| `NEXT_PUBLIC_FIREBASE_API_KEY` | From Phase 2.2 |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | From Phase 2.2 |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | From Phase 2.2 |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | From Phase 2.2 |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | From Phase 2.2 |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | From Phase 2.2 |
| `FIREBASE_SERVICE_ACCOUNT` | (Optional) Service Account JSON for Firebase Deploy action. |

*Note: If setting up WIF (Workload Identity Federation) from scratch for the new project is too complex, you can temporarily use a JSON Key for `google-github-actions/auth`, but WIF is recommended.*

---

## Phase 5: Deployment

1.  **Push Changes:**
    Commit the change to `.firebaserc` and push to `main`.
    ```bash
    git add frontend/.firebaserc
    git commit -m "chore: migrate to <NEW_PROJECT_ID>"
    git push origin main
    ```

2.  **Monitor Build:**
    Watch GitHub Actions.
    *   **Backend Build:** Will deploy to Cloud Run in the new project.
    *   **Frontend Build:** Will build with new env vars and deploy to Firebase Hosting in the new project.

3.  **Finalize Configuration:**
    Once Cloud Run is deployed, get the *actual* Service URL:
    ```bash
    gcloud run services describe infographic-agent-backend --region us-central1 --format='value(status.url)'
    ```
    Update the `NEXT_PUBLIC_BACKEND_URL` GitHub Secret with this URL and re-run the Frontend deploy job (or push an empty commit).

---

## Verification

1.  Open the Firebase Hosting URL.
2.  Sign In (Tests Firebase Auth).
3.  Create a Project (Tests Firestore).
4.  Generate an Image (Tests Backend + Secret Manager + GCS + Vertex AI).
