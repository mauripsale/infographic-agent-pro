# Infrastructure Migration Guide 🚀

This guide details how to move the **Infographic Agent Pro** application to a new Google Cloud and Firebase environment without changing any code.

## 📋 Prerequisites

You need two new projects (they can be the same GCP project):
1.  **Google Cloud Platform (GCP) Project**: For hosting the Backend (Cloud Run).
2.  **Firebase Project**: For hosting the Frontend and Authentication.

---

## 🛠️ Step 1: Cloud Console Setup

### 1.1 Google Cloud Project
1.  Create a new Project (or select existing).
2.  Enable the following APIs:
    *   **Cloud Run Admin API**
    *   **Artifact Registry API**
    *   **Generative Language API** (Gemini)
    *   **Firestore API**

### 1.2 Firebase Project
1.  Go to [Firebase Console](https://console.firebase.google.com/).
2.  Add a project (select the GCP project created above).
3.  **Authentication**:
    *   Go to *Build > Authentication*.
    *   Click *Get Started*.
    *   Enable **Google** provider.
4.  **Firestore**:
    *   Go to *Build > Firestore Database*.
    *   Click *Create Database* (Start in production mode).
    *   Select a location (e.g., `eur3` or `nam5`).
5.  **Web App Config**:
    *   Go to *Project Settings* (gear icon).
    *   Scroll to *Your apps* -> Click `</>` (Web).
    *   Register app (nickname: "Frontend").
    *   **Keep this tab open**, you will need the `firebaseConfig` values.

### 1.3 Service Account (Critical)
1.  Go to [GCP Console > IAM > Service Accounts](https://console.cloud.google.com/iam-admin/serviceaccounts).
2.  Find the compute service account or create a new one with roles:
    *   *Firebase Hosting Admin*
    *   *Cloud Run Admin*
    *   *Service Account User*
    *   *Artifact Registry Writer*
3.  Click Actions (three dots) -> **Manage Keys**.
4.  **Add Key** -> **Create new key** -> **JSON**.
5.  Save the file (e.g., `service-account.json`). **You will paste this entire content into GitHub.**

---

## 🔑 Step 2: GitHub Secrets Checklist

Go to your GitHub Repository -> **Settings** -> **Secrets and variables** -> **Actions**.
Create the following **Repository Secrets**.

### A. Infrastructure Secrets
| Secret Name | Value Description |
| :--- | :--- |
| `GCP_PROJECT_ID` | The ID of your new Google Cloud Project (e.g., `my-new-project-123`). |
| `FIREBASE_SERVICE_ACCOUNT` | **Paste the entire content** of the JSON file downloaded in Step 1.3. |
| `ENCRYPTION_KEY` | A random 32-byte base64 string for encrypting user API keys. <br>Generate one in Python: `from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())` |

### B. Frontend Configuration (From Step 1.2)
*Copy these values from the Firebase Console "firebaseConfig" object.*

| Secret Name | Value Source |
| :--- | :--- |
| `NEXT_PUBLIC_FIREBASE_API_KEY` | `apiKey` |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | `authDomain` |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | `projectId` |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | `storageBucket` |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | `messagingSenderId` |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | `appId` |

### C. Backend Configuration (Circular Dependency)
*Note: You might need to deploy once to get the Cloud Run URL, then update this secret and re-deploy.*

| Secret Name | Value Description |
| :--- | :--- |
| `NEXT_PUBLIC_BACKEND_URL` | The URL of your Cloud Run service (e.g., `https://infographic-backend-xyz.run.app`). |
| `GOOGLE_API_KEY` | (Optional) A fallback Gemini API Key for system operations (not used for user generation). |

---

## 🚀 Step 3: Launch

1.  Push a commit to `main` (or run "Re-run jobs" in GitHub Actions).
2.  **First Run**: The Frontend might fail to connect if `NEXT_PUBLIC_BACKEND_URL` is wrong.
3.  **Get URL**: Go to GCP Console -> Cloud Run -> Copy the Service URL.
4.  **Update Secret**: Update `NEXT_PUBLIC_BACKEND_URL` in GitHub Secrets.
5.  **Re-run Deploy**: Run the GitHub Action again.

**Done!** Your SaaS is live on the new infrastructure.
