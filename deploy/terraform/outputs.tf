output "load_balancer_ip" {
  description = "Point both scoreassign.com and *.scoreassign.com at this address"
  value       = google_compute_global_address.default.address
}

output "api_service_url" {
  description = "Direct Cloud Run URL for the API (bypasses the load balancer; useful for smoke tests)"
  value       = google_cloud_run_v2_service.api.uri
}

output "web_service_url" {
  description = "Direct Cloud Run URL for the SPA"
  value       = google_cloud_run_v2_service.web.uri
}

output "artifact_repository" {
  description = "Docker repository that Cloud Build pushes to"
  value       = "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.images.repository_id}"
}

output "runtime_service_account" {
  description = "Service account the Cloud Run revisions run as"
  value       = google_service_account.runtime.email
}
