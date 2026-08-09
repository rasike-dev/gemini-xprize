output "api_url" {
  value = google_cloud_run_v2_service.api.uri
}

output "web_url" {
  value = google_cloud_run_v2_service.web.uri
}

output "worker_url" {
  value = google_cloud_run_v2_service.worker.uri
}

output "sql_connection_name" {
  value = google_sql_database_instance.pg.connection_name
}

output "documents_bucket" {
  value = google_storage_bucket.documents.name
}

output "api_service_account" {
  value       = google_service_account.api.email
  description = "Needed to mint an OIDC token when calling the private worker."
}

output "worker_service_account" {
  value = google_service_account.worker.email
}

output "payhere_notify_url" {
  value       = "${local.api_origin}/api/webhooks/payhere"
  description = "Register this as the Notify URL in the PayHere merchant portal."
}

output "intake_url" {
  value       = "${local.api_origin}/api/intake"
  description = "Inbound inquiry webhook. Each tenant signs with its own derived secret."
}
