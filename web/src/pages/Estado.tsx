import { useCallback, useEffect, useState } from 'react';
import { PageTitle } from '../components/ui';

// Estado de los 7 microservicios. Cada uno se consulta por el gateway en /api/estado/<servicio>,
// que lleva a su GET /health. Si un servicio está apagado, el gateway no recibe respuesta.

interface Service {
  name: string;
  label: string;
  /** Qué deja de funcionar si este servicio cae (para explicarlo en la demo). */
  impact: string;
}

const SERVICES: Service[] = [
  { name: 'auth', label: 'Cuentas', impact: 'No se puede registrar ni iniciar sesión. Quien ya entró sigue comprando.' },
  { name: 'events', label: 'Cartelera', impact: 'No se ven ni se crean eventos, y no se puede reservar cupo.' },
  { name: 'orders', label: 'Compras', impact: 'No se puede comprar ni ver el historial de compras.' },
  { name: 'payments', label: 'Pagos', impact: 'Las compras quedan en «Confirmando pago» hasta que vuelva. Nunca se cobra dos veces.' },
  { name: 'tickets', label: 'Entradas', impact: 'La compra se cobra igual; las entradas se generan cuando vuelva.' },
  { name: 'notifications', label: 'Correos', impact: 'La compra funciona; solo no llega el correo de confirmación.' },
  { name: 'checkin', label: 'Control de ingreso', impact: 'El portero no puede validar entradas en la puerta.' },
];

const CHECK_LABEL: Record<string, string> = {
  db: 'base de datos',
  smtp: 'servidor de correo',
  storage: 'almacenamiento de PDFs',
  images: 'almacenamiento de fotos',
};

type State =
  | { kind: 'loading' }
  | { kind: 'ok'; ms: number; uptime?: number }
  | { kind: 'degraded'; ms: number; failing: string[] }
  | { kind: 'down' };

const REFRESH_MS = 5000;

async function probe(name: string): Promise<State> {
  const started = performance.now();
  try {
    const res = await fetch(`/api/estado/${name}`, { cache: 'no-store', signal: AbortSignal.timeout(4000) });
    const ms = Math.round(performance.now() - started);
    const body = (await res.json().catch(() => null)) as {
      service?: string;
      checks?: Record<string, string>;
      uptimeSeconds?: number;
    } | null;
    // Solo cuenta si respondió el propio servicio (el gateway, con el servicio apagado, no trae "service").
    if (!body?.service) return { kind: 'down' };
    if (res.ok) return { kind: 'ok', ms, uptime: body.uptimeSeconds };
    const failing = Object.entries(body.checks ?? {})
      .filter(([, v]) => v !== 'up')
      .map(([k]) => CHECK_LABEL[k] ?? k);
    return { kind: 'degraded', ms, failing };
  } catch {
    return { kind: 'down' };
  }
}

function uptimeText(s?: number) {
  if (s === undefined) return '';
  if (s < 60) return `encendido hace ${s} s`;
  if (s < 3600) return `encendido hace ${Math.floor(s / 60)} min`;
  return `encendido hace ${Math.floor(s / 3600)} h`;
}

const DOT = {
  loading: 'bg-tinta/20',
  ok: 'bg-ok',
  degraded: 'bg-ambar',
  down: 'bg-error',
} as const;

export function Estado() {
  const [states, setStates] = useState<Record<string, State>>(() =>
    Object.fromEntries(SERVICES.map((s) => [s.name, { kind: 'loading' } as State])),
  );
  const [checkedAt, setCheckedAt] = useState<Date | null>(null);

  const refresh = useCallback(async () => {
    const results = await Promise.all(SERVICES.map(async (s) => [s.name, await probe(s.name)] as const));
    setStates(Object.fromEntries(results));
    setCheckedAt(new Date());
  }, []);

  useEffect(() => {
    void refresh();
    const t = setInterval(() => void refresh(), REFRESH_MS);
    return () => clearInterval(t);
  }, [refresh]);

  const values = Object.values(states);
  const down = values.filter((s) => s.kind === 'down' || s.kind === 'degraded').length;
  const loading = values.some((s) => s.kind === 'loading');

  return (
    <div className="mx-auto max-w-3xl">
      <PageTitle
        subtitle={
          <span aria-live="polite">
            {loading
              ? 'Consultando los servicios…'
              : down === 0
                ? 'Los 7 servicios funcionan.'
                : `${down} de 7 servicios con problemas. El resto sigue funcionando.`}
            {checkedAt && ` Se actualiza cada ${REFRESH_MS / 1000} segundos.`}
          </span>
        }
      >
        Estado del sistema
      </PageTitle>

      <ul className="divide-y divide-linea overflow-hidden rounded-2xl border border-linea bg-white shadow-tarjeta">
        {SERVICES.map((s) => {
          const st = states[s.name];
          return (
            <li key={s.name} className="flex gap-4 px-5 py-4 sm:px-6">
              <span className="relative mt-1.5 flex size-3 shrink-0">
                {st.kind === 'down' && (
                  <span className="absolute inline-flex size-full rounded-full bg-error/60 motion-safe:animate-ping" />
                )}
                <span className={`relative inline-flex size-3 rounded-full ${DOT[st.kind]}`} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <p className="font-semibold">
                    {s.label} <span className="font-normal text-tinta-suave">· {s.name}</span>
                  </p>
                  <p className="text-sm text-tinta-suave">
                    {st.kind === 'ok' && `Funciona · ${st.ms} ms · ${uptimeText(st.uptime)}`}
                    {st.kind === 'degraded' && <span className="font-semibold text-tinta">Con problemas</span>}
                    {st.kind === 'down' && <span className="font-semibold text-error">No responde</span>}
                    {st.kind === 'loading' && 'Consultando…'}
                  </p>
                </div>
                {st.kind === 'degraded' && (
                  <p className="mt-1 text-sm">Responde, pero falla: {st.failing.join(', ') || 'una dependencia'}.</p>
                )}
                {(st.kind === 'down' || st.kind === 'degraded') && (
                  <p className="mt-1 text-sm text-tinta-suave">{s.impact}</p>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
