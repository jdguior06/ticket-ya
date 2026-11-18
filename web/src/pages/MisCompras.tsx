import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { Alert, Badge, Button, Empty, Loading, PageTitle } from '../components/ui';
import { api } from '../lib/api';
import { bs, longDate } from '../lib/format';
import { errorText, FAILURE_TEXT, ORDER_STATUS } from '../lib/messages';
import type { Order } from '../lib/types';

export function MisCompras() {
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [error, setError] = useState('');
  const [retrying, setRetrying] = useState('');
  const [retryError, setRetryError] = useState<Record<string, string>>({});

  const load = () => api<Order[]>('/orders/mine').then(setOrders).catch((e) => setError(errorText(e)));
  useEffect(() => {
    void load();
  }, []);

  // Si hay órdenes confirmando pago, se actualiza solo cada 15 s.
  useEffect(() => {
    if (!orders?.some((o) => o.status === 'PENDING')) return;
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [orders]);

  async function retry(o: Order) {
    setRetrying(o.id);
    setRetryError((r) => ({ ...r, [o.id]: '' }));
    try {
      const updated = await api<Order>(`/orders/${o.id}/retry-tickets`, { method: 'POST' });
      setOrders((list) => list?.map((x) => (x.id === o.id ? updated : x)) ?? null);
    } catch (e) {
      setRetryError((r) => ({ ...r, [o.id]: errorText(e) }));
    } finally {
      setRetrying('');
    }
  }

  return (
    <>
      <PageTitle>Mis compras</PageTitle>
      {error && <Alert>{error}</Alert>}
      {!orders && !error && <Loading />}
      {orders && orders.length === 0 && (
        <Empty title="Todavía no compraste nada">
          <Link to="/" className="font-semibold text-tinta underline">
            Ver la cartelera
          </Link>
        </Empty>
      )}
      {orders && orders.length > 0 && (
        <ul className="divide-y divide-linea overflow-hidden rounded-2xl bg-white ring-1 ring-linea">
          {orders.map((o) => {
            const st = ORDER_STATUS[o.status];
            const needsTickets = o.status === 'PAID' && o.ticketsStatus !== 'ISSUED';
            return (
              <li key={o.id} className="grid gap-3 px-5 py-5 sm:grid-cols-[1fr_auto] sm:items-center sm:px-6">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-3">
                    <h2 className="truncate text-lg font-bold">{o.eventName ?? 'Evento'}</h2>
                    <Badge tone={st.tone}>{st.label}</Badge>
                  </div>
                  <p className="mt-1 text-tinta-suave">
                    {o.quantity} {o.quantity === 1 ? 'entrada' : 'entradas'}
                    {o.sectorName ? `, ${o.sectorName}` : ''}
                    {o.eventStartsAt ? `. ${longDate(o.eventStartsAt)}` : ''}
                  </p>
                  {o.failureCode && o.status !== 'PAID' && (
                    <p className="mt-1 text-sm text-tinta-suave">{FAILURE_TEXT[o.failureCode] ?? o.failureCode}</p>
                  )}
                  {o.status === 'PENDING' && (
                    <p className="mt-1 text-sm text-tinta-suave">Estamos confirmando el pago con el banco. Esta lista se actualiza sola.</p>
                  )}
                  {needsTickets && <p className="mt-1 text-sm text-tinta-suave">Pago confirmado. Las entradas aún no se generaron.</p>}
                  {retryError[o.id] && <p className="mt-1 text-sm text-error">{retryError[o.id]}</p>}
                </div>
                <div className="flex items-center gap-4 sm:justify-end">
                  <span className="font-display text-xl font-bold">{bs(o.totalCents)}</span>
                  {o.status === 'PAID' && o.ticketsStatus === 'ISSUED' && (
                    <Link to={`/mis-entradas?orden=${o.id}`} className="rounded-full px-4 py-2 text-sm font-semibold ring-1 ring-linea hover:bg-tinta/5">
                      Ver entradas
                    </Link>
                  )}
                  {needsTickets && (
                    <Button className="px-4 py-2 text-sm" loading={retrying === o.id} onClick={() => retry(o)}>
                      Generar entradas
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
