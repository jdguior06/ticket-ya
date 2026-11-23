import { BrowserQRCodeReader } from '@zxing/browser';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Alert, Loading } from '../../components/ui';
import { api, ApiError } from '../../lib/api';
import { dateParts, longDate, timeOnly } from '../../lib/format';
import { errorText, SCAN_REASON } from '../../lib/messages';
import type { EventItem, ScanResult } from '../../lib/types';

const EVENT_KEY = 'ey.portero.evento';
const RESULT_MS = 3200; // cuánto se muestra el resultado antes de volver a escanear
const SAME_CODE_MS = 5000; // ignora el mismo QR si sigue frente a la cámara

function remember(id: string | null) {
  try {
    if (id) localStorage.setItem(EVENT_KEY, id);
    else localStorage.removeItem(EVENT_KEY);
  } catch {
    /* sin almacenamiento */
  }
}
function remembered(): string | null {
  try {
    return localStorage.getItem(EVENT_KEY);
  } catch {
    return null;
  }
}

/** Pitido corto: agudo si pasa, grave si se rechaza. */
function beep(ok: boolean) {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = ok ? 880 : 220;
    osc.type = ok ? 'sine' : 'square';
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + (ok ? 0.18 : 0.45));
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.5);
    navigator.vibrate?.(ok ? 80 : [120, 80, 120]);
  } catch {
    /* sin audio */
  }
}

export function Portero() {
  const [events, setEvents] = useState<EventItem[] | null>(null);
  const [eventId, setEventId] = useState<string | null>(remembered());
  const [error, setError] = useState('');

  useEffect(() => {
    const from = new Date(Date.now() - 12 * 3600e3).toISOString();
    api<EventItem[]>(`/events?from=${encodeURIComponent(from)}`)
      .then(setEvents)
      .catch((e) => setError(errorText(e)));
  }, []);

  const event = events?.find((e) => e.id === eventId) ?? null;

  if (error) return <Alert>{error}</Alert>;
  if (!events) return <Loading text="Cargando eventos…" />;
  if (!event) {
    return (
      <EventPicker
        events={events}
        onPick={(id) => {
          remember(id);
          setEventId(id);
        }}
      />
    );
  }
  return (
    <Scanner
      event={event}
      onChangeEvent={() => {
        remember(null);
        setEventId(null);
      }}
    />
  );
}

