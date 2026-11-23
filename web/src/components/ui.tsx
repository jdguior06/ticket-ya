import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react';
import { Link, type LinkProps } from 'react-router';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'md' | 'sm' | 'lg';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-fucsia text-white hover:bg-fucsia-oscuro disabled:bg-fucsia/45',
  secondary: 'bg-tinta text-white hover:bg-tinta/88 disabled:bg-tinta/35',
  ghost: 'bg-white text-tinta ring-1 ring-inset ring-linea hover:bg-niebla disabled:text-tinta-suave',
  danger: 'bg-white text-error ring-1 ring-inset ring-error/25 hover:bg-error/5',
};
const SIZES: Record<Size, string> = {
  sm: 'h-9 px-3.5 text-sm',
  md: 'h-11 px-5 text-[0.95rem]',
  lg: 'h-12 px-6 text-base',
};

/** Clases de botón, para usarlas también en <Link>. */
export function buttonClass(variant: Variant = 'primary', size: Size = 'md', extra = '') {
  return `inline-flex shrink-0 items-center justify-center gap-2 rounded-xl font-semibold transition-colors disabled:cursor-not-allowed ${VARIANTS[variant]} ${SIZES[size]} ${extra}`;
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  className = '',
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size; loading?: boolean }) {
  return (
    <button {...rest} disabled={rest.disabled || loading} className={buttonClass(variant, size, className)}>
      {loading && <Spinner />}
      {children}
    </button>
  );
}

export function ButtonLink({
  variant = 'primary',
  size = 'md',
  className = '',
  ...rest
}: LinkProps & { variant?: Variant; size?: Size }) {
  return <Link {...rest} className={buttonClass(variant, size, className)} />;
}

export function Spinner({ className = 'size-4' }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export const inputClass =
  'h-11 w-full rounded-xl border bg-white px-3.5 text-tinta shadow-[0_1px_1px_rgb(27_26_51/0.03)] transition-colors placeholder:text-tinta-suave/60 hover:border-tinta/25 focus:border-tinta focus:outline-none disabled:bg-niebla disabled:text-tinta-suave';

export function Field({
  label,
  hint,
  error,
  className = '',
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string; error?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1.5 block text-sm font-medium text-tinta">{label}</span>
      <input {...rest} className={`${inputClass} ${error ? 'border-error' : 'border-linea'}`} />
      {error ? (
        <span className="mt-1.5 block text-sm text-error">{error}</span>
      ) : hint ? (
        <span className="mt-1.5 block text-sm text-tinta-suave">{hint}</span>
      ) : null}
    </label>
  );
}

export function Alert({ tone = 'error', children }: { tone?: 'error' | 'ok' | 'info'; children: ReactNode }) {
  const styles = {
    error: 'border-error/25 bg-error/[0.05] text-error',
    ok: 'border-ok/25 bg-ok/[0.06] text-ok',
    info: 'border-ambar/50 bg-ambar/[0.12] text-tinta',
  }[tone];
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={`rounded-xl border px-4 py-3 text-[0.95rem] ${styles}`}>
      {children}
    </div>
  );
}

export function Badge({ tone, children }: { tone: 'ok' | 'warn' | 'bad' | 'muted'; children: ReactNode }) {
  const styles = {
    ok: 'bg-ok/10 text-ok',
    warn: 'bg-ambar/25 text-[#7a5200]',
    bad: 'bg-error/10 text-error',
    muted: 'bg-niebla text-tinta-suave',
  }[tone];
  const dot = { ok: 'bg-ok', warn: 'bg-ambar', bad: 'bg-error', muted: 'bg-tinta-suave/60' }[tone];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[0.8rem] font-semibold ${styles}`}>
      <span className={`size-1.5 rounded-full ${dot}`} aria-hidden="true" />
      {children}
    </span>
  );
}

export function Loading({ text = 'Cargando…' }: { text?: string }) {
  return (
    <div className="flex items-center gap-3 py-16 text-tinta-suave" role="status">
      <Spinner className="size-5" /> {text}
    </div>
  );
}

export function Empty({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-tinta/15 bg-white/60 px-6 py-14 text-center">
      <p className="font-display text-xl font-semibold">{title}</p>
      {children && <div className="mx-auto mt-2 max-w-md text-tinta-suave">{children}</div>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

/** Superficie blanca estándar. */
export function Card({ className = '', children }: { className?: string; children: ReactNode }) {
  return <div className={`rounded-2xl border border-linea bg-white shadow-tarjeta ${className}`}>{children}</div>;
}

export function PageTitle({ children, subtitle, action }: { children: ReactNode; subtitle?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-3xl sm:text-[2.5rem]">{children}</h1>
        {subtitle && <p className="mt-2 max-w-2xl text-tinta-suave">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

/** Enlace "volver" con flecha, encima del título. */
export function BackLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-tinta-suave hover:text-tinta">
      <svg viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
        <path d="M12 4 6 10l6 6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {children}
    </Link>
  );
}
