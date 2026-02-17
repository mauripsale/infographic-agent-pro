# Enable Firebase services
resource "google_firebase_project" "default" {
  provider = google-beta
  project  = var.project_id

  depends_on = [google_project_service.apis]
}

# Create Web App in Firebase
resource "google_firebase_web_app" "default" {
  provider = google-beta
  project  = var.project_id
  display_name = "Infographic Agent Pro Frontend"

  depends_on = [google_firebase_project.default]
}

# Note: Firebase Auth (Identity Platform) configuration via Terraform is complex and often requires
# interaction with the Identity Platform API directly or manual console setup for providers (Google, Email).
# We enable the API in apis.tf, but the actual Auth Provider setup is best done manually or via gcloud
# as a post-step to avoid provider instability.
