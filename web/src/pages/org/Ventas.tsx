import { useEffect, useState } from 'react';
import { useParams } from 'react-router';
import { Alert, BackLink, Loading } from '../../components/ui';
import { api } from '../../lib/api';
import { bs, longDate } from '../../lib/format';
import { errorText } from '../../lib/messages';
import type { EventItem, SalesReport } from '../../lib/types';

export function Ventas() {
  const { id } = useParams();
  const [event, setEvent] = useState<EventItem | null>(null);
  const [report, setReport] = useState<SalesReport | null>(null);
  const [checkins, setCheckins] = useState<number | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api<EventItem>(`/events/${id}`).then(setEvent).catch((e) => setError(errorText(e)));
    api<SalesReport>(`/orders/reports/events/${id}`).then(setReport).catch((e) => setError(errorText(e)));
    // checkin es opcional para esta pantalla: si no responde, simplemente no se muestra.
    api<{ total?: number; totalCheckedIn?: number }>(`/checkin/events/${id}/stats`)
      .then((s) => setCheckins(s.totalCheckedIn ?? s.total ?? null))
      .catch(() => setCheckins(null));
  }, [id]);

  if (error) return <Alert>{error}</Alert>;
  if (!event || !report) return <Loading />;

  const capacity = event.sectors.reduce((n, s) => n + s.capacity, 0);

  return (
    <>
      <BackLink to="/organizador">Mis eventos</BackLink>
      <h1 className="text-3xl sm:text-[2.5rem]">{event.name}</h1>
      <p className="mt-1 text-tinta-suave">{longDate(event.startsAt)}, {event.venue}</p>

      {/* La cifra principal es lo recaudado; el resto la explica. */}
      <section className="mt-8 grid gap-8 rounded-2xl bg-tinta p-6 text-white shadow-elevada sm:grid-cols-[1.2fr_1fr] sm:p-8">
        <div>
          <p className="text-white/70">Recaudado</p>
          <p className="mt-1 font-display text-5xl font-semibold tabular-nums sm:text-6xl">{bs(report.revenueCents)}</p>
          <p className="mt-2 text-white/70">
            {report.paidOrders} {report.paidOrders === 1 ? 'compra pagada' : 'compras pagadas'}
            {report.rejectedOrders > 0 && `, ${report.rejectedOrders} con pago rechazado`}
          </p>
        </div>
        <dl className="grid grid-cols-2 gap-4 self-end">
          <div>
            <dt className="text-white/70">Entradas vendidas</dt>
            <dd className="font-display text-3xl font-semibold tabular-nums">
              {report.ticketsSold}
              <span className="text-lg font-semibold text-white/60"> / {capacity}</span>
            </dd>
          </div>
          {checkins !== null && (
            <div>
              <dt className="text-white/70">Ya ingresaron</dt>
              <dd className="font-display text-3xl font-semibold tabular-nums text-ambar">{checkins}</dd>
            </div>
          )}
        </dl>
      </section>

      <h2 className="mt-12 mb-4 text-xl">Por sector</h2>
      <div className="overflow-x-auto rounded-2xl border border-linea bg-white shadow-tarjeta">
        <table className="w-full text-left">
          <thead className="bg-niebla/60 text-sm text-tinta-suave">
            <tr className="border-b border-linea">
              <th className="px-5 py-3 font-medium">Sector</th>
              <th className="px-5 py-3 font-medium">Precio</th>
              <th className="px-5 py-3 text-right font-medium">Vendidas</th>
              <th className="px-5 py-3 text-right font-medium">Disponibles</th>
              <th className="px-5 py-3 text-right font-medium">Recaudado</th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {event.sectors.map((s) => {
              const row = report.bySector.find((b) => b.sectorId === s.id);
              return (
                <tr key={s.id} className="border-b border-linea last:border-0">
                  <td className="px-5 py-3 font-semibold">{s.name}</td>
                  <td className="px-5 py-3">{bs(s.priceCents)}</td>
                  <td className="px-5 py-3 text-right">{row?.ticketsSold ?? 0}</td>
                  <td className="px-5 py-3 text-right">{s.available}</td>
                  <td className="px-5 py-3 text-right font-medium">{bs(row?.revenueCents ?? 0)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
