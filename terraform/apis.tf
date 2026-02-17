# Enable necessary APIs
resource "google_project_service" "apis" {
  for_each = toset([
    "cloudresourcemanager.googleapis.com",
    "serviceusage.googleapis.com",
    "iam.googleapis.com",
    "cloudbuild.googleapis.com",
    "run.googleapis.com",
    "artifactregistry.googleapis.com",
    "secretmanager.googleapis.com",
    "firestore.googleapis.com",
    "storage-api.googleapis.com",
    "aiplatform.googleapis.com",
    "cloudtrace.googleapis.com", # For OpenTelemetry Tracing
    "firebase.googleapis.com",
    "identitytoolkit.googleapis.com", # For Firebase Auth
    "securetoken.googleapis.com"
  ])

  project = var.project_id
  service = each.key
  disable_on_destroy = false
}
