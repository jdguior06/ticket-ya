import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-fucsia text-white hover:bg-fucsia-oscuro disabled:bg-fucsia/50',
  secondary: 'bg-tinta text-white hover:bg-tinta/90 disabled:bg-tinta/40',
  ghost: 'bg-transparent text-tinta hover:bg-tinta/5 ring-1 ring-inset ring-linea',
  danger: 'bg-transparent text-error hover:bg-error/5 ring-1 ring-inset ring-error/30',
};

export function Button({
  variant = 'primary',
  loading = false,
  className = '',
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; loading?: boolean }) {
  return (
    <button
      {...rest}
      disabled={rest.disabled || loading}
      className={`inline-flex items-center justify-center gap-2 rounded-full px-5 py-2.5 text-[0.95rem] font-semibold transition-colors disabled:cursor-not-allowed ${VARIANTS[variant]} ${className}`}
    >
      {loading && <Spinner />}
      {children}
    </button>
  );
}

export function Spinner({ className = 'size-4' }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function Field({
  label,
  hint,
  error,
  className = '',
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string; error?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1.5 block text-sm font-semibold text-tinta">{label}</span>
      <input
        {...rest}
        className={`w-full rounded-xl border bg-white px-3.5 py-2.5 text-tinta placeholder:text-tinta-suave/60 focus:border-tinta focus:outline-none ${
          error ? 'border-error' : 'border-linea'
        }`}
      />
      {error ? (
        <span className="mt-1 block text-sm text-error">{error}</span>
      ) : hint ? (
        <span className="mt-1 block text-sm text-tinta-suave">{hint}</span>
      ) : null}
    </label>
  );
}

export function Alert({ tone = 'error', children }: { tone?: 'error' | 'ok' | 'info'; children: ReactNode }) {
  const styles = {
    error: 'bg-error/8 text-error ring-error/20',
    ok: 'bg-ok/10 text-ok ring-ok/20',
    info: 'bg-ambar/20 text-tinta ring-ambar/40',
  }[tone];
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={`rounded-xl px-4 py-3 text-[0.95rem] ring-1 ring-inset ${styles}`}>
      {children}
    </div>
  );
}

export function Badge({ tone, children }: { tone: 'ok' | 'warn' | 'bad' | 'muted'; children: ReactNode }) {
  const styles = {
    ok: 'bg-ok/12 text-ok',
    warn: 'bg-ambar/30 text-tinta',
    bad: 'bg-error/10 text-error',
    muted: 'bg-tinta/8 text-tinta-suave',
  }[tone];
  return <span className={`inline-block rounded-full px-2.5 py-0.5 text-sm font-semibold ${styles}`}>{children}</span>;
}

export function Loading({ text = 'Cargando…' }: { text?: string }) {
  return (
    <div className="flex items-center gap-3 py-16 text-tinta-suave" role="status">
      <Spinner className="size-5" /> {text}
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-2xl border-2 border-dashed border-linea px-6 py-12 text-center">
      <p className="font-display text-xl font-semibold">{title}</p>
      {children && <div className="mt-2 text-tinta-suave">{children}</div>}
    </div>
  );
}

export function PageTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <h1 className="text-3xl font-bold sm:text-4xl">{children}</h1>
      {action}
    </div>
  );
}
