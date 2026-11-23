# Estado LOCAL (terraform.tfstate en esta carpeta, no va a git). Para la v1 basta:
# una sola persona crea y destruye el servidor.
terraform {
  required_version = ">= 1.6"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
    local = {
      source  = "hashicorp/local"
      version = "~> 2.5"
    }
  }
}

provider "aws" {
  region = var.region

  default_tags {
    tags = {
      Proyecto = "entradasya"
      Entorno  = var.entorno
      Gestion  = "terraform"
    }
  }
}
