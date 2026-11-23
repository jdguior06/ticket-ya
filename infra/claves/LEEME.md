# Llaves SSH

- `github-actions.pub` — llave **pública** del pipeline. cloud-init la instala en el usuario `deploy` del servidor. Se puede subir a git.
- `github-actions` — llave **privada**. Va SOLO en el secreto `SERVIDOR_SSH_KEY` de GitHub. Nunca a git (está en `.gitignore`).

Crear: `ssh-keygen -t ed25519 -f infra/claves/github-actions -N "" -C github-actions`
