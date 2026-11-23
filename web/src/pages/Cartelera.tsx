import { useEffect, useState } from 'react';
import { EventCard, FeaturedEvent } from '../components/EventCard';
import { Alert, Empty, Loading } from '../components/ui';
import { api } from '../lib/api';
import { errorText } from '../lib/messages';
import type { EventItem } from '../lib/types';

export function Cartelera() {
  const [events, setEvents] = useState<EventItem[] | null>(null);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setQuery(search.trim()), 250);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    let alive = true;
    setError('');
    api<EventItem[]>(`/events${query ? `?search=${encodeURIComponent(query)}` : ''}`, { auth: false })
      .then((data) => alive && setEvents(data))
      .catch((e) => alive && setError(errorText(e)));
    return () => {
      alive = false;
    };
  }, [query]);

  // Sin búsqueda, el evento más próximo va destacado; con búsqueda, todos iguales.
  const featured = !query && events && events.length > 2 ? events[0] : null;
  const rest = featured ? events!.slice(1) : (events ?? []);

  return (
    <>
      <section className="mb-10 flex flex-wrap items-end justify-between gap-6">
        <div className="max-w-2xl">
          <h1 className="text-4xl sm:text-5xl">¿A dónde vas esta semana?</h1>
          <p className="mt-3 text-lg text-tinta-suave">Conciertos, partidos, ferias y charlas. Compra tu entrada y recíbela al instante con su código QR.</p>
        </div>
        <label className="relative block w-full sm:w-80">
          <span className="sr-only">Buscar eventos</span>
          <svg viewBox="0 0 20 20" className="pointer-events-none absolute top-1/2 left-3.5 size-[18px] -translate-y-1/2 text-tinta-suave" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
            <circle cx="9" cy="9" r="5.5" />
            <path d="m13.5 13.5 3 3" strokeLinecap="round" />
          </svg>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por evento o lugar"
            className="h-11 w-full rounded-xl border border-linea bg-white pr-4 pl-10 text-tinta shadow-[0_1px_1px_rgb(27_26_51/0.03)] placeholder:text-tinta-suave/70 hover:border-tinta/25 focus:border-tinta focus:outline-none"
          />
        </label>
      </section>

      {error && <Alert>{error}</Alert>}
      {!events && !error && <Loading text="Buscando eventos…" />}
      {events && events.length === 0 && (
        <Empty title={query ? `Nada con “${query}”` : 'Todavía no hay eventos publicados'}>
          {query ? 'Prueba con otro nombre o lugar.' : 'Vuelve pronto: los organizadores están armando la cartelera.'}
        </Empty>
      )}

      {featured && (
        <div className="mb-12">
          <FeaturedEvent event={featured} />
        </div>
      )}

      {rest.length > 0 && (
        <>
          {featured && <h2 className="mb-5 text-2xl">Más eventos</h2>}
          {query && (
            <p className="mb-5 text-tinta-suave" aria-live="polite">
              {events!.length} {events!.length === 1 ? 'resultado' : 'resultados'} para “{query}”
            </p>
          )}
          <ul className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {rest.map((e) => (
              <li key={e.id} className="min-w-0">
                <EventCard event={e} />
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}
