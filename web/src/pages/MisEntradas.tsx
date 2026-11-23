import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router';
import { QrImage } from '../components/QrImage';
import { Alert, Button, ButtonLink, Empty, Loading, PageTitle } from '../components/ui';
import { api, download } from '../lib/api';
import { longDate } from '../lib/format';
import { errorText } from '../lib/messages';
import type { Order, Ticket } from '../lib/types';

export function MisEntradas() {
  const [params] = useSearchParams();
  const location = useLocation();
  const highlight = params.get('orden');
  const justBought = (location.state as { justBought?: string } | null)?.justBought;
  const [tickets, setTickets] = useState<Ticket[] | null>(null);
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState('');
  const [downloading, setDownloading] = useState('');

  useEffect(() => {
    api<Ticket[]>('/tickets/mine').then(setTickets).catch((e) => setError(errorText(e)));
    if (highlight) api<Order>(`/orders/${highlight}`).then(setOrder).catch(() => setOrder(null));
  }, [highlight]);

  // Agrupar por orden, respetando el orden del servidor (eventos más próximos/recientes primero).
  const groups = useMemo(() => {
    const map = new Map<string, Ticket[]>();
    for (const t of tickets ?? []) map.set(t.orderId, [...(map.get(t.orderId) ?? []), t]);
    const list = [...map.entries()];
    if (highlight) list.sort(([a], [b]) => (a === highlight ? -1 : b === highlight ? 1 : 0));
    return list;
  }, [tickets, highlight]);

  useEffect(() => {
    if (highlight && tickets) document.getElementById(`orden-${highlight}`)?.scrollIntoView({ block: 'start' });
  }, [highlight, tickets]);

  async function getPdf(t: Ticket) {
    setDownloading(t.id);
    try {
      await download(`/tickets/${t.id}/pdf`, `entrada-${t.code}.pdf`);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setDownloading('');
    }
  }

  return (
    <>
      <PageTitle subtitle="Muestra el QR en la puerta desde el celular o en el PDF impreso.">Mis entradas</PageTitle>

      {justBought && order && (
        <div className="mb-8">
          <Alert tone="ok">
            Compra confirmada: {order.quantity} {order.quantity === 1 ? 'entrada' : 'entradas'} para {order.eventName}.
            {order.notificationStatus === 'SENT' ? ' También te las enviamos por correo.' : ' El correo de confirmación llegará en unos minutos.'}
          </Alert>
        </div>
      )}
      {highlight && order && order.status === 'PAID' && order.ticketsStatus !== 'ISSUED' && (
        <div className="mb-8">
          <Alert tone="info">
            Tu pago está confirmado pero las entradas todavía se están generando.{' '}
            <Link to="/mis-compras" className="font-semibold underline">
              Revisa Mis compras
            </Link>{' '}
            para emitirlas.
          </Alert>
        </div>
      )}

      {error && <Alert>{error}</Alert>}
      {!tickets && !error && <Loading />}
      {tickets && tickets.length === 0 && (
        <Empty title="Aún no tienes entradas" action={<ButtonLink to="/" variant="secondary">Ver la cartelera</ButtonLink>}>
          Elige tu próximo evento: tus entradas aparecerán aquí al instante.
        </Empty>
      )}

      <div className="space-y-12">
        {groups.map(([orderId, list]) => {
          const first = list[0];
          return (
            <section key={orderId} id={`orden-${orderId}`} aria-labelledby={`t-${orderId}`} className="scroll-mt-28">
              <div className="mb-5 flex flex-wrap items-end justify-between gap-x-6 gap-y-1 border-b border-linea pb-4">
                <div className="min-w-0">
                  <h2 id={`t-${orderId}`} className="text-2xl">
                    {first.eventName}
                  </h2>
                  <p className="mt-0.5 text-tinta-suave">
                    {longDate(first.eventStartsAt)}, {first.venue}
                  </p>
                </div>
                <p className="text-sm text-tinta-suave">
                  {list.length} {list.length === 1 ? 'entrada' : 'entradas'}
                </p>
              </div>
              <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {list.map((t, i) => (
                  <li key={t.id} className="ticket-v flex flex-col" style={{ ['--cut-y' as string]: '64%' }}>
                    <div className="flex flex-1 flex-col items-center px-6 pt-6 pb-4">
                      <QrImage value={t.code} size={176} />
                      <p className="mt-3 text-lg font-semibold tracking-wider tabular-nums">{t.code}</p>
                      {t.status === 'VOID' && <p className="mt-1 font-semibold text-error">Anulada</p>}
                    </div>
                    <div className="mx-5 border-t-2 border-dashed border-linea" aria-hidden="true" />
                    <div className="flex items-end justify-between gap-3 px-6 pt-4 pb-6">
                      <div>
                        <p className="text-sm text-tinta-suave">
                          Entrada {i + 1} de {list.length}
                        </p>
                        <p className="font-semibold">{t.sectorName}</p>
                        <p className="text-sm text-tinta-suave">{t.holderName}</p>
                      </div>
                      <Button variant="ghost" size="sm" loading={downloading === t.id} onClick={() => getPdf(t)}>
                        Descargar PDF
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
      {tickets && tickets.length > 0 && (
        <p className="mt-12 max-w-prose text-sm text-tinta-suave">
          Cada entrada sirve para un solo ingreso: no compartas su código QR.
        </p>
      )}
    </>
  );
}
