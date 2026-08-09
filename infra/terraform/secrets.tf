# Secret Manager entries. Values are set out-of-band (populate-secrets.sh), never
# in Terraform state.
locals {
  # Which service needs which secret. Granting both services everything meant a
  # bug in the worker exposed the Clerk and Stripe keys it has no use for, so each
  # service account is granted only what its code reads.
  api_secrets = [
    "DATABASE_APP_URL",
    "CLERK_SECRET_KEY",
    "CLERK_WEBHOOK_SECRET",
    "INTAKE_HMAC_SECRET",
    "STRIPE_SECRET_KEY",
    "STRIPE_WEBHOOK_SECRET",
    "PAYHERE_MERCHANT_SECRET",
    # Subscription Manager API credential, used to cancel and retry recurring
    # charges. Only meaningful on the PLUS merchant plan.
    "PAYHERE_APP_SECRET",
    "RESEND_API_KEY",
    "SENTRY_DSN",
  ]

  worker_secrets = [
    "DATABASE_APP_URL",
    "GEMINI_API_KEY",
    "RESEND_API_KEY",
    "SENTRY_DSN",
  ]

  # DATABASE_URL is the owner connection, used only for migrations from CI or a
  # developer machine. Neither runtime service can read it.
  secret_ids = distinct(concat(["DATABASE_URL"], local.api_secrets, local.worker_secrets))
}

resource "google_secret_manager_secret" "secrets" {
  for_each  = toset(local.secret_ids)
  secret_id = each.value

  labels = {
    environment = var.environment
  }

  replication {
    auto {}
  }
  depends_on = [google_project_service.enabled]
}

resource "google_secret_manager_secret_iam_member" "api_access" {
  for_each  = toset(local.api_secrets)
  secret_id = google_secret_manager_secret.secrets[each.value].id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.api.email}"
}

resource "google_secret_manager_secret_iam_member" "worker_access" {
  for_each  = toset(local.worker_secrets)
  secret_id = google_secret_manager_secret.secrets[each.value].id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.worker.email}"
}
