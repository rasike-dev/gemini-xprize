# ============================================================================
# Uptime checks and alerting.
#
# The point of these three alerts: know the site is down before a customer tells
# you, know when requests are failing even though the site is up, and know when
# agent runs are dying permanently instead of quietly piling up in the dead-letter
# queue.
# ============================================================================

resource "google_monitoring_notification_channel" "email" {
  display_name = "BizOpsMate alerts (${var.environment})"
  type         = "email"

  labels = {
    email_address = var.alert_email
  }

  depends_on = [google_project_service.enabled]
}

# --- Uptime: is the site actually answering? ---
resource "google_monitoring_uptime_check_config" "web" {
  display_name = "bizopsmate-web (${var.environment})"
  timeout      = "10s"
  period       = "300s"

  http_check {
    path         = "/"
    port         = 443
    use_ssl      = true
    validate_ssl = true
  }

  monitored_resource {
    type = "uptime_url"
    labels = {
      project_id = var.project_id
      host       = replace(replace(var.web_domain, "https://", ""), "http://", "")
    }
  }

  depends_on = [google_project_service.enabled]
}

resource "google_monitoring_uptime_check_config" "api" {
  display_name = "bizopsmate-api (${var.environment})"
  timeout      = "10s"
  period       = "300s"

  # /health is excluded from the global 'api' prefix and needs no auth.
  http_check {
    path         = "/health"
    port         = 443
    use_ssl      = true
    validate_ssl = true
  }

  monitored_resource {
    type = "uptime_url"
    labels = {
      project_id = var.project_id
      host       = replace(replace(var.api_domain, "https://", ""), "http://", "")
    }
  }

  depends_on = [google_project_service.enabled]
}

resource "google_monitoring_alert_policy" "uptime" {
  display_name = "BizOpsMate down (${var.environment})"
  combiner     = "OR"

  conditions {
    display_name = "Uptime check failing"

    condition_threshold {
      filter = join(" AND ", [
        "metric.type=\"monitoring.googleapis.com/uptime_check/check_passed\"",
        "resource.type=\"uptime_url\"",
      ])
      comparison      = "COMPARISON_LT"
      threshold_value = 1
      duration        = "300s"

      aggregations {
        alignment_period     = "300s"
        per_series_aligner   = "ALIGN_FRACTION_TRUE"
        cross_series_reducer = "REDUCE_MEAN"
        group_by_fields      = ["resource.label.host"]
      }

      trigger { count = 1 }
    }
  }

  notification_channels = [google_monitoring_notification_channel.email.id]

  documentation {
    content = "A BizOpsMate uptime check has been failing for 5 minutes. Check Cloud Run logs and Cloud SQL availability."
  }
}

# --- Errors: up, but failing requests ---
resource "google_monitoring_alert_policy" "api_5xx" {
  display_name = "BizOpsMate API 5xx rate (${var.environment})"
  combiner     = "OR"

  conditions {
    display_name = "More than 5 server errors per minute"

    condition_threshold {
      filter = join(" AND ", [
        "metric.type=\"run.googleapis.com/request_count\"",
        "resource.type=\"cloud_run_revision\"",
        "resource.label.\"service_name\"=\"${google_cloud_run_v2_service.api.name}\"",
        "metric.label.\"response_code_class\"=\"5xx\"",
      ])
      comparison      = "COMPARISON_GT"
      threshold_value = 5
      duration        = "300s"

      aggregations {
        alignment_period   = "60s"
        per_series_aligner = "ALIGN_RATE"
      }

      trigger { count = 1 }
    }
  }

  notification_channels = [google_monitoring_notification_channel.email.id]

  documentation {
    content = "The API is returning 5xx responses. Sentry will have the stack traces; SENTRY_DSN is wired into the API service."
  }
}

# --- Dead letters: agent runs that have given up ---
resource "google_monitoring_alert_policy" "deadletter" {
  display_name = "BizOpsMate agent runs dead-lettered (${var.environment})"
  combiner     = "OR"

  conditions {
    display_name = "Tasks arriving in the dead-letter queue"

    condition_threshold {
      filter = join(" AND ", [
        "metric.type=\"cloudtasks.googleapis.com/queue/task_attempt_count\"",
        "resource.type=\"cloud_tasks_queue\"",
        "resource.label.\"queue_id\"=\"${google_cloud_tasks_queue.agent_runs_deadletter.name}\"",
      ])
      comparison      = "COMPARISON_GT"
      threshold_value = 0
      duration        = "0s"

      aggregations {
        alignment_period   = "300s"
        per_series_aligner = "ALIGN_SUM"
      }

      trigger { count = 1 }
    }
  }

  notification_channels = [google_monitoring_notification_channel.email.id]

  documentation {
    content = <<-EOT
      An agent run exhausted its retries and landed in the dead-letter queue,
      which means a customer's inquiry, quote or reminder was never processed.
      Inspect the queue, then use the Retry button on the agent log once fixed.
    EOT
  }
}
