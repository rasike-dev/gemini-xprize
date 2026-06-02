locals {
  services = [
    "run.googleapis.com",
    "sqladmin.googleapis.com",
    "cloudtasks.googleapis.com",
    "cloudscheduler.googleapis.com",
    "secretmanager.googleapis.com",
    "artifactregistry.googleapis.com",
    "aiplatform.googleapis.com",
    "storage.googleapis.com",
  ]
}

resource "google_project_service" "enabled" {
  for_each = toset(local.services)
  service  = each.value

  disable_on_destroy = false
}

# --- Artifact Registry (container images) ---
resource "google_artifact_registry_repository" "containers" {
  location      = var.region
  repository_id = "ledgerpilot"
  format        = "DOCKER"
  depends_on    = [google_project_service.enabled]
}

# --- Cloud SQL Postgres ---
resource "google_sql_database_instance" "pg" {
  name             = "ledgerpilot-pg"
  database_version = "POSTGRES_16"
  region           = var.region

  settings {
    tier              = var.db_tier
    availability_type = "ZONAL"
    disk_autoresize   = true

    backup_configuration {
      enabled                        = true
      point_in_time_recovery_enabled = true
      start_time                     = "18:00"
    }

    ip_configuration {
      ipv4_enabled = true
    }
  }

  deletion_protection = true
  depends_on          = [google_project_service.enabled]
}

resource "google_sql_database" "app" {
  name     = "ledgerpilot"
  instance = google_sql_database_instance.pg.name
}

# Migration/owner role (used by CI to run migrations + apply RLS).
resource "google_sql_user" "owner" {
  name     = "ledgerpilot"
  instance = google_sql_database_instance.pg.name
  password = random_password.owner.result
}

# Runtime app role (RLS-enforced, NOT a superuser). Created here; granted in rls.sql.
resource "google_sql_user" "app" {
  name     = "ledgerpilot_app"
  instance = google_sql_database_instance.pg.name
  password = random_password.app.result
}

resource "random_password" "owner" {
  length  = 32
  special = false
}

resource "random_password" "app" {
  length  = 32
  special = false
}

# --- Cloud Storage (invoice PDFs / documents) ---
resource "google_storage_bucket" "documents" {
  name                        = "${var.project_id}-documents"
  location                    = var.region
  uniform_bucket_level_access = true
  force_destroy               = false

  lifecycle_rule {
    condition { age = 730 }
    action { type = "Delete" }
  }
  depends_on = [google_project_service.enabled]
}

# --- Cloud Tasks queue (async agent runs) ---
resource "google_cloud_tasks_queue" "agent_runs" {
  name     = "agent-runs"
  location = var.region

  retry_config {
    max_attempts  = 5
    min_backoff   = "5s"
    max_backoff   = "300s"
    max_doublings = 4
  }

  rate_limits {
    max_dispatches_per_second = 20
    max_concurrent_dispatches = 50
  }
  depends_on = [google_project_service.enabled]
}

# --- Service accounts ---
resource "google_service_account" "api" {
  account_id   = "ledgerpilot-api"
  display_name = "LedgerPilot API"
}

resource "google_service_account" "worker" {
  account_id   = "ledgerpilot-worker"
  display_name = "LedgerPilot Worker"
}

# API may enqueue tasks and read secrets; worker runs Gemini, SQL, storage.
resource "google_project_iam_member" "api_tasks" {
  project = var.project_id
  role    = "roles/cloudtasks.enqueuer"
  member  = "serviceAccount:${google_service_account.api.email}"
}

resource "google_project_iam_member" "api_sql" {
  project = var.project_id
  role    = "roles/cloudsql.client"
  member  = "serviceAccount:${google_service_account.api.email}"
}

resource "google_project_iam_member" "worker_sql" {
  project = var.project_id
  role    = "roles/cloudsql.client"
  member  = "serviceAccount:${google_service_account.worker.email}"
}

resource "google_project_iam_member" "worker_vertex" {
  project = var.project_id
  role    = "roles/aiplatform.user"
  member  = "serviceAccount:${google_service_account.worker.email}"
}

resource "google_storage_bucket_iam_member" "worker_storage" {
  bucket = google_storage_bucket.documents.name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${google_service_account.worker.email}"
}

# Allow the API SA to mint OIDC tokens targeting the worker (for Cloud Tasks).
resource "google_service_account_iam_member" "api_acts_as_worker" {
  service_account_id = google_service_account.worker.name
  role               = "roles/iam.serviceAccountUser"
  member             = "serviceAccount:${google_service_account.api.email}"
}
