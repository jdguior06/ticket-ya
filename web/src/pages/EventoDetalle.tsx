import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { Alert, BackLink, Button, ButtonLink, Field, Loading } from '../components/ui';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { bs, longDate } from '../lib/format';
import { errorText } from '../lib/messages';
import { uuid } from '../lib/id';
import type { EventItem, Order } from '../lib/types';

const MAX_PER_ORDER = 6;

export function EventoDetalle() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [event, setEvent] = useState<EventItem | null>(null);
  const [loadError, setLoadError] = useState('');
  const [sectorId, setSectorId] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [card, setCard] = useState({ number: '', holder: '', exp: '', cvv: '' });
  const [buying, setBuying] = useState(false);
  const [error, setError] = useState('');
  // Una clave por intento: si el usuario hace doble clic, el servidor devuelve la misma orden.
  const [attemptKey, setAttemptKey] = useState(() => uuid());

  const load = () =>
    api<EventItem>(`/events/${id}`)
      .then((e) => {
        setEvent(e);
        setSectorId((cur) => cur || e.sectors.find((s) => s.available > 0)?.id || '');
      })
      .catch((e) => setLoadError(errorText(e)));

  useEffect(() => {
    void load();
  }, [id]); // load depende solo de id

  const sector = useMemo(() => event?.sectors.find((s) => s.id === sectorId), [event, sectorId]);
  const maxQty = Math.min(MAX_PER_ORDER, sector?.available ?? 0);
  const total = sector ? sector.priceCents * quantity : 0;
  const isCustomer = user?.role === 'CUSTOMER';

  useEffect(() => {
    if (quantity > maxQty && maxQty > 0) setQuantity(maxQty);
  }, [maxQty, quantity]);

  async function buy(e: FormEvent) {
    e.preventDefault();
    if (!sector) return;
    const [mm, yy] = card.exp.split('/').map((p) => Number(p.trim()));
    setError('');
    setBuying(true);
    try {
      const order = await api<Order>('/orders', {
        method: 'POST',
        headers: { 'Idempotency-Key': attemptKey },
        body: {
          eventId: event!.id,
          sectorId: sector.id,
          quantity,
          card: { number: card.number.replace(/\s/g, ''), holder: card.holder, expMonth: mm, expYear: yy < 100 ? 2000 + yy : yy, cvv: card.cvv },
        },
      });
      navigate(`/mis-entradas?orden=${order.id}`, { state: { justBought: order.id } });
    } catch (err) {
      setError(errorText(err));
      setAttemptKey(uuid()); // el próximo intento es una compra nueva
      if (err instanceof ApiError && (err.code === 'SOLD_OUT' || err.code === 'PAYMENT_REJECTED')) void load();
      if (err instanceof ApiError && err.code === 'PAYMENT_PENDING') navigate('/mis-compras');
    } finally {
      setBuying(false);
    }
  }

  if (loadError) return <Alert>{loadError}</Alert>;
  if (!event) return <Loading />;

  const onSale = event.status === 'PUBLISHED' && new Date(event.startsAt) > new Date();

  const stepBtn =
    'grid size-9 place-items-center rounded-lg text-lg ring-1 ring-inset ring-linea hover:bg-niebla disabled:opacity-40 disabled:hover:bg-transparent';

  return (
    <>
      <BackLink to="/">Cartelera</BackLink>

      {event.imageUrl && (
        <div className="mb-8 overflow-hidden rounded-3xl bg-niebla sm:mb-10">
          <img src={event.imageUrl} alt="" className="aspect-[16/9] max-h-[28rem] w-full object-cover sm:aspect-[21/9]" />
        </div>
      )}

      <div className="grid gap-10 lg:grid-cols-[1fr_25rem] lg:gap-14">
        <article className="min-w-0">
          <p className="font-medium text-tinta-suave">{longDate(event.startsAt)}</p>
          <h1 className="mt-2 text-4xl sm:text-5xl">{event.name}</h1>
          <p className="mt-3 flex items-center gap-2 text-lg text-tinta-suave">
            <svg viewBox="0 0 20 20" className="size-5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
              <path d="M10 17.5s5.5-4.8 5.5-9.5a5.5 5.5 0 1 0-11 0c0 4.7 5.5 9.5 5.5 9.5Z" />
              <circle cx="10" cy="8" r="2" />
            </svg>
            {event.venue}
          </p>

          {event.status === 'CANCELLED' && (
            <div className="mt-6">
              <Alert>Este evento fue cancelado.</Alert>
            </div>
          )}

          {event.description && (
            <section className="mt-10 border-t border-linea pt-8">
              <h2 className="text-xl">Sobre el evento</h2>
              <p className="mt-3 max-w-prose whitespace-pre-line leading-relaxed text-tinta/85">{event.description}</p>
            </section>
          )}

          <section className="mt-10 border-t border-linea pt-8">
            <h2 className="text-xl">Antes de ir</h2>
            <ul className="mt-3 max-w-prose space-y-2 text-tinta/85">
              <li>Tus entradas llegan al instante a Mis entradas y por correo, cada una con su código QR.</li>
              <li>En la puerta muestran el QR desde el celular o impreso. Cada código sirve para un solo ingreso.</li>
              <li>Puedes comprar hasta {MAX_PER_ORDER} entradas por compra.</li>
            </ul>
          </section>
        </article>

        <section aria-labelledby="comprar" className="lg:sticky lg:top-24 lg:self-start">
          <div className="rounded-2xl border border-linea bg-white p-5 shadow-elevada sm:p-6">
            <h2 id="comprar" className="text-xl">
              Entradas
            </h2>

            <fieldset className="mt-4 space-y-2" disabled={!onSale}>
              <legend className="sr-only">Sector</legend>
              {event.sectors.map((s) => {
                const soldOut = s.available === 0;
                const selected = s.id === sectorId;
                return (
                  <label
                    key={s.id}
                    className={`flex cursor-pointer items-center gap-3 rounded-xl px-4 py-3 transition-colors ${
                      selected ? 'bg-niebla ring-2 ring-tinta' : 'ring-1 ring-linea hover:ring-tinta/30'
                    } ${soldOut ? 'cursor-not-allowed opacity-50' : ''} has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ambar`}
                  >
                    <input
                      type="radio"
                      name="sector"
                      value={s.id}
                      checked={selected}
                      disabled={soldOut}
                      onChange={() => setSectorId(s.id)}
                      className="sr-only"
                    />
                    <span
                      className={`grid size-4 shrink-0 place-items-center rounded-full ring-1 ${selected ? 'bg-tinta ring-tinta' : 'bg-white ring-tinta/30'}`}
                      aria-hidden="true"
                    >
                      {selected && <span className="size-1.5 rounded-full bg-white" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold">{s.name}</span>
                      <span className={`block text-sm ${soldOut ? 'text-error' : 'text-tinta-suave'}`}>
                        {soldOut ? 'Agotado' : s.available <= 20 ? `Quedan ${s.available}` : `${s.available} disponibles`}
                      </span>
                    </span>
                    <span className="font-semibold tabular-nums">{bs(s.priceCents)}</span>
                  </label>
                );
              })}
            </fieldset>

            {!onSale ? (
              <p className="mt-5 rounded-xl bg-niebla px-4 py-3 text-tinta-suave">La venta de este evento está cerrada.</p>
            ) : !user ? (
              <div className="mt-5 space-y-3">
                <ButtonLink to={`/login?volver=${encodeURIComponent(`/eventos/${event.id}`)}`} size="lg" className="w-full">
                  Inicia sesión para comprar
                </ButtonLink>
                <p className="text-center text-sm text-tinta-suave">
                  ¿No tienes cuenta?{' '}
                  <Link to={`/registro?volver=${encodeURIComponent(`/eventos/${event.id}`)}`} className="font-medium text-tinta underline">
                    Créala en un minuto
                  </Link>
                </p>
              </div>
            ) : !isCustomer ? (
              <p className="mt-5 rounded-xl bg-niebla px-4 py-3 text-tinta-suave">Las compras se hacen con una cuenta de cliente.</p>
            ) : sector && maxQty > 0 ? (
              <form onSubmit={buy} className="mt-5">
                <div className="flex items-center justify-between">
                  <span id="qty-label">
                    <span className="block font-medium">Cantidad</span>
                    <span className="block text-sm text-tinta-suave">Máximo {Math.min(MAX_PER_ORDER, maxQty)}</span>
                  </span>
                  <div className="flex items-center gap-2" role="group" aria-labelledby="qty-label">
                    <button type="button" disabled={quantity <= 1} onClick={() => setQuantity((q) => Math.max(1, q - 1))} className={stepBtn} aria-label="Una entrada menos">
                      −
                    </button>
                    <span className="w-8 text-center text-lg font-semibold tabular-nums" aria-live="polite">
                      {quantity}
                    </span>
                    <button type="button" disabled={quantity >= maxQty} onClick={() => setQuantity((q) => Math.min(maxQty, q + 1))} className={stepBtn} aria-label="Una entrada más">
                      +
                    </button>
                  </div>
                </div>

                <div className="mt-5 grid gap-3 border-t border-linea pt-5">
                  <p className="font-medium">Pago</p>
                  <Field label="Número de tarjeta" inputMode="numeric" autoComplete="cc-number" required placeholder="4111 1111 1111 1111" value={card.number} onChange={(e) => setCard({ ...card, number: e.target.value })} />
                  <Field label="Nombre en la tarjeta" autoComplete="cc-name" required value={card.holder} onChange={(e) => setCard({ ...card, holder: e.target.value })} />
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Vence (MM/AA)" inputMode="numeric" autoComplete="cc-exp" required placeholder="12/28" pattern="\d{1,2}\s*/\s*\d{2,4}" value={card.exp} onChange={(e) => setCard({ ...card, exp: e.target.value })} />
                    <Field label="CVV" inputMode="numeric" autoComplete="cc-csc" required maxLength={4} value={card.cvv} onChange={(e) => setCard({ ...card, cvv: e.target.value })} />
                  </div>
                  <p className="text-sm text-tinta-suave">Pago de prueba: no se cobra dinero real. Una tarjeta terminada en 0000 se rechaza.</p>
                </div>

                <dl className="mt-5 space-y-1.5 border-t border-linea pt-5 text-[0.95rem]">
                  <div className="flex justify-between text-tinta-suave">
                    <dt>
                      {quantity} × {sector.name}
                    </dt>
                    <dd className="tabular-nums">{bs(sector.priceCents)} c/u</dd>
                  </div>
                  <div className="flex items-baseline justify-between">
                    <dt className="font-semibold">Total</dt>
                    <dd className="text-xl font-semibold tabular-nums">{bs(total)}</dd>
                  </div>
                </dl>

                {error && (
                  <div className="mt-4">
                    <Alert>{error}</Alert>
                  </div>
                )}

                <Button type="submit" size="lg" loading={buying} className="mt-5 w-full">
                  {buying ? 'Procesando compra…' : `Pagar ${bs(total)}`}
                </Button>
              </form>
            ) : (
              <p className="mt-5 rounded-xl bg-error/[0.06] px-4 py-3 font-medium text-error">Este evento está agotado.</p>
            )}
          </div>
        </section>
      </div>
    </>
  );
}
