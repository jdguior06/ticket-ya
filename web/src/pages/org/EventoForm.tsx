import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { Alert, Badge, Button, Field, Loading } from '../../components/ui';
import { api } from '../../lib/api';
import { bsToCents, fromLocalInput, toLocalInput } from '../../lib/format';
import { errorText } from '../../lib/messages';
import type { EventItem } from '../../lib/types';

interface SectorRow {
  id?: string;
  name: string;
  price: string; // en Bs, como lo escribe el organizador
  capacity: string;
  sold: number;
}

const emptySector = (): SectorRow => ({ name: '', price: '', capacity: '', sold: 0 });

export function EventoForm() {
  const { id } = useParams();
  const isNew = !id;
  const navigate = useNavigate();
  const [event, setEvent] = useState<EventItem | null>(null);
  const [form, setForm] = useState({ name: '', description: '', venue: '', startsAt: '', imageUrl: '' });
  const [sectors, setSectors] = useState<SectorRow[]>([
    { name: 'General', price: '', capacity: '', sold: 0 },
  ]);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState('');
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');

  function fill(e: EventItem) {
    setEvent(e);
    setForm({ name: e.name, description: e.description, venue: e.venue, startsAt: toLocalInput(e.startsAt), imageUrl: e.imageUrl ?? '' });
    setSectors(
      e.sectors.map((s) => ({
        id: s.id,
        name: s.name,
        price: String(s.priceCents / 100),
        capacity: String(s.capacity),
        sold: s.capacity - s.available,
      })),
    );
  }

  useEffect(() => {
    if (isNew) return;
    api<EventItem>(`/events/${id}`)
      .then(fill)
      .catch((e) => setError(errorText(e)))
      .finally(() => setLoading(false));
  }, [id, isNew]);

  const readOnly = event?.status === 'CANCELLED';

  function body() {
    return {
      name: form.name,
      description: form.description,
      venue: form.venue,
      startsAt: fromLocalInput(form.startsAt),
      ...(form.imageUrl ? { imageUrl: form.imageUrl } : {}),
      sectors: sectors.map((s) => ({
        ...(s.id ? { id: s.id } : {}),
        name: s.name,
        priceCents: bsToCents(s.price),
        capacity: Number(s.capacity),
      })),
    };
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    setError('');
    setSaved('');
    setSaving('save');
    try {
      if (isNew) {
        const created = await api<EventItem>('/events', { method: 'POST', body: body() });
        navigate(`/organizador/eventos/${created.id}`, { replace: true });
        setSaved('Evento creado como borrador. Publícalo cuando esté listo.');
        fill(created);
      } else {
        fill(await api<EventItem>(`/events/${id}`, { method: 'PATCH', body: body() }));
        setSaved('Cambios guardados.');
      }
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving('');
    }
  }

  async function changeStatus(action: 'publish' | 'cancel') {
    if (action === 'cancel' && !window.confirm('¿Cancelar el evento? Se detiene la venta y no se puede deshacer.')) return;
    setError('');
    setSaved('');
    setSaving(action);
    try {
      fill(await api<EventItem>(`/events/${id}/${action}`, { method: 'POST' }));
      setSaved(action === 'publish' ? 'Evento publicado: ya aparece en la cartelera.' : 'Evento cancelado.');
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving('');
    }
  }

  const updateSector = (i: number, patch: Partial<SectorRow>) =>
    setSectors((list) => list.map((s, j) => (j === i ? { ...s, ...patch } : s)));

  if (loading) return <Loading />;

  return (
    <form onSubmit={save} className="mx-auto max-w-3xl">
      <Link to="/organizador" className="text-tinta-suave hover:text-tinta">
        Volver a mis eventos
      </Link>
      <div className="mt-2 mb-8 flex flex-wrap items-center gap-3">
        <h1 className="text-3xl font-extrabold sm:text-4xl">{isNew ? 'Nuevo evento' : form.name || 'Editar evento'}</h1>
        {event && (
          <Badge tone={event.status === 'PUBLISHED' ? 'ok' : event.status === 'DRAFT' ? 'warn' : 'muted'}>
            {{ DRAFT: 'Borrador', PUBLISHED: 'Publicado', CANCELLED: 'Cancelado' }[event.status]}
          </Badge>
        )}
      </div>

      <fieldset disabled={readOnly} className="space-y-8">
        <section className="grid gap-4 rounded-2xl bg-white p-6 ring-1 ring-linea sm:grid-cols-2">
          <Field className="sm:col-span-2" label="Nombre del evento" required minLength={3} maxLength={150} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <Field label="Lugar" required minLength={2} value={form.venue} onChange={(e) => setForm({ ...form, venue: e.target.value })} placeholder="Estadio Tahuichi" />
          <Field label="Fecha y hora" type="datetime-local" required value={form.startsAt} onChange={(e) => setForm({ ...form, startsAt: e.target.value })} hint="Hora de Bolivia." />
          <Field className="sm:col-span-2" label="Imagen (URL, opcional)" type="url" value={form.imageUrl} onChange={(e) => setForm({ ...form, imageUrl: e.target.value })} placeholder="https://…" />
          <label className="block sm:col-span-2">
            <span className="mb-1.5 block text-sm font-semibold">Descripción</span>
            <textarea
              rows={4}
              maxLength={2000}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="w-full rounded-xl border border-linea px-3.5 py-2.5 focus:border-tinta focus:outline-none"
            />
          </label>
        </section>

        <section>
          <h2 className="text-xl font-bold">Sectores</h2>
          <p className="mb-4 text-tinta-suave">Cada sector tiene su precio y su cupo. No puedes bajar el cupo por debajo de lo vendido.</p>
          <div className="space-y-3">
            {sectors.map((s, i) => (
              <div key={s.id ?? `new-${i}`} className="grid grid-cols-2 gap-3 rounded-2xl bg-white p-4 ring-1 ring-linea sm:grid-cols-[1.4fr_1fr_1fr_auto] sm:items-end">
                <Field className="col-span-2 sm:col-span-1" label="Sector" required value={s.name} onChange={(e) => updateSector(i, { name: e.target.value })} placeholder="General, VIP…" />
                <Field label="Precio (Bs)" required inputMode="decimal" pattern="\d+([.,]\d{1,2})?" value={s.price} onChange={(e) => updateSector(i, { price: e.target.value })} />
                <Field
                  label="Cupo"
                  required
                  type="number"
                  min={Math.max(1, s.sold)}
                  value={s.capacity}
                  onChange={(e) => updateSector(i, { capacity: e.target.value })}
                  hint={s.sold ? `${s.sold} vendidas` : undefined}
                />
                <button
                  type="button"
                  disabled={sectors.length === 1 || s.sold > 0}
                  onClick={() => setSectors((list) => list.filter((_, j) => j !== i))}
                  className="col-span-2 rounded-full px-3 py-2.5 text-sm font-semibold text-error hover:bg-error/5 disabled:invisible sm:col-span-1"
                >
                  Quitar
                </button>
              </div>
            ))}
          </div>
          <Button type="button" variant="ghost" className="mt-3" onClick={() => setSectors((l) => [...l, emptySector()])} disabled={sectors.length >= 10}>
            Agregar sector
          </Button>
        </section>
      </fieldset>

      <div className="mt-8 space-y-4">
        {error && <Alert>{error}</Alert>}
        {saved && <Alert tone="ok">{saved}</Alert>}
        <div className="flex flex-wrap gap-3">
          {!readOnly && (
            <Button type="submit" variant="secondary" loading={saving === 'save'}>
              {isNew ? 'Crear borrador' : 'Guardar cambios'}
            </Button>
          )}
          {event?.status === 'DRAFT' && (
            <Button type="button" loading={saving === 'publish'} onClick={() => changeStatus('publish')}>
              Publicar
            </Button>
          )}
          {event && event.status !== 'CANCELLED' && (
            <Button type="button" variant="danger" loading={saving === 'cancel'} onClick={() => changeStatus('cancel')} className="sm:ml-auto">
              Cancelar evento
            </Button>
          )}
        </div>
      </div>
    </form>
  );
}
