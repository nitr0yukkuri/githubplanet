variable "project_id" {
  description = "Google Cloud project that owns the existing Cloud Run service."
  type        = string
}

variable "service_name" {
  description = "Existing Cloud Run service name."
  type        = string
  default     = "githubplanet-git"
}

variable "region" {
  description = "Region of the existing Cloud Run service."
  type        = string
  default     = "asia-northeast2"
}

variable "domains" {
  description = "Domains served by the HTTPS load balancer certificate."
  type        = list(string)
  default     = ["githubplanet.dev"]
}

