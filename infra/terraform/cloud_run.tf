locals {
  sql_conn = google_sql_database_instance.pg.connection_name
}

# --- Worker (private: only Cloud Tasks + Scheduler may invoke) ---
resource "google_cloud_run_v2_service" "worker" {
  name     = "ledgerpilot-worker"
  location = var.region

  template {
    service_account = google_service_account.worker.email

    scaling {
      min_instance_count = 0
      max_instance_count = 10
    }

    volumes {
      name = "cloudsql"
      cloud_sql_instance {
        instances = [local.sql_conn]
      }
    }

    containers {
      image = var.worker_image
      ports { container_port = 8081 }

      env {
        name  = "TASKS_DRIVER"
        value = "cloud"
      }
      env {
        name  = "STORAGE_BUCKET"
        value = google_storage_bucket.documents.name
      }
      env {
        name  = "VERTEX_PROJECT_ID"
        value = var.project_id
      }
      env {
        name  = "VERTEX_LOCATION"
        value = var.region
      }
      dynamic "env" {
        for_each = toset(["DATABASE_APP_URL", "GEMINI_API_KEY", "INTAKE_HMAC_SECRET", "RESEND_API_KEY"])
        content {
          name = env.value
          value_source {
            secret_key_ref {
              secret  = env.value
              version = "latest"
            }
          }
        }
      }
      volume_mounts {
        name       = "cloudsql"
        mount_path = "/cloudsql"
      }
    }
  }
  depends_on = [google_project_service.enabled]
}

# --- API (public; auth enforced in-app via Clerk) ---
resource "google_cloud_run_v2_service" "api" {
  name     = "ledgerpilot-api"
  location = var.region

  template {
    service_account = google_service_account.api.email

    scaling {
      min_instance_count = 0
      max_instance_count = 20
    }

    volumes {
      name = "cloudsql"
      cloud_sql_instance {
        instances = [local.sql_conn]
      }
    }

    containers {
      image = var.api_image
      ports { container_port = 8080 }

      env {
        name  = "TASKS_DRIVER"
        value = "cloud"
      }
      env {
        name  = "TASKS_QUEUE"
        value = google_cloud_tasks_queue.agent_runs.name
      }
      env {
        name  = "TASKS_LOCATION"
        value = var.region
      }
      env {
        name  = "GCP_PROJECT_ID"
        value = var.project_id
      }
      env {
        name  = "WORKER_URL"
        value = google_cloud_run_v2_service.worker.uri
      }
      env {
        name  = "WORKER_SERVICE_ACCOUNT"
        value = google_service_account.worker.email
      }
      dynamic "env" {
        for_each = toset(["DATABASE_APP_URL", "CLERK_SECRET_KEY", "CLERK_WEBHOOK_SECRET", "INTAKE_HMAC_SECRET", "STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"])
        content {
          name = env.value
          value_source {
            secret_key_ref {
              secret  = env.value
              version = "latest"
            }
          }
        }
      }
      volume_mounts {
        name       = "cloudsql"
        mount_path = "/cloudsql"
      }
    }
  }
  depends_on = [google_project_service.enabled]
}

# --- Web (public) ---
resource "google_cloud_run_v2_service" "web" {
  name     = "ledgerpilot-web"
  location = var.region

  template {
    scaling {
      min_instance_count = 0
      max_instance_count = 10
    }
    containers {
      image = var.web_image
      ports { container_port = 3000 }
      env {
        name  = "NEXT_PUBLIC_API_URL"
        value = google_cloud_run_v2_service.api.uri
      }
    }
  }
  depends_on = [google_project_service.enabled]
}

# Public access for web + api; worker stays private.
resource "google_cloud_run_v2_service_iam_member" "web_public" {
  name     = google_cloud_run_v2_service.web.name
  location = var.region
  role     = "roles/run.invoker"
  member   = "allUsers"
}

resource "google_cloud_run_v2_service_iam_member" "api_public" {
  name     = google_cloud_run_v2_service.api.name
  location = var.region
  role     = "roles/run.invoker"
  member   = "allUsers"
}

# Worker is invokable only by the API SA (Cloud Tasks OIDC) and scheduler SA.
resource "google_cloud_run_v2_service_iam_member" "worker_api" {
  name     = google_cloud_run_v2_service.worker.name
  location = var.region
  role     = "roles/run.invoker"
  member   = "serviceAccount:${google_service_account.api.email}"
}
