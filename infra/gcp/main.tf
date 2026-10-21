terraform {
  required_version = ">= 1.6.0"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 6.0"
    }
  }
}

provider "google" {
  project = var.project_id
}

resource "google_project_service" "compute" {
  project            = var.project_id
  service            = "compute.googleapis.com"
  disable_on_destroy = false
}

resource "google_compute_region_network_endpoint_group" "cloud_run" {
  depends_on            = [google_project_service.compute]
  name                  = "${var.service_name}-serverless-neg"
  region                = var.region
  network_endpoint_type = "SERVERLESS"

  cloud_run {
    service = var.service_name
  }
}

resource "google_compute_backend_service" "cloud_run" {
  depends_on            = [google_project_service.compute]
  name                  = "${var.service_name}-backend"
  load_balancing_scheme = "EXTERNAL_MANAGED"
  protocol              = "HTTPS"

  backend {
    group = google_compute_region_network_endpoint_group.cloud_run.id
  }
}

resource "google_compute_url_map" "https" {
  depends_on      = [google_project_service.compute]
  name            = "${var.service_name}-https-map"
  default_service = google_compute_backend_service.cloud_run.id
}

resource "google_compute_managed_ssl_certificate" "public" {
  depends_on = [google_project_service.compute]
  name       = "${var.service_name}-managed-cert"

  managed {
    domains = var.domains
  }
}

resource "google_compute_ssl_policy" "modern" {
  depends_on      = [google_project_service.compute]
  name            = "${var.service_name}-modern-tls"
  profile         = "MODERN"
  min_tls_version = "TLS_1_2"
}

resource "google_compute_target_https_proxy" "public" {
  depends_on       = [google_project_service.compute]
  name             = "${var.service_name}-https-proxy"
  url_map          = google_compute_url_map.https.id
  ssl_certificates = [google_compute_managed_ssl_certificate.public.id]
  ssl_policy       = google_compute_ssl_policy.modern.id
}

resource "google_compute_global_address" "public" {
  depends_on = [google_project_service.compute]
  name       = "${var.service_name}-public-ip"
}

resource "google_compute_global_forwarding_rule" "https" {
  depends_on            = [google_project_service.compute]
  name                  = "${var.service_name}-https-forwarding-rule"
  target                = google_compute_target_https_proxy.public.id
  ip_address            = google_compute_global_address.public.address
  port_range            = "443"
  load_balancing_scheme = "EXTERNAL_MANAGED"
}

resource "google_compute_url_map" "http_redirect" {
  depends_on = [google_project_service.compute]
  name       = "${var.service_name}-http-redirect"

  default_url_redirect {
    https_redirect         = true
    redirect_response_code = "MOVED_PERMANENTLY_DEFAULT"
    strip_query            = false
  }
}

resource "google_compute_target_http_proxy" "http_redirect" {
  depends_on = [google_project_service.compute]
  name       = "${var.service_name}-http-proxy"
  url_map    = google_compute_url_map.http_redirect.id
}

resource "google_compute_global_forwarding_rule" "http_redirect" {
  depends_on            = [google_project_service.compute]
  name                  = "${var.service_name}-http-forwarding-rule"
  target                = google_compute_target_http_proxy.http_redirect.id
  ip_address            = google_compute_global_address.public.address
  port_range            = "80"
  load_balancing_scheme = "EXTERNAL_MANAGED"
}

