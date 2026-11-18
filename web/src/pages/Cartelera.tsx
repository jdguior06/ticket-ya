import { useEffect, useState } from 'react';
import { EventTicket } from '../components/EventTicket';
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

  return (
    <>
      <section className="mb-10 grid gap-6 sm:grid-cols-[1fr_auto] sm:items-end">
        <div>
          <h1 className="max-w-2xl text-4xl leading-[1.05] font-extrabold sm:text-6xl">¿A dónde vas esta semana?</h1>
          <p className="mt-3 max-w-xl text-lg text-tinta-suave">
            Conciertos, partidos, ferias y charlas. Compra tu entrada y recíbela al instante con su código QR.
          </p>
        </div>
        <label className="block sm:w-80">
          <span className="sr-only">Buscar eventos</span>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por evento o lugar"
            className="w-full rounded-full border border-linea bg-white px-5 py-3 text-tinta placeholder:text-tinta-suave/70 focus:border-tinta focus:outline-none"
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
      {events && events.length > 0 && (
        <ul className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          {events.map((e) => (
            <li key={e.id} className="min-w-0">
              <EventTicket event={e} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
