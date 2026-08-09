terraform {
  required_version = ">= 1.5"

  # Partially configured: bucket and prefix come from `terraform init
  # -backend-config` so staging and production keep separate state. Local state
  # would be lost between CI runs, and the next apply would try to recreate the
  # production database.
  backend "gcs" {}

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 6.0"
    }
    # random_password is used for the database roles. Terraform will not resolve
    # an undeclared provider, so apply fails outright without this block.
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
}
