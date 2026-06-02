# Secret Manager entries. Values are set out-of-band (CI / console), not in TF state.
locals {
  secret_ids = [
    "DATABASE_URL",
    "DATABASE_APP_URL",
    "CLERK_SECRET_KEY",
    "CLERK_WEBHOOK_SECRET",
    "GEMINI_API_KEY",
    "INTAKE_HMAC_SECRET",
    "STRIPE_SECRET_KEY",
    "STRIPE_WEBHOOK_SECRET",
    "PAYHERE_MERCHANT_SECRET",
    "RESEND_API_KEY",
  ]
}

resource "google_secret_manager_secret" "secrets" {
  for_each  = toset(local.secret_ids)
  secret_id = each.value

  replication {
    auto {}
  }
  depends_on = [google_project_service.enabled]
}

# Grant both runtime SAs read access to all secrets.
resource "google_secret_manager_secret_iam_member" "api_access" {
  for_each  = google_secret_manager_secret.secrets
  secret_id = each.value.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.api.email}"
}

resource "google_secret_manager_secret_iam_member" "worker_access" {
  for_each  = google_secret_manager_secret.secrets
  secret_id = each.value.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.worker.email}"
}
