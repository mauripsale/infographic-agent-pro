output "bucket_name" {
  value = google_storage_bucket.assets_bucket.name
}

output "artifact_repository" {
  value = "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.backend_repo.repository_id}"
}

output "firebase_web_app_id" {
  value = google_firebase_web_app.default.app_id
}

output "manual_step_encryption_key" {
  value = "ACTION REQUIRED: You must manually add the secret version for 'infographic-agent-encryption-key' using: echo -n $(openssl rand -hex 32) | gcloud secrets versions add infographic-agent-encryption-key --data-file=-"
}
