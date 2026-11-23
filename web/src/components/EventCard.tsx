import { useState } from 'react';
import { Link } from 'react-router';
import { bs, dateParts, shortDate } from '../lib/format';
import type { EventItem } from '../lib/types';

export function eventStats(event: EventItem) {
  const available = event.sectors.reduce((n, s) => n + s.available, 0);
  const from = event.sectors.length ? Math.min(...event.sectors.map((s) => s.priceCents)) : null;
  return { available, from, soldOut: available === 0 };
}

const COVER_SIZES = {
  sm: ['text-2xl', 'text-xs'],
  md: ['text-6xl', 'text-lg'],
  lg: ['text-8xl', 'text-2xl'],
} as const;

/** Portada del evento: la foto, o la fecha grande si no tiene (o si la foto no carga). */
export function EventCover({ event, className = '', size = 'md' }: { event: EventItem; className?: string; size?: keyof typeof COVER_SIZES }) {
  const [broken, setBroken] = useState(false);
  if (event.imageUrl && !broken) {
    return <img src={event.imageUrl} alt="" loading="lazy" onError={() => setBroken(true)} className={`size-full object-cover ${className}`} />;
  }
  const d = dateParts(event.startsAt);
  const [day, month] = COVER_SIZES[size];
  return (
    <div
      className={`flex size-full flex-col items-center justify-center bg-[linear-gradient(135deg,#eceef3,#e1e4ec)] text-tinta ${className}`}
      aria-hidden="true"
    >
      <span className={`font-display font-semibold leading-none ${day}`}>{d.day}</span>
      <span className={`capitalize text-tinta-suave ${size === 'sm' ? '' : 'mt-1'} ${month}`}>{d.month}</span>
    </div>
  );
}

function Availability({ event }: { event: EventItem }) {
  const { available, soldOut } = eventStats(event);
  if (soldOut) return <span className="rounded-md bg-white/95 px-2 py-1 text-xs font-semibold text-error shadow-sm">Agotado</span>;
  if (available <= 20)
    return <span className="rounded-md bg-white/95 px-2 py-1 text-xs font-semibold text-tinta shadow-sm">Quedan {available}</span>;
  return null;
}

/** Tarjeta de la cartelera: foto arriba, datos abajo. Toda la tarjeta es el enlace. */
export function EventCard({ event }: { event: EventItem }) {
  const { from, soldOut } = eventStats(event);
  return (
    <Link
      to={`/eventos/${event.id}`}
      className="group flex h-full flex-col overflow-hidden rounded-2xl border border-linea bg-white shadow-tarjeta transition-shadow hover:shadow-elevada"
    >
      <div className="relative aspect-[16/10] overflow-hidden bg-niebla">
        <EventCover event={event} className="transition-transform duration-500 motion-safe:group-hover:scale-[1.03]" />
        <div className="absolute top-3 left-3">
          <Availability event={event} />
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-1 p-5">
        <p className="text-sm font-medium text-tinta-suave">{shortDate(event.startsAt)}</p>
        <h3 className="line-clamp-2 text-lg leading-snug group-hover:underline group-focus-visible:underline">{event.name}</h3>
        <p className="truncate text-[0.95rem] text-tinta-suave">{event.venue}</p>
        <p className="mt-auto pt-4 text-[0.95rem]">
          {soldOut ? (
            <span className="text-tinta-suave">Sin entradas disponibles</span>
          ) : (
            <>
              <span className="text-tinta-suave">Desde </span>
              <span className="font-semibold tabular-nums">{bs(from)}</span>
            </>
          )}
        </p>
      </div>
    </Link>
  );
}

/** El evento más próximo, en grande, arriba de la cartelera. */
export function FeaturedEvent({ event }: { event: EventItem }) {
  const { from, soldOut } = eventStats(event);
  return (
    <Link
      to={`/eventos/${event.id}`}
      className="group grid overflow-hidden rounded-3xl border border-linea bg-white shadow-tarjeta transition-shadow hover:shadow-elevada md:grid-cols-[1.35fr_1fr]"
    >
      <div className="relative aspect-[16/9] overflow-hidden bg-niebla md:aspect-auto md:min-h-80">
        <EventCover event={event} size="lg" className="transition-transform duration-700 motion-safe:group-hover:scale-[1.02]" />
        <div className="absolute top-4 left-4">
          <Availability event={event} />
        </div>
      </div>
      <div className="flex flex-col justify-center gap-2 p-6 sm:p-8 lg:p-10">
        <p className="text-sm font-medium text-tinta-suave">Próximo evento</p>
        <h2 className="text-2xl leading-tight sm:text-3xl lg:text-4xl group-hover:underline group-focus-visible:underline">{event.name}</h2>
        <p className="mt-1 font-medium">{shortDate(event.startsAt)}</p>
        <p className="text-tinta-suave">{event.venue}</p>
        {event.description && <p className="mt-2 line-clamp-2 text-[0.95rem] text-tinta/80">{event.description}</p>}
        <div className="mt-5 flex flex-wrap items-center gap-4">
          <span className="inline-flex h-11 items-center rounded-xl bg-fucsia px-5 font-semibold text-white group-hover:bg-fucsia-oscuro">
            {soldOut ? 'Ver evento' : 'Comprar entradas'}
          </span>
          {!soldOut && (
            <span className="text-[0.95rem]">
              <span className="text-tinta-suave">Desde </span>
              <span className="font-semibold tabular-nums">{bs(from)}</span>
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
