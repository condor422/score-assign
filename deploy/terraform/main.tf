/**
 * ScoreAssign on Google Cloud.
 *
 * Two Cloud Run services behind one external HTTPS load balancer, because
 * tenants are addressed as <slug>.scoreassign.com and Cloud Run domain
 * mappings cannot carry a wildcard. The load balancer also routes /api/* to
 * the API service so the refresh cookie stays first-party on every subdomain.
 *
 * MongoDB is Atlas on GCP and is not managed here: the cluster outlives this
 * configuration, and its URI arrives through Secret Manager.
 */

terraform {
  required_version = ">= 1.6"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 6.0"
    }
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
}

locals {
  services = [
    "run.googleapis.com",
    "cloudbuild.googleapis.com",
    "artifactregistry.googleapis.com",
    "secretmanager.googleapis.com",
    "compute.googleapis.com",
    "certificatemanager.googleapis.com",
  ]

  # Secret Manager holds the values; Terraform only creates the containers so a
  # plan never has a credential in state.
  secret_ids = [
    "mongodb-uri",
    "jwt-access-secret",
    "jwt-refresh-secret",
    "sendgrid-api-key",
  ]
}

resource "google_project_service" "enabled" {
  for_each                   = toset(local.services)
  service                    = each.value
  disable_dependent_services = false
  disable_on_destroy         = false
}

resource "google_artifact_registry_repository" "images" {
  location      = var.region
  repository_id = "score-assign"
  format        = "DOCKER"
  description   = "ScoreAssign API and web images"
  depends_on    = [google_project_service.enabled]
}

resource "google_secret_manager_secret" "app" {
  for_each  = toset(local.secret_ids)
  secret_id = each.value
  replication {
    auto {}
  }
  depends_on = [google_project_service.enabled]
}

resource "google_service_account" "runtime" {
  account_id   = "score-assign-run"
  display_name = "ScoreAssign Cloud Run runtime"
}

resource "google_secret_manager_secret_iam_member" "runtime_access" {
  for_each  = google_secret_manager_secret.app
  secret_id = each.value.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.runtime.email}"
}

resource "google_cloud_run_v2_service" "api" {
  name     = "score-assign-api"
  location = var.region
  ingress  = "INGRESS_TRAFFIC_ALL"

  template {
    service_account = google_service_account.runtime.email
    scaling {
      # One warm instance keeps the Mongo pool established between requests.
      min_instance_count = 1
      max_instance_count = var.api_max_instances
    }

    containers {
      image = var.api_image

      env {
        name  = "NODE_ENV"
        value = "production"
      }
      env {
        name  = "APP_ROOT_DOMAIN"
        value = var.root_domain
      }
      env {
        name  = "WEB_ORIGIN"
        value = "https://${var.root_domain}"
      }
      env {
        name  = "BILLING_PROVIDER"
        value = var.billing_provider
      }
      env {
        name  = "EMAIL_PROVIDER"
        value = var.email_provider
      }
      env {
        name  = "EMAIL_FROM"
        value = var.email_from
      }

      dynamic "env" {
        for_each = {
          MONGODB_URI        = "mongodb-uri"
          JWT_ACCESS_SECRET  = "jwt-access-secret"
          JWT_REFRESH_SECRET = "jwt-refresh-secret"
          SENDGRID_API_KEY   = "sendgrid-api-key"
        }
        content {
          name = env.key
          value_source {
            secret_key_ref {
              secret  = env.value
              version = "latest"
            }
          }
        }
      }

      resources {
        limits = {
          cpu    = "1"
          memory = "512Mi"
        }
      }

      startup_probe {
        http_get {
          path = "/healthz"
        }
        initial_delay_seconds = 5
        period_seconds        = 5
        failure_threshold     = 6
      }
    }
  }

  depends_on = [google_secret_manager_secret_iam_member.runtime_access]
}

