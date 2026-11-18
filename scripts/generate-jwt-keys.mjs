// Genera el par de llaves RS256 para los JWT.
// Uso (desde la raíz del repo):  node scripts/generate-jwt-keys.mjs
// Crea keys/jwt-private.pem (solo la usa auth) y keys/jwt-public.pem (la usan todos).
import { generateKeyPairSync } from 'node:crypto';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const dir = join(process.cwd(), 'keys');
const privPath = join(dir, 'jwt-private.pem');
const pubPath = join(dir, 'jwt-public.pem');

if (existsSync(privPath) && !process.argv.includes('--force')) {
  console.log('Las llaves ya existen en keys/. Usa --force para regenerarlas (invalida todos los tokens).');
  process.exit(0);
}

const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

mkdirSync(dir, { recursive: true });
writeFileSync(privPath, privateKey);
writeFileSync(pubPath, publicKey);
console.log('Llaves creadas:\n  ' + privPath + '\n  ' + pubPath);
