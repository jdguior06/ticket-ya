import { Link, Navigate, Outlet, useLocation } from 'react-router';
import { homeFor, useAuth } from '../lib/auth';
import type { Role } from '../lib/types';
import { buttonClass } from './ui';

function Logo() {
  return (
    <Link to="/" className="flex items-center gap-2" aria-label="EntradasYa, ir a la cartelera">
      <svg viewBox="0 0 64 64" className="size-7" aria-hidden="true">
        <path fill="currentColor" d="M8 14h48v12a6 6 0 0 0 0 12v12H8V38a6 6 0 0 0 0-12z" />
        <path stroke="var(--color-ambar)" strokeWidth="3" strokeDasharray="3 4" d="M40 16v32" />
      </svg>
      <span className="font-display text-lg font-semibold tracking-tight">EntradasYa</span>
    </Link>
  );
}

const LINKS: Record<Role | 'GUEST', { to: string; label: string }[]> = {
  GUEST: [{ to: '/', label: 'Cartelera' }],
  CUSTOMER: [
    { to: '/', label: 'Cartelera' },
    { to: '/mis-entradas', label: 'Mis entradas' },
    { to: '/mis-compras', label: 'Mis compras' },
  ],
  ORGANIZER: [
    { to: '/organizador', label: 'Mis eventos' },
    { to: '/organizador/personal', label: 'Porteros' },
    { to: '/', label: 'Cartelera' },
  ],
  DOORMAN: [{ to: '/portero', label: 'Control de ingreso' }],
};

const ROLE_LABEL: Record<Role, string> = { CUSTOMER: 'Cliente', ORGANIZER: 'Organizador', DOORMAN: 'Portero' };

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('');
}

export function Layout() {
  const { user, logout } = useAuth();
  const links = LINKS[user?.role ?? 'GUEST'];
  const { pathname } = useLocation();
  // Activa en su página y en sus subpáginas (/organizador/eventos/...), sin que /organizador
  // quede activa en /organizador/personal, que tiene su propio enlace.
  const isActive = (to: string) =>
    to === '/'
      ? pathname === '/' || pathname.startsWith('/eventos/')
      : pathname === to || (pathname.startsWith(`${to}/`) && !links.some((l) => l.to !== to && l.to.startsWith(`${to}/`) && pathname.startsWith(l.to)));
  const navClass = (desktop: boolean, to: string) => {
    const active = isActive(to);
    return desktop
        ? `relative rounded-lg px-3 py-2 text-[0.95rem] font-medium transition-colors ${active ? 'text-tinta' : 'text-tinta-suave hover:text-tinta'}`
        : `shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium ${active ? 'bg-tinta text-white' : 'text-tinta-suave'}`;
  };

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-20 border-b border-linea bg-white/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4 sm:gap-8 sm:px-6">
          <Logo />
          <nav className="hidden h-full items-center gap-1 sm:flex" aria-label="Principal">
            {links.map((l) => (
              <Link key={l.to} to={l.to} className={navClass(true, l.to)} aria-current={isActive(l.to) ? 'page' : undefined}>
                {l.label}
                {isActive(l.to) && <span className="absolute inset-x-3 -bottom-[13px] h-0.5 rounded-full bg-tinta" aria-hidden="true" />}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex shrink-0 items-center gap-2 text-[0.95rem]">
            {user ? (
              <>
                <span className="hidden items-center gap-2.5 md:flex">
                  <span className="grid size-8 place-items-center rounded-full bg-niebla text-xs font-semibold text-tinta" aria-hidden="true">
                    {initials(user.name)}
                  </span>
                  <span className="leading-tight">
                    <span className="block text-sm font-medium">{user.name}</span>
                    <span className="block text-xs text-tinta-suave">{ROLE_LABEL[user.role]}</span>
                  </span>
                </span>
                <button onClick={logout} className={buttonClass('ghost', 'sm', 'md:ml-2')}>
                  Salir
                </button>
              </>
            ) : (
              <>
                <Link to="/login" className="rounded-lg px-3 py-2 font-medium text-tinta-suave hover:text-tinta">
                  Entrar
                </Link>
                <Link to="/registro" className={buttonClass('secondary', 'sm')}>
                  Crear cuenta
                </Link>
              </>
            )}
          </div>
        </div>
        {/* Navegación móvil (solo si hay más de un destino) */}
        {links.length > 1 && (
        <nav className="flex gap-1 overflow-x-auto px-3 pb-2 sm:hidden" aria-label="Principal móvil">
          {links.map((l) => (
            <Link key={l.to} to={l.to} className={navClass(false, l.to)} aria-current={isActive(l.to) ? 'page' : undefined}>
              {l.label}
            </Link>
          ))}
        </nav>
        )}
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 sm:py-12">
        <Outlet />
      </main>
      <footer className="border-t border-linea">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-sm text-tinta-suave sm:px-6">
          <span>EntradasYa, venta de entradas con microservicios</span>
          <Link to="/estado" className="hover:text-tinta hover:underline">
            Estado del sistema
          </Link>
        </div>
      </footer>
    </div>
  );
}

/** Protege rutas por rol. Sin sesión -> login (y vuelve después). */
export function RequireRole({ roles }: { roles: Role[] }) {
  const { user } = useAuth();
  const location = useLocation();
  if (!user) return <Navigate to={`/login?volver=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  if (!roles.includes(user.role)) return <Navigate to={homeFor(user.role)} replace />;
  return <Outlet />;
}
