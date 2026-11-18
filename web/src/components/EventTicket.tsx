import { Link } from 'react-router';
import { bs, dateParts } from '../lib/format';
import type { EventItem } from '../lib/types';

/** Evento en la cartelera, con forma de boleto: talón de fecha | datos | precio. */
export function EventTicket({ event }: { event: EventItem }) {
  const d = dateParts(event.startsAt);
  const available = event.sectors.reduce((n, s) => n + s.available, 0);
  const from = event.sectors.length ? Math.min(...event.sectors.map((s) => s.priceCents)) : null;
  const soldOut = available === 0;

  return (
    <Link
      to={`/eventos/${event.id}`}
      className="group ticket block transition-transform focus-visible:outline-none motion-safe:hover:-translate-y-0.5"
      style={{ ['--cut' as string]: '6.25rem' }}
    >
      <div className="perforated" aria-hidden="true" />
      <div className="flex min-h-36">
        {/* Talón: fecha */}
        <div className="flex w-[6.25rem] shrink-0 flex-col items-center justify-center text-center">
          <span className="text-sm font-semibold capitalize text-tinta-suave">{d.month}</span>
          <span className="font-display text-5xl font-extrabold leading-none">{d.day}</span>
          <span className="mt-1 text-sm text-tinta-suave">{d.time} h</span>
        </div>
        {/* Cuerpo */}
        <div className="flex min-w-0 flex-1 flex-col justify-center gap-1 py-5 pl-6 pr-5">
          <p className="text-sm text-tinta-suave">{d.weekday}</p>
          <h3 className="line-clamp-2 text-xl font-bold leading-snug group-hover:underline group-focus-visible:underline sm:text-2xl">
            {event.name}
          </h3>
          <p className="truncate text-tinta-suave">{event.venue}</p>
          <p className="mt-2 text-[0.95rem]">
            {soldOut ? (
              <span className="font-semibold text-error">Agotado</span>
            ) : (
              <>
                Desde <span className="font-display text-lg font-bold">{bs(from)}</span>
                {available <= 20 && <span className="ml-2 text-sm font-semibold text-fucsia">Quedan {available}</span>}
              </>
            )}
          </p>
        </div>
        {event.imageUrl && (
          <img
            src={event.imageUrl}
            alt=""
            loading="lazy"
            className="hidden w-36 shrink-0 rounded-r-[14px] object-cover sm:block"
          />
        )}
      </div>
    </Link>
  );
}
