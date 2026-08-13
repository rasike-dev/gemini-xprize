variable "project_id" {
  type        = string
  description = "GCP project id"
}

variable "region" {
  type        = string
  default     = "asia-south1"
  description = "GCP region (asia-south1 = Mumbai, closest to Sri Lanka)"
}

variable "environment" {
  type        = string
  default     = "prod"
  description = <<-EOT
    Environment name, used for labels, Sentry tagging and alert wording.

    Staging runs in its own GCP project rather than alongside production in this
    one: a separate project means a separate database and separate secrets, so a
    staging mistake cannot reach a customer's books. Point -var-file at
    staging.tfvars and use a matching Terraform workspace.
  EOT

  validation {
    condition     = contains(["prod", "staging"], var.environment)
    error_message = "environment must be prod or staging."
  }
}

variable "db_tier" {
  type        = string
  default     = "db-f1-micro"
  description = "Cloud SQL tier. Shared-core is fine early; budget an upgrade around 20 active tenants."
}

variable "api_image" {
  type        = string
  description = "Container image for the API service"
}

variable "worker_image" {
  type        = string
  description = "Container image for the worker service"
}

variable "web_image" {
  type        = string
  description = "Container image for the web service"
}

variable "min_instances" {
  type        = number
  default     = 1
  description = <<-EOT
    Minimum Cloud Run instances for the public services.

    Zero means a cold start on the first request, which for a NestJS app plus a
    Cloud SQL connection is several seconds. A paying customer should not wait
    that long, so this defaults to 1 (set 0 for staging to save money).
  EOT
}

variable "web_domain" {
  type        = string
  description = "Public site origin, e.g. https://bizopsmateai.com. Used for CORS and invoice share links."

  validation {
    # A trailing slash would produce '//api/webhooks/payhere' and a malformed
    # uptime-check host, both of which fail in ways that are annoying to trace.
    condition     = can(regex("^https?://[^/]+$", var.web_domain))
    error_message = "web_domain must be a scheme and host with no path or trailing slash."
  }
}

variable "api_domain" {
  type        = string
  description = <<-EOT
    Public API origin, e.g. https://api.bizopsmateai.com.

    Set explicitly rather than derived from the Cloud Run URI: the API cannot
    reference its own URI, and PayHere issues the merchant secret against a
    specific whitelisted domain.
  EOT

  validation {
    condition     = can(regex("^https?://[^/]+$", var.api_domain))
    error_message = "api_domain must be a scheme and host with no path or trailing slash."
  }
}

variable "payhere_merchant_id" {
  type        = string
  default     = ""
  description = "PayHere merchant id. Not a secret (it is posted in the checkout form); the merchant secret is in Secret Manager."
}

variable "payhere_sandbox" {
  type        = bool
  default     = true
  description = "Keep true until PayHere approves the account. When true no real money moves."
}

variable "payhere_merchant_plan" {
  type        = string
  default     = "LITE"
  description = "LITE bills one-time payments only. PLUS costs LKR 3,990/month and unlocks the Recurring API, so subscriptions renew without the customer paying again by hand."

  validation {
    condition     = contains(["LITE", "PLUS"], var.payhere_merchant_plan)
    error_message = "payhere_merchant_plan must be LITE or PLUS."
  }
}

variable "payhere_app_id" {
  type        = string
  default     = ""
  description = "Business App ID for the PayHere Subscription Manager API (cancel and retry). Only needed on PLUS; the paired secret lives in Secret Manager."
}

variable "alert_email" {
  type        = string
  description = "Address that receives uptime and error-rate alerts."
}

variable "clerk_publishable_key" {
  type        = string
  default     = ""
  description = "Clerk publishable key. Not a secret, but must match the key baked into the web image at build time."
}
