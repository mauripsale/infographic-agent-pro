# Terraform Migration Guide

This guide explains how to use the Terraform configuration in the `terraform/` directory to rapidly provision a new Google Cloud environment for Infographic Agent Pro.

## Prerequisites

1.  **Install Terraform:** [Download here](https://developer.hashicorp.com/terraform/install).
2.  **New GCP Project:** Create a new project in the Google Cloud Console.
3.  **Login:**
    ```bash
    gcloud auth application-default login
    gcloud config set project <NEW_PROJECT_ID>
    ```

## Step-by-Step Provisioning

### 1. Initialize and Plan
Navigate to the terraform directory:
```bash
cd terraform
terraform init
```

Create a plan (replace `<NEW_PROJECT_ID>` with your actual ID):
```bash
terraform plan -var="project_id=<NEW_PROJECT_ID>" -out=tfplan
```

### 2. Apply Infrastructure
If the plan looks good, apply it. This will take 5-10 minutes as it enables APIs and creates resources.
```bash
terraform apply tfplan
```

### 3. Post-Terraform Manual Steps (Required)

Terraform handles 95% of the work, but security best practices require a few manual touches.

**A. Set the Encryption Key Secret**
We created the secret container, now generate the random key value:
```bash
# Generate a random 32-byte key and store it in Secret Manager
openssl rand -hex 32 | gcloud secrets versions add infographic-agent-encryption-key --data-file=-
```

**B. Configure Firebase Auth**
Terraform enabled the API, but you must configure the providers console:
1. Go to [Firebase Console](https://console.firebase.google.com/).
2. Select your project.
3. Go to **Authentication** -> **Sign-in method**.
4. Enable **Google**.

**C. Firestore Database**
1. Go to Firestore in GCP Console.
2. If not created automatically, click **Create Database**.
3. Select **Native Mode** and choose region `us-central1`.

### 4. Deploy Application

Now that infrastructure is ready, deploy the code using your CLI or CI/CD.

**Deploy Backend:**
```bash
gcloud builds submit --config cloudbuild.yaml .
```

**Deploy Frontend:**
1. Update `frontend/.firebaserc` with the new project ID.
2. Update `frontend/.env.local` (or build env vars) with the new Firebase config (get it from Project Settings) and the Cloud Run URL.
3. Run:
   ```bash
   firebase deploy
   ```

## What Terraform Configures for You
*   ✅ **APIs:** Enables Cloud Run, Cloud Build, Firestore, Secret Manager, Cloud Trace, etc.
*   ✅ **Storage:** Creates the GCS Bucket with correct CORS settings.
*   ✅ **Registry:** Creates the Artifact Registry for Docker images.
*   ✅ **IAM Security:** automatically grants `Service Account Token Creator` to Cloud Run (fixing the Image Signed URL issue) and `Cloud Trace Agent` permissions.
*   ✅ **Firebase:** Links the GCP project to Firebase.