resource "google_cloud_run_v2_service" "web" {
  name     = "score-assign-web"
  location = var.region
  ingress  = "INGRESS_TRAFFIC_ALL"

  template {
    service_account = google_service_account.runtime.email
    scaling {
      min_instance_count = 0
      max_instance_count = var.web_max_instances
    }
    containers {
      image = var.web_image
      env {
        name  = "API_ORIGIN"
        value = "https://${var.root_domain}"
      }
      resources {
        limits = {
          cpu    = "1"
          memory = "256Mi"
        }
      }
    }
  }
}

# The SPA and the intake form are public; the API enforces its own auth.
resource "google_cloud_run_v2_service_iam_member" "public" {
  for_each = {
    api = google_cloud_run_v2_service.api.name
    web = google_cloud_run_v2_service.web.name
  }
  name     = each.value
  location = var.region
  role     = "roles/run.invoker"
  member   = "allUsers"
}

resource "google_compute_region_network_endpoint_group" "api" {
  name                  = "score-assign-api-neg"
  region                = var.region
  network_endpoint_type = "SERVERLESS"
  cloud_run {
    service = google_cloud_run_v2_service.api.name
  }
}

resource "google_compute_region_network_endpoint_group" "web" {
  name                  = "score-assign-web-neg"
  region                = var.region
  network_endpoint_type = "SERVERLESS"
  cloud_run {
    service = google_cloud_run_v2_service.web.name
  }
}

resource "google_compute_backend_service" "api" {
  name                  = "score-assign-api-backend"
  load_balancing_scheme = "EXTERNAL_MANAGED"
  protocol              = "HTTPS"
  backend {
    group = google_compute_region_network_endpoint_group.api.id
  }
}

resource "google_compute_backend_service" "web" {
  name                  = "score-assign-web-backend"
  load_balancing_scheme = "EXTERNAL_MANAGED"
  protocol              = "HTTPS"
  backend {
    group = google_compute_region_network_endpoint_group.web.id
  }
}

/**
 * Host and path routing. Every host — apex and every tenant subdomain — hits
 * the same map: /api/* goes to the API, everything else to the SPA. Serverless
 * NEG backends forward the original Host header, which is how the API resolves
 * the tenant.
 */
resource "google_compute_url_map" "default" {
  name            = "score-assign-lb"
  default_service = google_compute_backend_service.web.id

  path_matcher {
    name            = "all"
    default_service = google_compute_backend_service.web.id
    path_rule {
      paths   = ["/api", "/api/*"]
      service = google_compute_backend_service.api.id
    }
  }

  host_rule {
    hosts        = [var.root_domain, "*.${var.root_domain}"]
    path_matcher = "all"
  }
}

resource "google_compute_managed_ssl_certificate" "default" {
  name = "score-assign-cert"
  managed {
    # A wildcard on a Google-managed certificate requires DNS authorization,
    # which is why the apex is listed alongside it.
    domains = [var.root_domain, "*.${var.root_domain}"]
  }
}

resource "google_compute_target_https_proxy" "default" {
  name             = "score-assign-https"
  url_map          = google_compute_url_map.default.id
  ssl_certificates = [google_compute_managed_ssl_certificate.default.id]
}

resource "google_compute_global_address" "default" {
  name = "score-assign-ip"
}

resource "google_compute_global_forwarding_rule" "https" {
  name                  = "score-assign-https-rule"
  load_balancing_scheme = "EXTERNAL_MANAGED"
  target                = google_compute_target_https_proxy.default.id
  port_range            = "443"
  ip_address            = google_compute_global_address.default.id
}

# Plain HTTP exists only to send callers to HTTPS.
resource "google_compute_url_map" "redirect" {
  name = "score-assign-redirect"
  default_url_redirect {
    https_redirect         = true
    redirect_response_code = "MOVED_PERMANENTLY_DEFAULT"
    strip_query            = false
  }
}

resource "google_compute_target_http_proxy" "redirect" {
  name    = "score-assign-http"
  url_map = google_compute_url_map.redirect.id
}

resource "google_compute_global_forwarding_rule" "http" {
  name                  = "score-assign-http-rule"
  load_balancing_scheme = "EXTERNAL_MANAGED"
  target                = google_compute_target_http_proxy.redirect.id
  port_range            = "80"
  ip_address            = google_compute_global_address.default.id
}
