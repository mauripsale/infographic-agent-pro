# --- SECRETS ---

# 1. Encryption Key
resource "google_secret_manager_secret" "encryption_key" {
  secret_id = "infographic-agent-encryption-key"
  replication {
    auto {}
  }
  depends_on = [google_project_service.apis]
}

# 2. GCS Bucket Name (stored as secret for backend injection)
resource "google_secret_manager_secret" "bucket_name_secret" {
  secret_id = "infographic-agent-gcs-bucket-name"
  replication {
    auto {}
  }
  depends_on = [google_project_service.apis]
}

# Set the value of the bucket name secret automatically
resource "google_secret_manager_secret_version" "bucket_name_value" {
  secret = google_secret_manager_secret.bucket_name_secret.id
  secret_data = google_storage_bucket.assets_bucket.name
}


# --- IAM & SERVICE ACCOUNTS ---

# Default Cloud Build Service Account
data "google_project" "project" {}

locals {
  cloud_build_sa = "${data.google_project.project.number}@cloudbuild.gserviceaccount.com"
  cloud_run_sa   = "${data.google_project.project.number}-compute@developer.gserviceaccount.com" # Default Compute SA used by Cloud Run
}

# Grant Cloud Build access to Secrets (needed for deployment)
resource "google_secret_manager_secret_iam_member" "cb_secret_access_key" {
  secret_id = google_secret_manager_secret.encryption_key.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${local.cloud_build_sa}"
}

resource "google_secret_manager_secret_iam_member" "cb_secret_access_bucket" {
  secret_id = google_secret_manager_secret.bucket_name_secret.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${local.cloud_build_sa}"
}

# --- CRITICAL: CLOUD RUN SIGNED URL PERMISSION ---
# This gives the Cloud Run service account the ability to sign GCS URLs (IAM Blob Signing)
resource "google_project_iam_member" "cloud_run_sign_blob" {
  project = var.project_id
  role    = "roles/iam.serviceAccountTokenCreator"
  member  = "serviceAccount:${local.cloud_run_sa}"
}

# Grant Cloud Run access to Trace (for OpenTelemetry)
resource "google_project_iam_member" "cloud_run_trace" {
  project = var.project_id
  role    = "roles/cloudtrace.agent"
  member  = "serviceAccount:${local.cloud_run_sa}"
}
