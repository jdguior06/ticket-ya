variable "region" {
  description = "Región de AWS."
  type        = string
  default     = "us-east-2"
}

variable "entorno" {
  description = "Nombre del entorno (se usa en nombres y etiquetas)."
  type        = string
  default     = "v1"
}

variable "tipo_instancia" {
  description = "7 servicios Node + PostgreSQL + compilación necesitan unos 4 GB: t3.micro no alcanza."
  type        = string
  default     = "m7i-flex.large" # 2 vCPU, 8 GB

  validation {
    condition     = contains(["t3.small", "c7i-flex.large", "m7i-flex.large", "t3.medium"], var.tipo_instancia)
    error_message = "Usa uno de los tipos permitidos: m7i-flex.large (recomendado), c7i-flex.large, t3.medium o t3.small."
  }
}

variable "disco_gb" {
  description = "Tamaño del disco raíz (node_modules de 8 apps + releases anteriores + PDFs)."
  type        = number
  default     = 30
}

variable "clave_ssh_admin" {
  description = "Ruta de TU clave pública SSH (entra como 'ubuntu', la usa Ansible)."
  type        = string
  default     = "~/.ssh/id_ed25519.pub"
}

variable "clave_ssh_despliegue" {
  description = "Ruta de la clave pública del pipeline (entra como 'deploy', solo puede desplegar)."
  type        = string
  default     = "../claves/github-actions.pub"
}

variable "ssh_permitido" {
  description = "Desde dónde se acepta SSH. GitHub Actions usa IPs variables, por eso por defecto es abierto (solo con llave, sin contraseña)."
  type        = list(string)
  default     = ["0.0.0.0/0"]
}
