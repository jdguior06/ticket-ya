import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { Alert, Badge, Empty, Loading, PageTitle } from '../../components/ui';
import { api } from '../../lib/api';
import { bs, dateParts } from '../../lib/format';
import { errorText } from '../../lib/messages';
import type { EventItem } from '../../lib/types';

const STATUS = {
  DRAFT: { label: 'Borrador', tone: 'warn' },
  PUBLISHED: { label: 'Publicado', tone: 'ok' },
  CANCELLED: { label: 'Cancelado', tone: 'muted' },
} as const;

export function MisEventos() {
  const [events, setEvents] = useState<EventItem[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api<EventItem[]>('/events/mine').then(setEvents).catch((e) => setError(errorText(e)));
  }, []);

  return (
    <>
      <PageTitle
        action={
          <Link to="/organizador/eventos/nuevo" className="rounded-full bg-fucsia px-5 py-2.5 font-semibold text-white hover:bg-fucsia-oscuro">
            Crear evento
          </Link>
        }
      >
        Mis eventos
      </PageTitle>

      {error && <Alert>{error}</Alert>}
      {!events && !error && <Loading />}
      {events && events.length === 0 && (
        <Empty title="Crea tu primer evento">
          Define la fecha, el lugar y los sectores con su precio y cupo. Queda en borrador hasta que lo publiques.
        </Empty>
      )}
      {events && events.length > 0 && (
        <ul className="divide-y divide-linea overflow-hidden rounded-2xl bg-white ring-1 ring-linea">
          {events.map((e) => {
            const d = dateParts(e.startsAt);
            const capacity = e.sectors.reduce((n, s) => n + s.capacity, 0);
            const sold = e.sectors.reduce((n, s) => n + (s.capacity - s.available), 0);
            const pct = capacity ? Math.round((sold / capacity) * 100) : 0;
            return (
              <li key={e.id} className="grid gap-4 px-5 py-5 sm:grid-cols-[4.5rem_1fr_14rem_auto] sm:items-center sm:px-6">
                <div className="text-center max-sm:hidden">
                  <span className="block text-sm capitalize text-tinta-suave">{d.month}</span>
                  <span className="font-display text-3xl font-extrabold leading-none">{d.day}</span>
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-3">
                    <h2 className="truncate text-lg font-bold">{e.name}</h2>
                    <Badge tone={STATUS[e.status].tone}>{STATUS[e.status].label}</Badge>
                  </div>
                  <p className="text-tinta-suave">
                    <span className="sm:hidden">
                      {d.day} {d.month},{' '}
                    </span>
                    {d.time} h, {e.venue}
                  </p>
                  <p className="text-sm text-tinta-suave">{e.sectors.map((s) => `${s.name} ${bs(s.priceCents)}`).join(', ')}</p>
                </div>
                <div>
                  <div className="flex justify-between text-sm">
                    <span>
                      {sold} de {capacity} vendidas
                    </span>
                    <span className="font-semibold">{pct}%</span>
                  </div>
                  <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-tinta/8" aria-hidden="true">
                    <div className="h-full rounded-full bg-fucsia" style={{ width: `${pct}%` }} />
                  </div>
                </div>
                <div className="flex gap-2 sm:justify-end">
                  <Link to={`/organizador/eventos/${e.id}`} className="rounded-full px-4 py-2 text-sm font-semibold ring-1 ring-linea hover:bg-tinta/5">
                    Editar
                  </Link>
                  <Link to={`/organizador/eventos/${e.id}/ventas`} className="rounded-full bg-tinta px-4 py-2 text-sm font-semibold text-white hover:bg-tinta/90">
                    Ventas
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
