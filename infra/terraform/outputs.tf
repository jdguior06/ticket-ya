output "ip_publica" {
  description = "IP fija del servidor."
  value       = aws_eip.servidor.public_ip
}

output "dominio" {
  description = "Nombre con nip.io (resuelve a la IP); sirve para el certificado HTTPS."
  value       = "entradasya.${aws_eip.servidor.public_ip}.nip.io"
}

output "url" {
  value = "https://entradasya.${aws_eip.servidor.public_ip}.nip.io"
}

output "ssh_admin" {
  value = "ssh ubuntu@${aws_eip.servidor.public_ip}"
}

output "siguiente_paso" {
  value = "cd ../ansible && ansible-playbook servidor.yml"
}
