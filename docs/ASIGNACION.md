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
| services/orders | Claude | `feat/orders` | hecho, probado con los 6 servicios (falta tu migración inicial) |
| services/checkin | Codex | `feat/checkin` | hecho; revisado y probado por Claude (E2E con segundo escaneo y 5 escaneos simultáneos) |
| web | Claude | `feat/web` | hecho; portero probado con checkin real |

Revisión cruzada: lo que hace Codex lo revisa Claude y viceversa, antes de que Diego lo una a `main`.
