# Artifact Registry for Docker Images
resource "google_artifact_registry_repository" "backend_repo" {
  provider = google-beta
  location      = var.region
  repository_id = "infographic-agent-backend"
  description   = "Docker repository for Infographic Agent Backend"
  format        = "DOCKER"
  
  depends_on = [google_project_service.apis]
}

# GCS Bucket for Assets
resource "google_storage_bucket" "assets_bucket" {
  name          = "${var.project_id}-infographic-assets"
  location      = var.region
  force_destroy = false # Prevent accidental deletion of user data

  uniform_bucket_level_access = true

  cors {
    origin          = ["*"]
    method          = ["GET", "HEAD", "PUT", "POST", "DELETE", "OPTIONS"]
    response_header = ["*"]
    max_age_seconds = 3600
  }

  depends_on = [google_project_service.apis]
}
