import { useEffect, useState, type FormEvent } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router';
import { ImagePicker, type ImageChange } from '../../components/ImagePicker';
import { Alert, BackLink, Badge, Button, Field, Loading } from '../../components/ui';
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
  // Mensajes que deja la página de "nuevo evento" al pasar a la de edición.
  const flash = (useLocation().state ?? {}) as { saved?: string; error?: string };
  const [event, setEvent] = useState<EventItem | null>(null);
  const [form, setForm] = useState({ name: '', description: '', venue: '', startsAt: '' });
  const [image, setImage] = useState<ImageChange>({ kind: 'keep' });
  const [sectors, setSectors] = useState<SectorRow[]>([
    { name: 'General', price: '', capacity: '', sold: 0 },
  ]);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState('');
  const [error, setError] = useState(flash.error ?? '');
  const [saved, setSaved] = useState(flash.saved ?? '');

  function fill(e: EventItem) {
    setEvent(e);
    setForm({ name: e.name, description: e.description, venue: e.venue, startsAt: toLocalInput(e.startsAt) });
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
      sectors: sectors.map((s) => ({
        ...(s.id ? { id: s.id } : {}),
        name: s.name,
        priceCents: bsToCents(s.price),
        capacity: Number(s.capacity),
      })),
    };
  }

  /** Aplica la foto elegida después de guardar los datos. Devuelve el evento actualizado. */
  async function applyImage(eventId: string): Promise<EventItem | null> {
    if (image.kind === 'keep') return null;
    let updated: EventItem;
    if (image.kind === 'set') {
      const data = new FormData();
      const ext = image.blob.type === 'image/webp' ? 'webp' : 'jpg';
      data.append('image', image.blob, `foto.${ext}`);
      updated = await api<EventItem>(`/events/${eventId}/image`, { method: 'PUT', form: data });
    } else {
      updated = await api<EventItem>(`/events/${eventId}/image`, { method: 'DELETE' });
    }
    setImage({ kind: 'keep' });
    return updated;
  }

  /** Si los datos se guardaron pero la foto no, se avisa sin perder lo guardado. */
  function imageError(err: unknown) {
    setError(`Los cambios se guardaron, pero la foto no: ${errorText(err)}`);
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    setError('');
    setSaved('');
    setSaving('save');
    try {
      if (isNew) {
        const created = await api<EventItem>('/events', { method: 'POST', body: body() });
        // La foto se sube antes de cambiar de página: la página de edición carga el evento ya con su foto.
        let imageProblem = '';
        try {
          await applyImage(created.id);
        } catch (err) {
          imageProblem = `El evento se guardó, pero la foto no: ${errorText(err)}`;
        }
        navigate(`/organizador/eventos/${created.id}`, {
          replace: true,
          state: { saved: 'Evento creado como borrador. Publícalo cuando esté listo.', error: imageProblem },
        });
      } else {
        fill(await api<EventItem>(`/events/${id}`, { method: 'PATCH', body: body() }));
        setSaved('Cambios guardados.');
        try {
          const withImage = await applyImage(id!);
          if (withImage) fill(withImage);
        } catch (err) {
          imageError(err);
        }
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

  const sectionHead = (title: string, help: string) => (
    <div className="lg:pt-1">
      <h2 className="text-lg">{title}</h2>
      <p className="mt-1 text-sm text-tinta-suave">{help}</p>
    </div>
  );
  const panel = 'rounded-2xl border border-linea bg-white p-5 shadow-tarjeta sm:p-6';

  return (
    <form onSubmit={save} className="mx-auto max-w-5xl">
      <BackLink to="/organizador">Mis eventos</BackLink>
      <div className="mb-10 flex flex-wrap items-center gap-3">
        <h1 className="text-3xl sm:text-[2.5rem]">{isNew ? 'Nuevo evento' : form.name || 'Editar evento'}</h1>
        {event && (
          <Badge tone={event.status === 'PUBLISHED' ? 'ok' : event.status === 'DRAFT' ? 'warn' : 'muted'}>
            {{ DRAFT: 'Borrador', PUBLISHED: 'Publicado', CANCELLED: 'Cancelado' }[event.status]}
          </Badge>
        )}
      </div>

      <fieldset disabled={readOnly} className="space-y-10">
        <div className="grid gap-4 lg:grid-cols-[16rem_1fr] lg:gap-10">
          {sectionHead('Datos del evento', 'Lo que verá el público en la cartelera y en el detalle.')}
          <section className={`grid gap-4 sm:grid-cols-2 ${panel}`}>
            <Field className="sm:col-span-2" label="Nombre del evento" required minLength={3} maxLength={150} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <Field label="Lugar" required minLength={2} value={form.venue} onChange={(e) => setForm({ ...form, venue: e.target.value })} placeholder="Estadio Tahuichi" />
            <Field label="Fecha y hora" type="datetime-local" required value={form.startsAt} onChange={(e) => setForm({ ...form, startsAt: e.target.value })} hint="Hora de Bolivia." />
            <label className="block sm:col-span-2">
              <span className="mb-1.5 block text-sm font-medium">Descripción</span>
              <textarea
                rows={4}
                maxLength={2000}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="w-full rounded-xl border border-linea bg-white px-3.5 py-2.5 hover:border-tinta/25 focus:border-tinta focus:outline-none"
              />
            </label>
          </section>
        </div>

        <div className="grid gap-4 lg:grid-cols-[16rem_1fr] lg:gap-10">
          {sectionHead('Foto', 'Una imagen horizontal se ve mejor. Es opcional: sin foto, la tarjeta muestra la fecha.')}
          <section className={panel}>
            <ImagePicker currentUrl={event?.imageUrl ?? null} change={image} onChange={setImage} disabled={readOnly} />
          </section>
        </div>

        <div className="grid gap-4 lg:grid-cols-[16rem_1fr] lg:gap-10">
          {sectionHead('Sectores', 'Cada sector tiene su precio y su cupo. El cupo no puede quedar por debajo de lo vendido.')}
          <section className={panel}>
            <div className="divide-y divide-linea">
              {sectors.map((s, i) => (
                <div key={s.id ?? `new-${i}`} className="grid grid-cols-2 gap-3 py-4 first:pt-0 sm:grid-cols-[1.4fr_1fr_1fr_auto] sm:items-start">
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
                    className="col-span-2 h-11 rounded-xl px-3 text-sm font-semibold text-error hover:bg-error/5 disabled:invisible sm:col-span-1 sm:mt-[1.625rem]"
                    aria-label={`Quitar el sector ${s.name || i + 1}`}
                  >
                    Quitar
                  </button>
                </div>
              ))}
            </div>
            <Button type="button" variant="ghost" size="sm" className="mt-2" onClick={() => setSectors((l) => [...l, emptySector()])} disabled={sectors.length >= 10}>
              Agregar sector
            </Button>
          </section>
        </div>
      </fieldset>

      {/* Barra de acciones: queda pegada abajo mientras se edita. */}
      <div className="sticky bottom-0 z-10 -mx-4 mt-10 border-t border-linea bg-papel/95 px-4 py-4 backdrop-blur-md sm:-mx-6 sm:px-6">
        {(error || saved) && (
          <div className="mb-3">
            {error && <Alert>{error}</Alert>}
            {saved && !error && <Alert tone="ok">{saved}</Alert>}
          </div>
        )}
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
