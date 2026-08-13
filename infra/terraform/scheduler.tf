# Cloud Scheduler -> worker jobs. Authenticated with OIDC as the API SA, which
# is allowed to invoke the private worker service.

resource "google_cloud_scheduler_job" "overdue_scan" {
  name      = "bizopsmate-overdue-scan"
  region    = var.region
  schedule  = "0 9 * * *" # daily 09:00
  time_zone = "Asia/Colombo"

  http_target {
    http_method = "POST"
    uri         = "${google_cloud_run_v2_service.worker.uri}/jobs/overdue-scan"
    oidc_token {
      service_account_email = google_service_account.api.email
      audience              = google_cloud_run_v2_service.worker.uri
    }
  }
  depends_on = [google_project_service.enabled]
}

# Rolls each tenant's monthly agent-run and token counters into a new period.
# The worker also does this lazily on every run, so a missed job here delays a
# reset rather than locking anyone out of the product they are paying for.
resource "google_cloud_scheduler_job" "usage_reset" {
  name      = "bizopsmate-usage-reset"
  region    = var.region
  schedule  = "15 0 * * *" # daily 00:15
  time_zone = "Asia/Colombo"

  http_target {
    http_method = "POST"
    uri         = "${google_cloud_run_v2_service.worker.uri}/jobs/usage-reset"
    oidc_token {
      service_account_email = google_service_account.api.email
      audience              = google_cloud_run_v2_service.worker.uri
    }
  }
  depends_on = [google_project_service.enabled]
}

resource "google_cloud_scheduler_job" "cashflow_summary" {
  name      = "bizopsmate-cashflow-summary"
  region    = var.region
  schedule  = "0 18 * * *" # daily 18:00
  time_zone = "Asia/Colombo"

  http_target {
    http_method = "POST"
    uri         = "${google_cloud_run_v2_service.worker.uri}/jobs/cashflow-summary"
    oidc_token {
      service_account_email = google_service_account.api.email
      audience              = google_cloud_run_v2_service.worker.uri
    }
  }
  depends_on = [google_project_service.enabled]
}
