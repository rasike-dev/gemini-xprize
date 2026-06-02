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
