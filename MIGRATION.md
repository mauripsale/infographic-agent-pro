# Infrastructure Migration Guide 🚀

This guide details how to move the **Infographic Agent Pro** application to a new Google Cloud and Firebase environment.

## ⚡️ Quick Migration (Automated)

We provide a script to automate the tedious process of setting up GitHub Secrets.

1.  **Prerequisites**:
    *   Install GitHub CLI: `brew install gh` (macOS) or see [docs](https://cli.github.com/).
    *   Authenticate: `gh auth login`.

2.  **Prepare Credentials**:
    *   Copy `env.migration.template` to `.env.migration`.
    *   Fill in all the values (see *Manual Setup* below for where to find them).
    *   **Important**: For `FIREBASE_SERVICE_ACCOUNT`, paste the entire JSON content on a single line.

3.  **Run Automation**:
    ```bash
    ./scripts/setup_secrets.sh .env.migration
    ```

4.  **Deploy**:
    *   Push code to `main` or re-run the GitHub Action.

---

## 🛠️ Manual Setup / Reference

If you prefer to do it manually or need to find the values for the script:

### 1. Cloud Console Setup

#### 1.1 Google Cloud Project
1.  Create a new Project (or select existing).
2.  Enable APIs: **Cloud Run Admin**, **Artifact Registry**, **Generative Language** (Gemini), **Firestore**.

#### 1.2 Firebase Project
1.  Go to [Firebase Console](https://console.firebase.google.com/).
2.  Add project (link to GCP project).
3.  Enable **Authentication** (Google Provider).
4.  Create **Firestore Database**.
5.  Register **Web App** (Get config for `.env.migration`).

#### 1.3 Service Account
1.  [GCP IAM](https://console.cloud.google.com/iam-admin/serviceaccounts): Create/Select service account.
2.  Roles: *Firebase Hosting Admin, Cloud Run Admin, Service Account User, Artifact Registry Writer*.
3.  Keys: Create JSON key -> Save content for `FIREBASE_SERVICE_ACCOUNT`.

### 2. Secrets Checklist (Reference)

| Secret Name | Description |
| :--- | :--- |
| `GCP_PROJECT_ID` | GCP Project ID. |
| `FIREBASE_SERVICE_ACCOUNT` | Full JSON key content. |
| `ENCRYPTION_KEY` | Random 32-byte base64 string. |
| `GOOGLE_API_KEY` | Gemini API Key (System fallback). |
| `NEXT_PUBLIC_BACKEND_URL` | Cloud Run Service URL. |
| `NEXT_PUBLIC_FIREBASE_...` | (6 variables) From Firebase Config. |

---

## 🚀 Final Step: Launch

1.  Trigger GitHub Action.
2.  **Circular Dependency**: If `NEXT_PUBLIC_BACKEND_URL` is unknown, deploy once, get the URL from Cloud Run, update the secret/env file, and re-deploy.