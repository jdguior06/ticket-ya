/**
 * Valida las variables de entorno al arrancar. Si falta alguna requerida,
 * el servicio no inicia y muestra cuáles faltan.
 */
export function createEnvValidator(required: string[], defaults: Record<string, string> = {}) {
  return (config: Record<string, unknown>): Record<string, unknown> => {
    const merged: Record<string, unknown> = { ...defaults, ...config };
    const missing = required.filter((key) => merged[key] === undefined || merged[key] === '');
    if (missing.length) {
      throw new Error(`Faltan variables de entorno: ${missing.join(', ')}. Revisa tu archivo .env (copia de .env.example).`);
    }
    const port = Number(merged.PORT);
    if (!Number.isInteger(port) || port <= 0) {
      throw new Error(`PORT inválido: ${String(merged.PORT)}`);
    }
    return merged;
  };
}
