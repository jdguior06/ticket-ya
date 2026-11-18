export const ROLES = ['CUSTOMER', 'ORGANIZER', 'DOORMAN'] as const;
export type Role = (typeof ROLES)[number];

/** Contenido del JWT emitido por auth (ver docs/CONTRATOS.md §1.3). */
export interface JwtPayload {
  sub: string;
  role: Role;
  name: string;
  email: string;
}

/** Usuario autenticado disponible en req.user. */
export interface AuthUser {
  id: string;
  role: Role;
  name: string;
  email: string;
}
