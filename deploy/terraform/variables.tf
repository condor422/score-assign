variable "project_id" {
  description = "GCP project that hosts ScoreAssign"
  type        = string
  default     = "scoreassign"
}

variable "region" {
  description = "Cloud Run region"
  type        = string
  default     = "us-west1"
}

variable "root_domain" {
  description = "Apex domain; tenants live at <slug>.<root_domain>"
  type        = string
  default     = "scoreassign.com"
}

variable "api_image" {
  description = "Fully qualified API image, e.g. us-west1-docker.pkg.dev/scoreassign/score-assign/api:abc1234"
  type        = string
}

variable "web_image" {
  description = "Fully qualified web image"
  type        = string
}

variable "api_max_instances" {
  description = "Cloud Run ceiling for the API"
  type        = number
  default     = 10
}

variable "web_max_instances" {
  description = "Cloud Run ceiling for the SPA"
  type        = number
  default     = 5
}

variable "billing_provider" {
  description = "Billing implementation; 'stub' activates plans without taking payment"
  type        = string
  default     = "stub"
}

variable "email_provider" {
  description = "'sendgrid' for real delivery, 'log' to write messages to Cloud Logging"
  type        = string
  default     = "sendgrid"

  validation {
    condition     = contains(["log", "sendgrid"], var.email_provider)
    error_message = "email_provider must be 'log' or 'sendgrid'."
  }
}

variable "email_from" {
  description = "Envelope sender; must be a verified SendGrid sender or domain"
  type        = string
  default     = "no-reply@scoreassign.com"
}
