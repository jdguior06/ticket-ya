import { randomBytes } from 'node:crypto';

// 32 símbolos: sin 0/O ni 1/I para que el portero no los confunda al escribirlos.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** Genera un código EY-XXXX-XXXX-XXXX con 60 bits aleatorios (crypto, no Math.random). */
export function generateTicketCode(): string {
  const bytes = randomBytes(12);
  // 256 es múltiplo de 32: "byte % 32" es uniforme, sin sesgo.
  const chars = Array.from(bytes, (b) => ALPHABET[b % 32]).join('');
  return `EY-${chars.slice(0, 4)}-${chars.slice(4, 8)}-${chars.slice(8, 12)}`;
}
