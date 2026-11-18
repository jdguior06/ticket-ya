// Cliente HTTP de la web. Todo va por el gateway: /api/<servicio>/...
const TOKEN_KEY = 'ey.token';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}
export function setToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* almacenamiento no disponible: la sesión dura lo que la pestaña */
  }
}

let onUnauthorized: (() => void) | null = null;
/** El AuthProvider se registra aquí para cerrar sesión si el token venció. */
export function setUnauthorizedHandler(fn: () => void) {
  onUnauthorized = fn;
}

interface Options {
  method?: 'GET' | 'POST' | 'PATCH';
  body?: unknown;
  headers?: Record<string, string>;
  auth?: boolean; // por defecto se envía el token si existe
}

export async function api<T>(path: string, opts: Options = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json', ...opts.headers };
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  const token = opts.auth === false ? null : getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method: opts.method ?? 'GET',
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'NETWORK', 'Sin conexión con el servidor. Revisa tu red e intenta de nuevo.');
  }

  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }

  if (!res.ok) {
    const body = (data ?? {}) as { code?: string; message?: string; details?: Record<string, unknown> };
    if (res.status === 401 && token && body.code === 'UNAUTHORIZED') onUnauthorized?.();
    // 502/504: el proxy no encontró el servicio (está apagado).
    if (!body.code && (res.status === 502 || res.status === 504 || res.status === 500)) {
      throw new ApiError(res.status, 'DEPENDENCY_UNAVAILABLE', 'El servicio no responde. Intenta en unos minutos.');
    }
    throw new ApiError(res.status, body.code ?? 'HTTP_ERROR', body.message ?? `Error ${res.status}`, body.details ?? {});
  }
  return data as T;
}

/** Descarga un archivo protegido (PDF) con el token y lo guarda con su nombre. */
export async function download(path: string, filename: string): Promise<void> {
  const token = getToken();
  const res = await fetch(`/api${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!res.ok) throw new ApiError(res.status, 'DOWNLOAD_FAILED', 'No se pudo descargar el archivo.');
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
