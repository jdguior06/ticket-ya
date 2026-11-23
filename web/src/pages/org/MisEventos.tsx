import { useEffect, useState } from 'react';
import { EventCover } from '../../components/EventCard';
import { Alert, Badge, ButtonLink, Empty, Loading, PageTitle } from '../../components/ui';
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
        subtitle="Crea, publica y sigue las ventas de tus eventos."
        action={<ButtonLink to="/organizador/eventos/nuevo">Crear evento</ButtonLink>}
      >
        Mis eventos
      </PageTitle>

      {error && <Alert>{error}</Alert>}
      {!events && !error && <Loading />}
      {events && events.length === 0 && (
        <Empty title="Crea tu primer evento" action={<ButtonLink to="/organizador/eventos/nuevo">Crear evento</ButtonLink>}>
          Define la fecha, el lugar y los sectores con su precio y cupo. Queda en borrador hasta que lo publiques.
        </Empty>
      )}
      {events && events.length > 0 && (
        <ul className="divide-y divide-linea overflow-hidden rounded-2xl border border-linea bg-white shadow-tarjeta">
          {events.map((e) => {
            const d = dateParts(e.startsAt);
            const capacity = e.sectors.reduce((n, s) => n + s.capacity, 0);
            const sold = e.sectors.reduce((n, s) => n + (s.capacity - s.available), 0);
            const pct = capacity ? Math.round((sold / capacity) * 100) : 0;
            return (
              <li key={e.id} className="grid gap-4 px-5 py-4 sm:grid-cols-[7rem_1fr_13rem_auto] sm:items-center sm:px-6">
                <div className="aspect-[16/10] overflow-hidden rounded-lg bg-niebla max-sm:hidden">
                  <EventCover event={e} size="sm" />
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-3">
                    <h2 className="truncate text-lg">{e.name}</h2>
                    <Badge tone={STATUS[e.status].tone}>{STATUS[e.status].label}</Badge>
                  </div>
                  <p className="text-tinta-suave">
                    {d.weekday} {d.day} {d.month}, {d.time} h. {e.venue}
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
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-niebla" aria-hidden="true">
                    <div className="h-full rounded-full bg-tinta" style={{ width: `${pct}%` }} />
                  </div>
                </div>
                <div className="flex gap-2 sm:justify-end">
                  <ButtonLink to={`/organizador/eventos/${e.id}`} variant="ghost" size="sm">
                    Editar
                  </ButtonLink>
                  <ButtonLink to={`/organizador/eventos/${e.id}/ventas`} variant="secondary" size="sm">
                    Ventas
                  </ButtonLink>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
