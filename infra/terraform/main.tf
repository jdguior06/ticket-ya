# Un solo servidor Ubuntu para EntradasYa v1 (como pide el documento de requerimientos).
#
#   internet ──80/443──► Nginx ──► web (estática) y /api/<servicio> ──► 7 servicios Node
#            ──22──────► SSH (ubuntu: Ansible · deploy: GitHub Actions)
#   Todo lo demás (PostgreSQL, Mailpit, puertos 3001-3007) escucha solo en localhost.

locals {
  nombre = "entradasya-${var.entorno}"
}

# --- Imagen: Ubuntu 24.04 LTS oficial de Canonical (la última, publicada en SSM)
data "aws_ssm_parameter" "ubuntu" {
  name = "/aws/service/canonical/ubuntu/server/24.04/stable/current/amd64/hvm/ebs-gp3/ami-id"
}

data "aws_availability_zones" "disponibles" {
  state = "available"
}

# --- Red mínima propia (no depende de que la cuenta tenga VPC por defecto)
resource "aws_vpc" "principal" {
  cidr_block           = "10.20.0.0/16"
  enable_dns_support   = true
  enable_dns_hostnames = true
  tags                 = { Name = local.nombre }
}

resource "aws_internet_gateway" "principal" {
  vpc_id = aws_vpc.principal.id
  tags   = { Name = local.nombre }
}

resource "aws_subnet" "publica" {
  vpc_id                  = aws_vpc.principal.id
  cidr_block              = "10.20.1.0/24"
  availability_zone       = data.aws_availability_zones.disponibles.names[0]
  map_public_ip_on_launch = true
  tags                    = { Name = "${local.nombre}-publica" }
}

resource "aws_route_table" "publica" {
  vpc_id = aws_vpc.principal.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.principal.id
  }

  tags = { Name = "${local.nombre}-publica" }
}

resource "aws_route_table_association" "publica" {
  subnet_id      = aws_subnet.publica.id
  route_table_id = aws_route_table.publica.id
}

# --- Firewall: solo web y SSH
resource "aws_security_group" "servidor" {
  name        = local.nombre
  description = "EntradasYa: HTTP, HTTPS y SSH"
  vpc_id      = aws_vpc.principal.id
  tags        = { Name = local.nombre }
}

resource "aws_vpc_security_group_ingress_rule" "http" {
  security_group_id = aws_security_group.servidor.id
  description       = "Web y API (Nginx)"
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "tcp"
  from_port         = 80
  to_port           = 80
}

resource "aws_vpc_security_group_ingress_rule" "https" {
  security_group_id = aws_security_group.servidor.id
  description       = "Web y API con TLS (la cámara del portero exige HTTPS)"
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "tcp"
  from_port         = 443
  to_port           = 443
}

resource "aws_vpc_security_group_ingress_rule" "ssh" {
  for_each          = toset(var.ssh_permitido)
  security_group_id = aws_security_group.servidor.id
  description       = "SSH (Ansible y GitHub Actions)"
  cidr_ipv4         = each.value
  ip_protocol       = "tcp"
  from_port         = 22
  to_port           = 22
}

resource "aws_vpc_security_group_egress_rule" "todo" {
  security_group_id = aws_security_group.servidor.id
  description       = "Salida a internet (apt, npm, GitHub, Let's Encrypt)"
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "-1"
}

# --- Servidor
resource "aws_instance" "servidor" {
  ami                    = data.aws_ssm_parameter.ubuntu.value
  instance_type          = var.tipo_instancia
  subnet_id              = aws_subnet.publica.id
  vpc_security_group_ids = [aws_security_group.servidor.id]

  # cloud-init: usuarios y llaves, swap, zona horaria y paquetes base.
  user_data = templatefile("${path.module}/cloud-init.yaml.tftpl", {
    clave_admin      = trimspace(file(pathexpand(var.clave_ssh_admin)))
    clave_despliegue = trimspace(file(pathexpand(var.clave_ssh_despliegue)))
  })
  user_data_replace_on_change = true

  root_block_device {
    volume_size = var.disco_gb
    volume_type = "gp3"
    encrypted   = true
  }

  metadata_options {
    http_tokens = "required" # IMDSv2
  }

  tags = { Name = local.nombre }

  lifecycle {
    # Una AMI nueva de Ubuntu no debe recrear el servidor en cada plan.
    ignore_changes = [ami]
  }
}

# IP fija: no cambia si se detiene y se vuelve a encender la instancia.
resource "aws_eip" "servidor" {
  domain   = "vpc"
  instance = aws_instance.servidor.id
  tags     = { Name = local.nombre }
}

# Inventario para Ansible (lo lee infra/ansible/ansible.cfg).
resource "local_file" "inventario" {
  filename        = "${path.module}/../ansible/inventario.ini"
  file_permission = "0644"
  content         = <<-EOT
    # Generado por Terraform (infra/terraform). No editar a mano.
    [servidor]
    entradasya ansible_host=${aws_eip.servidor.public_ip} ansible_user=ubuntu
  EOT
}