function EventPicker({ events, onPick }: { events: EventItem[]; onPick: (id: string) => void }) {
  return (
    <div className="mx-auto max-w-xl">
      <h1 className="text-3xl font-extrabold">¿En qué evento estás?</h1>
      <p className="mt-2 text-tinta-suave">Solo se aceptarán las entradas de este evento.</p>
      {events.length === 0 ? (
        <p className="mt-8 rounded-2xl border-2 border-dashed border-linea px-6 py-10 text-center text-tinta-suave">
          No hay eventos publicados para hoy ni para los próximos días.
        </p>
      ) : (
        <ul className="mt-6 space-y-3">
          {events.map((e) => {
            const d = dateParts(e.startsAt);
            return (
              <li key={e.id}>
                <button
                  onClick={() => onPick(e.id)}
                  className="flex w-full items-center gap-5 rounded-2xl bg-white px-5 py-4 text-left ring-1 ring-linea hover:ring-tinta"
                >
                  <span className="w-12 text-center">
                    <span className="block text-sm capitalize text-tinta-suave">{d.month}</span>
                    <span className="font-display text-2xl font-extrabold leading-none">{d.day}</span>
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-lg font-bold">{e.name}</span>
                    <span className="block text-tinta-suave">
                      {d.time} h, {e.venue}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

type Shown = { kind: 'result'; result: ScanResult } | { kind: 'error'; message: string } | null;

function Scanner({ event, onChangeEvent }: { event: EventItem; onChangeEvent: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const busyRef = useRef(false);
  const lastRef = useRef<{ code: string; at: number }>({ code: '', at: 0 });
  const timerRef = useRef<number | undefined>(undefined);
  const [shown, setShown] = useState<Shown>(null);
  const [camera, setCamera] = useState<'starting' | 'on' | 'off'>('starting');
  const [cameraError, setCameraError] = useState('');
  const [manual, setManual] = useState('');
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    api<{ totalCheckedIn?: number }>(`/checkin/events/${event.id}/stats`)
      .then((s) => setCount(s.totalCheckedIn ?? null))
      .catch(() => setCount(null));
  }, [event.id]);

  const dismiss = useCallback(() => {
    window.clearTimeout(timerRef.current);
    setShown(null);
    busyRef.current = false;
  }, []);

  const validate = useCallback(
    async (raw: string) => {
      const code = raw.replace(/\s+/g, '').toUpperCase();
      if (!code || busyRef.current) return;
      const now = Date.now();
      if (lastRef.current.code === code && now - lastRef.current.at < SAME_CODE_MS) return;
      lastRef.current = { code, at: now };
      busyRef.current = true;
      try {
        const result = await api<ScanResult>('/checkin/scan', { method: 'POST', body: { code, eventId: event.id } });
        beep(result.allowed);
        if (result.totalCheckedIn !== undefined) setCount(result.totalCheckedIn);
        setShown({ kind: 'result', result });
      } catch (err) {
        beep(false);
        const message =
          err instanceof ApiError && (err.code === 'DEPENDENCY_UNAVAILABLE' || err.code === 'NETWORK')
            ? 'Sin conexión con el sistema. Vuelve a escanear en unos segundos.'
            : errorText(err);
        setShown({ kind: 'error', message });
        lastRef.current = { code: '', at: 0 }; // permitir reintentar el mismo código
      }
      window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(dismiss, RESULT_MS);
    },
    [event.id, dismiss],
  );

  // validate cambia cuando cambia el evento; la cámara no debe reiniciarse por eso.
  const validateRef = useRef(validate);
  useEffect(() => {
    validateRef.current = validate;
  }, [validate]);

  // Cámara trasera. La abrimos nosotros (no la librería) por una razón concreta:
  // en desarrollo React monta la pantalla dos veces, y el stop() de @zxing deja en null
  // el video aunque ya lo esté usando la segunda apertura -> pantalla negra.
  // Aquí cada apertura solo limpia el video si sigue mostrando SU propia cámara.
  useEffect(() => {
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setCamera('off');
      setCameraError('La cámara solo funciona si abres la página con https://. Mientras tanto, escribe el código.');
      return;
    }
    const video = videoRef.current!;
    const reader = new BrowserQRCodeReader();
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    let stream: MediaStream | null = null;
    let timer: number | undefined;
    let cancelled = false;

    // Lee un cuadro cada 200 ms (reducido a 800 px de ancho: suficiente para un QR y liviano en el teléfono).
    const scan = () => {
      if (cancelled) return;
      if (ctx && video.readyState >= video.HAVE_CURRENT_DATA && video.videoWidth > 0) {
        const scale = Math.min(1, 800 / video.videoWidth);
        canvas.width = Math.round(video.videoWidth * scale);
        canvas.height = Math.round(video.videoHeight * scale);
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        try {
          const result = reader.decodeFromCanvas(canvas);
          void validateRef.current(result.getText());
        } catch {
          /* este cuadro no tiene un QR legible */
        }
      }
      timer = window.setTimeout(scan, 200);
    };

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
        if (cancelled) return;
        video.srcObject = stream;
        await video.play();
        if (cancelled) return;
        setCamera('on');
        scan();
      } catch (err: unknown) {
        if (cancelled) return;
        setCamera('off');
        const name = err instanceof Error ? err.name : '';
        setCameraError(
          name === 'NotAllowedError'
            ? 'No diste permiso para usar la cámara. Actívalo en el navegador o escribe el código.'
            : name === 'NotFoundError' || name === 'OverconstrainedError'
              ? 'No encontramos una cámara en este dispositivo. Escribe el código de la entrada.'
              : name === 'NotReadableError'
                ? 'Otra app está usando la cámara. Ciérrala y vuelve a abrir esta pantalla.'
                : 'No se pudo abrir la cámara. Escribe el código de la entrada.',
        );
      }
    })();

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
      if (stream && video.srcObject === stream) video.srcObject = null;
    };
  }, []);

  useEffect(() => () => window.clearTimeout(timerRef.current), []);

  function submitManual(e: FormEvent) {
    e.preventDefault();
    lastRef.current = { code: '', at: 0 };
    void validate(manual);
    setManual('');
  }

  const d = dateParts(event.startsAt);

  return (
    <div className="-mx-4 -my-8 min-h-[calc(100dvh-4rem)] bg-tinta px-4 py-6 text-white sm:mx-0 sm:my-0 sm:rounded-3xl sm:p-8">
      <div className="mx-auto max-w-md">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="line-clamp-2 text-2xl leading-tight font-bold">{event.name}</h1>
            <p className="text-white/70">
              {d.weekday} {d.day}, {d.time} h
            </p>
          </div>
          <button onClick={onChangeEvent} className="shrink-0 rounded-full px-3 py-1.5 text-sm font-semibold ring-1 ring-white/30 hover:bg-white/10">
            Cambiar evento
          </button>
        </div>

        <div className="mt-6 flex items-baseline gap-3">
          <span className="font-display text-6xl font-extrabold text-ambar tabular-nums" aria-live="polite">
            {count ?? '—'}
          </span>
          <span className="text-white/70">personas ingresaron</span>
        </div>

        {/* Visor de la cámara */}
        <div className="relative mt-6 aspect-square overflow-hidden rounded-3xl bg-black">
          <video ref={videoRef} className="size-full object-cover" autoPlay muted playsInline aria-label="Cámara para escanear el QR" />
          {camera === 'on' && !shown && (
            <div className="pointer-events-none absolute inset-10 rounded-2xl border-4 border-dashed border-white/60" aria-hidden="true" />
          )}
          {camera === 'starting' && <p className="absolute inset-0 grid place-items-center text-white/70">Abriendo cámara…</p>}
          {camera === 'off' && <p className="absolute inset-0 grid place-items-center px-8 text-center text-white/80">{cameraError}</p>}

          {shown && <ResultPanel shown={shown} onNext={dismiss} />}
        </div>

        <form onSubmit={submitManual} className="mt-6">
          <label htmlFor="codigo" className="mb-2 block font-semibold">
            ¿El QR no se lee? Escribe el código
          </label>
          <div className="flex gap-2">
            <input
              id="codigo"
              value={manual}
              onChange={(e) => setManual(e.target.value)}
              placeholder="EY-XXXX-XXXX-XXXX"
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
              className="min-w-0 flex-1 rounded-xl bg-white/10 px-4 py-3 font-display text-lg tracking-wide text-white uppercase placeholder:text-white/40 focus:bg-white/15 focus:outline-none"
            />
            <button type="submit" className="rounded-xl bg-ambar px-5 font-semibold text-tinta hover:bg-ambar/90">
              Validar
            </button>
          </div>
        </form>
        <p className="mt-6 text-sm text-white/50">{longDate(event.startsAt)}, {event.venue}</p>
      </div>
    </div>
  );
}

function ResultPanel({ shown, onNext }: { shown: NonNullable<Shown>; onNext: () => void }) {
  if (shown.kind === 'error') {
    return (
      <button onClick={onNext} className="sello absolute inset-0 flex flex-col items-center justify-center gap-3 bg-tinta/95 px-8 text-center">
        <span className="text-2xl font-bold">No se pudo validar</span>
        <span className="text-white/80">{shown.message}</span>
        <span className="mt-4 text-sm text-white/60">Toca para seguir</span>
      </button>
    );
  }
  const r = shown.result;
  const ok = r.allowed;
  return (
    <button
      onClick={onNext}
      className={`sello absolute inset-0 flex flex-col items-center justify-center gap-2 px-8 text-center ${ok ? 'bg-ok' : 'bg-error'}`}
      aria-live="assertive"
    >
      <svg viewBox="0 0 24 24" className="size-24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {ok ? <path d="M5 12.5l4.5 4.5L19 7.5" /> : <path d="M6 6l12 12M18 6L6 18" />}
      </svg>
      <span className="font-display text-4xl font-extrabold">{ok ? 'Puede ingresar' : SCAN_REASON[r.reason ?? 'INVALID_CODE']}</span>
      {r.reason === 'ALREADY_USED' && r.firstCheckedInAt && (
        <span className="text-xl font-semibold">Ingresó a las {timeOnly(r.firstCheckedInAt)}</span>
      )}
      {r.ticket && (
        <span className="mt-1 text-lg text-white/90">
          {r.ticket.holderName}, {r.ticket.sectorName}
        </span>
      )}
      <span className="mt-4 text-sm text-white/70">Toca para escanear la siguiente</span>
    </button>
  );
}
