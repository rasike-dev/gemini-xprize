locals {
  sql_conn = google_sql_database_instance.pg.connection_name

  # The API cannot reference its own Cloud Run URI (that would be a dependency
  # cycle), and PayHere requires a whitelisted domain regardless, so the public
  # origin is configured explicitly.
  api_origin = var.api_domain
}

# --- Worker (private: only Cloud Tasks + Scheduler may invoke) ---
resource "google_cloud_run_v2_service" "worker" {
  name     = "ledgerpilot-worker"
  location = var.region

  template {
    service_account = google_service_account.worker.email

    scaling {
      # The worker is only reached through Cloud Tasks, which retries, so a cold
      # start here costs latency on a background job and nothing else.
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
        name  = "NODE_ENV"
        value = "production"
      }
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
      # Invoice links inside AI-drafted reminders and emails.
      env {
        name  = "PUBLIC_WEB_URL"
        value = var.web_domain
      }
      dynamic "env" {
        for_each = toset(local.worker_secrets)
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
      min_instance_count = var.min_instances
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

      # NODE_ENV=production is what turns on the startup safety checks: no
      # DISABLE_AUTH, real AI credentials, an explicit CORS allowlist.
      env {
        name  = "NODE_ENV"
        value = "production"
      }
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
      env {
        name  = "CORS_ORIGINS"
        value = var.web_domain
      }
      env {
        name  = "PUBLIC_WEB_URL"
        value = var.web_domain
      }
      env {
        name  = "PUBLIC_API_URL"
        value = local.api_origin
      }
      env {
        name  = "PAYHERE_MERCHANT_ID"
        value = var.payhere_merchant_id
      }
      # PayHere ties the merchant secret to a whitelisted domain and posts the
      # payment result here, so it must be the public origin, not the Cloud Run
      # URL, once a custom domain is mapped.
      env {
        name  = "PAYHERE_NOTIFY_URL"
        value = "${local.api_origin}/api/webhooks/payhere"
      }
      env {
        name  = "PAYHERE_SANDBOX"
        value = var.payhere_sandbox ? "true" : "false"
      }
      # LITE bills one-time; PLUS unlocks the Recurring API so PayHere charges
      # the card itself. Switching this is the whole migration on our side.
      env {
        name  = "PAYHERE_MERCHANT_PLAN"
        value = var.payhere_merchant_plan
      }
      env {
        name  = "PAYHERE_APP_ID"
        value = var.payhere_app_id
      }
      env {
        name  = "SENTRY_TRACES_SAMPLE_RATE"
        value = "0.1"
      }
      dynamic "env" {
        for_each = toset(local.api_secrets)
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
      min_instance_count = var.min_instances
      max_instance_count = 10
    }
    containers {
      image = var.web_image
      ports { container_port = 3000 }

      # NEXT_PUBLIC_* values are inlined at image build time (see the web
      # Dockerfile build args). They are repeated here for the server runtime;
      # changing one means rebuilding the image, not just re-applying Terraform.
      env {
        name  = "NEXT_PUBLIC_API_URL"
        value = local.api_origin
      }
      env {
        name  = "NEXT_PUBLIC_SITE_URL"
        value = var.web_domain
      }
      env {
        name  = "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY"
        value = var.clerk_publishable_key
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
