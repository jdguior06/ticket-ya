import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { Alert, Button, Field, Loading } from '../components/ui';
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

  return (
    <div className="grid gap-10 lg:grid-cols-[1.1fr_1fr]">
      <article>
        {event.imageUrl && (
          <img src={event.imageUrl} alt="" className="mb-6 aspect-[16/9] w-full rounded-2xl object-cover" />
        )}
        <p className="text-lg text-tinta-suave">{longDate(event.startsAt)}</p>
        <h1 className="mt-1 text-4xl font-extrabold leading-tight sm:text-5xl">{event.name}</h1>
        <p className="mt-2 text-xl">{event.venue}</p>
        {event.description && <p className="mt-6 max-w-prose whitespace-pre-line leading-relaxed text-tinta/85">{event.description}</p>}
        {event.status === 'CANCELLED' && (
          <div className="mt-6">
            <Alert>Este evento fue cancelado.</Alert>
          </div>
        )}
      </article>

      <section aria-labelledby="comprar" className="lg:sticky lg:top-24 lg:self-start">
        <div className="rounded-2xl bg-white p-6 ring-1 ring-linea sm:p-7">
          <h2 id="comprar" className="text-2xl font-bold">
            Elige tu sector
          </h2>

          <fieldset className="mt-4 space-y-2" disabled={!onSale}>
            <legend className="sr-only">Sector</legend>
            {event.sectors.map((s) => {
              const soldOut = s.available === 0;
              return (
                <label
                  key={s.id}
                  className={`flex cursor-pointer items-center justify-between rounded-xl px-4 py-3 ring-1 ring-inset ${
                    s.id === sectorId ? 'bg-tinta text-white ring-tinta' : 'ring-linea hover:ring-tinta/40'
                  } ${soldOut ? 'cursor-not-allowed opacity-50' : ''}`}
                >
                  <span className="flex items-center gap-3">
                    <input
                      type="radio"
                      name="sector"
                      value={s.id}
                      checked={s.id === sectorId}
                      disabled={soldOut}
                      onChange={() => setSectorId(s.id)}
                      className="sr-only"
                    />
                    <span className="font-semibold">{s.name}</span>
                    <span className={`text-sm ${s.id === sectorId ? 'text-white/75' : 'text-tinta-suave'}`}>
                      {soldOut ? 'Agotado' : s.available <= 20 ? `Quedan ${s.available}` : `${s.available} disponibles`}
                    </span>
                  </span>
                  <span className="font-display text-lg font-bold">{bs(s.priceCents)}</span>
                </label>
              );
            })}
          </fieldset>

          {!onSale ? (
            <p className="mt-6 text-tinta-suave">La venta de este evento está cerrada.</p>
          ) : !user ? (
            <div className="mt-6">
              <Link
                to={`/login?volver=${encodeURIComponent(`/eventos/${event.id}`)}`}
                className="flex w-full justify-center rounded-full bg-fucsia px-5 py-3 font-semibold text-white hover:bg-fucsia-oscuro"
              >
                Inicia sesión para comprar
              </Link>
            </div>
          ) : !isCustomer ? (
            <p className="mt-6 text-tinta-suave">Las compras se hacen con una cuenta de cliente.</p>
          ) : sector && maxQty > 0 ? (
            <form onSubmit={buy} className="mt-6 space-y-4">
              <div className="flex items-center justify-between">
                <span className="font-semibold" id="qty-label">
                  Entradas
                </span>
                <div className="flex items-center gap-3" role="group" aria-labelledby="qty-label">
                  <button type="button" onClick={() => setQuantity((q) => Math.max(1, q - 1))} className="size-9 rounded-full text-xl ring-1 ring-linea hover:bg-tinta/5" aria-label="Una entrada menos">
                    −
                  </button>
                  <span className="w-6 text-center font-display text-xl font-bold" aria-live="polite">
                    {quantity}
                  </span>
                  <button type="button" onClick={() => setQuantity((q) => Math.min(maxQty, q + 1))} className="size-9 rounded-full text-xl ring-1 ring-linea hover:bg-tinta/5" aria-label="Una entrada más">
                    +
                  </button>
                </div>
              </div>
              <p className="text-sm text-tinta-suave">Máximo {MAX_PER_ORDER} por compra.</p>

              <div className="grid gap-3 border-t border-linea pt-4">
                <Field label="Número de tarjeta" inputMode="numeric" autoComplete="cc-number" required placeholder="4111 1111 1111 1111" value={card.number} onChange={(e) => setCard({ ...card, number: e.target.value })} />
                <Field label="Nombre en la tarjeta" autoComplete="cc-name" required value={card.holder} onChange={(e) => setCard({ ...card, holder: e.target.value })} />
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Vence (MM/AA)" inputMode="numeric" autoComplete="cc-exp" required placeholder="12/28" pattern="\d{1,2}\s*/\s*\d{2,4}" value={card.exp} onChange={(e) => setCard({ ...card, exp: e.target.value })} />
                  <Field label="CVV" inputMode="numeric" autoComplete="cc-csc" required maxLength={4} value={card.cvv} onChange={(e) => setCard({ ...card, cvv: e.target.value })} />
                </div>
                <p className="text-sm text-tinta-suave">Pago de prueba: no se cobra dinero real. Una tarjeta terminada en 0000 se rechaza.</p>
              </div>

              {error && <Alert>{error}</Alert>}

              <Button type="submit" loading={buying} className="w-full py-3 text-base">
                {buying ? 'Procesando compra…' : `Pagar ${bs(total)}`}
              </Button>
            </form>
          ) : (
            <p className="mt-6 font-semibold text-error">Este evento está agotado.</p>
          )}
        </div>
      </section>
    </div>
  );
}
