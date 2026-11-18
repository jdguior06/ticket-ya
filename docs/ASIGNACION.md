# Asignación de trabajo

Cada agente modifica **solo** sus carpetas. `docs/CONTRATOS.md` lo puede tocar cualquiera, pero avisando el cambio en su resumen.

| Parte | Responsable | Rama | Estado |
|---|---|---|---|
| Base del repo, contratos, infra | Claude | `main` | hecho |
| services/auth (referencia) | Claude | `feat/auth` | hecho, probado (falta tu migración inicial) |
| services/events | Claude | `feat/events` | hecho, probado (falta tu migración inicial) |
| services/payments | Codex | `fix/payments` | hecho; correcciones de revisión pendientes |
| services/notifications | Codex | `fix/notifications` | hecho; correcciones de revisión pendientes |
| services/tickets | Claude | `feat/tickets` | hecho, probado (falta tu migración inicial) |
| services/orders | por definir | `feat/orders` | pendiente |
| services/checkin | por definir | `feat/checkin` | pendiente |
| web | por definir | `feat/web` | pendiente |

Revisión cruzada: lo que hace Codex lo revisa Claude y viceversa, antes de que Diego lo una a `main`.
