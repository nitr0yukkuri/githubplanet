output "public_ip" {
  description = "Global IPv4 address to publish as an A record for every domain."
  value       = google_compute_global_address.public.address
}

output "https_url" {
  description = "Public HTTPS URL after DNS and certificate provisioning complete."
  value       = "https://${var.domains[0]}"
}

output "cloud_run_service" {
  description = "The existing Cloud Run service kept behind the load balancer."
  value       = "${var.service_name} (${var.region})"
}

