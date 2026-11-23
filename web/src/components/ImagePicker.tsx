import { useEffect, useRef, useState, type DragEvent } from 'react';
import { ImageReadError, shrinkImage } from '../lib/image';
import { Spinner } from './ui';

/** Lo que el organizador decidió hacer con la foto; se aplica al guardar el evento. */
export type ImageChange = { kind: 'keep' } | { kind: 'set'; blob: Blob } | { kind: 'remove' };

interface Props {
  currentUrl: string | null;
  change: ImageChange;
  onChange: (change: ImageChange) => void;
  disabled?: boolean;
}

export function ImagePicker({ currentUrl, change, onChange, disabled }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [dragging, setDragging] = useState(false);

  // Vista previa de la foto elegida (se libera al cambiarla).
  useEffect(() => {
    if (change.kind !== 'set') {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(change.blob);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [change]);

  const shown = change.kind === 'set' ? preview : change.kind === 'remove' ? null : currentUrl;

  async function pick(file: File | undefined) {
    if (!file) return;
    setError('');
    if (!file.type.startsWith('image/')) {
      setError('Elige un archivo de imagen (JPG, PNG o WebP).');
      return;
    }
    setBusy(true);
    try {
      onChange({ kind: 'set', blob: await shrinkImage(file) });
    } catch (e) {
      setError(e instanceof ImageReadError ? e.message : 'No pudimos preparar la foto.');
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    if (!disabled) void pick(e.dataTransfer.files[0]);
  }

  return (
    <div>
      <span className="sr-only">Foto del evento</span>
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/*"
        className="sr-only"
        tabIndex={-1}
        disabled={disabled}
        onChange={(e) => void pick(e.target.files?.[0])}
      />
      {shown ? (
        <div className="overflow-hidden rounded-xl border border-linea">
          <img src={shown} alt="Foto del evento" className="aspect-[16/9] w-full bg-tinta/5 object-cover" />
          <div className="flex flex-wrap gap-2 bg-white p-3">
            <button
              type="button"
              disabled={disabled || busy}
              onClick={() => input.current?.click()}
              className="inline-flex h-9 items-center gap-2 rounded-xl bg-white px-3.5 text-sm font-semibold ring-1 ring-inset ring-linea hover:bg-niebla disabled:opacity-50"
            >
              {busy && <Spinner />}
              Cambiar foto
            </button>
            <button
              type="button"
              disabled={disabled || busy}
              onClick={() => onChange(currentUrl ? { kind: 'remove' } : { kind: 'keep' })}
              className="h-9 rounded-xl px-3.5 text-sm font-semibold text-error hover:bg-error/5 disabled:opacity-50"
            >
              Quitar
            </button>
            {change.kind === 'set' && <span className="self-center text-sm text-tinta-suave">Se sube al guardar.</span>}
          </div>
        </div>
      ) : (
        <button
          type="button"
          disabled={disabled || busy}
          onClick={() => input.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={`flex aspect-[16/9] w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 text-center transition-colors disabled:opacity-50 ${
            dragging ? 'border-tinta bg-niebla' : 'border-linea hover:border-tinta/30 hover:bg-niebla/50'
          }`}
        >
          {busy ? <Spinner className="size-6" /> : (
            <svg viewBox="0 0 24 24" className="size-8 text-tinta-suave" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
              <rect x="3" y="5" width="18" height="14" rx="2" />
              <circle cx="9" cy="10" r="1.8" />
              <path d="m4 18 5-5 4 4 3-3 4 4" />
            </svg>
          )}
          <span className="font-semibold">{busy ? 'Preparando la foto…' : 'Elegir una foto'}</span>
          <span className="text-sm text-tinta-suave">O arrástrala aquí. JPG, PNG o WebP; se ajusta sola al tamaño.</span>
        </button>
      )}
      {change.kind === 'remove' && <span className="mt-1 block text-sm text-tinta-suave">La foto se quita al guardar.</span>}
      {error && <span className="mt-1 block text-sm text-error">{error}</span>}
    </div>
  );
}
