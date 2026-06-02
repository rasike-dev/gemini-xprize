variable "project_id" {
  type        = string
  description = "GCP project id"
}

variable "region" {
  type        = string
  default     = "asia-south1"
  description = "GCP region (asia-south1 = Mumbai, closest to Sri Lanka)"
}

variable "db_tier" {
  type        = string
  default     = "db-f1-micro"
  description = "Cloud SQL tier"
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
